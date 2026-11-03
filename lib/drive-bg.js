// (백그라운드) 구글 드라이브: 로그인된 브라우저 세션으로 폴더 목록을 읽고 파일을 내려받는다.
// 폴더 목록은 embeddedfolderview 페이지(gdown과 같은 방식), 다운로드는 drive.usercontent.google.com.
'use strict';

const DRIVE_CHUNK = 1 << 20; // 1MB 단위로 콘텐츠 스크립트에 넘긴다

function parseDriveUrl(url) {
  const s = String(url || '').trim();
  let m = s.match(/\/folders\/([-\w]{20,})/);
  if (m) return { kind: 'folder', id: m[1] };
  if (/folderview/.test(s) && (m = s.match(/[?&]id=([-\w]{20,})/))) return { kind: 'folder', id: m[1] };
  m = s.match(/\/file\/d\/([-\w]{20,})/) || s.match(/[?&]id=([-\w]{20,})/);
  if (m) return { kind: 'file', id: m[1] };
  if (/^[-\w]{25,}$/.test(s)) return { kind: 'folder', id: s };
  return null;
}

function decodeHtml(s) {
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .trim();
}

async function listDriveFolder(id) {
  const res = await fetch('https://drive.google.com/embeddedfolderview?id=' + encodeURIComponent(id), { credentials: 'include' });
  if (!res.ok) throw new Error('폴더를 열 수 없습니다 (HTTP ' + res.status + '). 크롬에서 이 폴더를 볼 수 있는 계정으로 로그인했는지 확인하세요.');
  const html = await res.text();
  if (/accounts\.google\.com\/(ServiceLogin|signin)/.test(res.url) || /<form[^>]+accounts\.google\.com/.test(html)) {
    throw new Error('구글에 로그인되어 있지 않거나 이 폴더에 권한이 없습니다.');
  }
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1].replace(/&amp;/g, '&');
    const inner = m[2];
    const t = inner.match(/class="flip-entry-title"[^>]*>([\s\S]*?)<\/div>/);
    const name = decodeHtml(t ? t[1] : inner);
    let f = href.match(/\/file\/d\/([-\w]{20,})/);
    if (f && !seen.has(f[1])) { seen.add(f[1]); out.push({ id: f[1], name, folder: false }); continue; }
    f = href.match(/\/drive\/(?:u\/\d+\/)?folders\/([-\w]{20,})/);
    if (f && f[1] !== id && !seen.has(f[1])) { seen.add(f[1]); out.push({ id: f[1], name, folder: true }); }
  }
  return { name: decodeHtml(title), files: out };
}

// 하위 폴더까지(깊이 2) 펼친다. path는 "Document fonts/xxx.otf" 꼴
async function listDriveTree(id, depth, prefix) {
  const { name, files } = await listDriveFolder(id);
  const out = [];
  for (const f of files) {
    const path = (prefix ? prefix + '/' : '') + f.name;
    if (f.folder) {
      if (depth > 0) out.push(...(await listDriveTree(f.id, depth - 1, path)).files);
    } else {
      out.push({ id: f.id, name: f.name, path });
    }
  }
  return { name, files: out };
}

async function fetchDriveFile(id) {
  const tries = [
    'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(id) + '&export=download&confirm=t',
    'https://drive.google.com/uc?export=download&confirm=t&id=' + encodeURIComponent(id)
  ];
  let lastErr = null;
  for (let url of tries) {
    for (let hop = 0; hop < 3; hop++) {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) { lastErr = new Error('HTTP ' + res.status); break; }
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.indexOf('text/html') === -1) return await res.arrayBuffer();
      // 바이러스 검사 확인 페이지 → 폼 주소로 다시
      const html = await res.text();
      const form = html.match(/<form[^>]+id="download-form"[^>]+action="([^"]+)"[\s\S]*?<\/form>/);
      if (!form) { lastErr = new Error('다운로드 확인 페이지를 읽지 못했습니다'); break; }
      const u = new URL(form[1].replace(/&amp;/g, '&'));
      for (const inp of form[0].matchAll(/<input[^>]+type="hidden"[^>]*>/g)) {
        const n = (inp[0].match(/name="([^"]+)"/) || [])[1];
        const v = (inp[0].match(/value="([^"]*)"/) || [])[1];
        if (n) u.searchParams.set(n, (v || '').replace(/&amp;/g, '&'));
      }
      url = u.toString();
    }
  }
  throw lastErr || new Error('파일을 받지 못했습니다');
}

function toBase64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'pt-drive') return;
  port.onMessage.addListener(async msg => {
    const reply = o => { try { port.postMessage(Object.assign({ req: msg.req }, o)); } catch (e) { /* 끊김 */ } };
    try {
      if (msg.op === 'list') {
        const target = parseDriveUrl(msg.url);
        if (!target) throw new Error('구글 드라이브 폴더/파일 링크가 아닙니다.');
        if (target.kind === 'file') { reply({ ok: true, name: '', files: [{ id: target.id, name: msg.name || '', path: msg.name || '' }] }); return; }
        const tree = await listDriveTree(target.id, 2, '');
        reply({ ok: true, name: tree.name, files: tree.files });
      } else if (msg.op === 'get') {
        const u8 = new Uint8Array(await fetchDriveFile(msg.id));
        const total = Math.ceil(u8.length / DRIVE_CHUNK) || 1;
        for (let i = 0; i < total; i++) {
          reply({ chunk: toBase64(u8.subarray(i * DRIVE_CHUNK, (i + 1) * DRIVE_CHUNK)), seq: i, total, size: u8.length });
        }
        reply({ ok: true, done: true, size: u8.length });
      }
    } catch (e) {
      reply({ ok: false, error: String(e && e.message || e) });
    }
  });
});
