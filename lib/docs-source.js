// Google Docs HTML export → 조판용 블록 목록.
// 블록 key: title, subtitle, h1~h6, normal, li, ol, code, box, table, footnote, image
(function (g) {
  'use strict';

  const FETCH_TIMEOUT = 30000;
  const MONO_RE = /consolas|courier|mono|menlo|monaco|d2coding|source code|fira code|jetbrains|inconsolata|코딩/i;

  function docIdFromLocation(loc) {
    const m = (loc.pathname || '').match(/\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }

  function exportUrl(docId, format) {
    const account = location.pathname.match(/\/document\/u\/(\d+)\//);
    return 'https://docs.google.com/document/' + (account ? 'u/' + account[1] + '/' : '') +
      'd/' + encodeURIComponent(docId) + '/export?format=' + encodeURIComponent(format);
  }

  async function fetchDocsHtml(docId) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(exportUrl(docId, 'html'), { signal: ctrl.signal, credentials: 'include' });
      if (!res.ok) throw new Error('문서 내보내기 실패 (HTTP ' + res.status + ')');
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.indexOf('html') === -1) throw new Error('예상하지 못한 응답 형식: ' + ct);
      const text = await res.text();
      return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    } finally {
      clearTimeout(timer);
    }
  }

  function parseDecl(text) {
    const o = {};
    for (const part of String(text || '').split(';')) {
      const i = part.indexOf(':');
      if (i < 0) continue;
      o[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
    }
    return o;
  }

  function parseCssClasses(styleText) {
    const map = new Map();
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(styleText))) {
      const decl = parseDecl(m[2]);
      for (let sel of m[1].split(',')) {
        sel = sel.trim();
        const cm = sel.match(/^\.([A-Za-z0-9_-]+)$/);
        if (cm) map.set(cm[1], Object.assign(map.get(cm[1]) || {}, decl));
      }
    }
    return map;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    return str.length + ':' + h.toString(36);
  }

  function parseDocsHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const styleText = Array.from(doc.querySelectorAll('style')).map(s => s.textContent).join('\n');
    const classMap = parseCssClasses(styleText);
    const declsOf = el => {
      const o = {};
      for (const c of el.classList) Object.assign(o, classMap.get(c) || {});
      const inline = el.getAttribute('style');
      if (inline) Object.assign(o, parseDecl(inline));
      return o;
    };

    const body = doc.body;
    const bodyDecl = declsOf(body);
    const mw = (bodyDecl['max-width'] || '').match(/([\d.]+)pt/);
    const contentWidthPt = mw ? parseFloat(mw[1]) : 468;

    // 댓글 본문 제거
    for (const a of Array.from(body.querySelectorAll('a[id^="cmnt"]'))) {
      if (/^cmnt_ref/.test(a.id)) continue;
      let d = a.closest('div');
      while (d && d.parentElement && d.parentElement !== body) d = d.parentElement.closest('div');
      if (d && d.parentElement === body) d.remove();
    }

    const blocks = [];
    const listCounters = new Map();

    function inline(node, ctx, acc) {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          const t = child.nodeValue.replace(/[\r\n]+/g, ' ');
          if (!t) continue;
          const visible = t.replace(/\s/g, '').length;
          acc.text += t;
          acc.chars += visible;
          if (ctx.mono) acc.monoChars += visible;
          acc.html += esc(t);
          continue;
        }
        if (child.nodeType !== 1) continue;
        const tag = child.localName;
        if (tag === 'br') { acc.html += '<br>'; acc.text += '\n'; continue; }
        if (tag === 'img') { acc.images.push(imageInfo(child)); continue; }
        if (tag === 'sup' && child.querySelector('a[href^="#cmnt"]')) continue;
        if (tag === 'a') {
          const href = child.getAttribute('href') || '';
          if (/^#cmnt/.test(href)) continue;
          if (/^#ftnt\d/.test(href)) {
            const label = child.textContent.replace(/[\[\]]/g, '');
            acc.html += '<sup class="pt-fnref">' + esc(label) + '</sup>';
            acc.text += label;
            continue;
          }
        }
        const d = declsOf(child);
        const isMono = MONO_RE.test(d['font-family'] || '');
        const wraps = [];
        const fw = d['font-weight'];
        if (fw && (fw === 'bold' || parseInt(fw, 10) >= 600)) wraps.push('b');
        if (d['font-style'] === 'italic') wraps.push('i');
        if (/underline/.test(d['text-decoration'] || '') && !ctx.link && tag !== 'a') wraps.push('u');
        if (/line-through/.test(d['text-decoration'] || '')) wraps.push('s');
        if (d['vertical-align'] === 'super') wraps.push('sup');
        else if (d['vertical-align'] === 'sub') wraps.push('sub');
        if (isMono && !ctx.mono) wraps.push('code');
        for (const w of wraps) acc.html += '<' + w + '>';
        inline(child, { mono: ctx.mono || isMono, link: ctx.link || tag === 'a' }, acc);
        for (let i = wraps.length - 1; i >= 0; i--) acc.html += '</' + wraps[i] + '>';
      }
      return acc;
    }

    function imageInfo(img) {
      const own = parseDecl(img.getAttribute('style'));
      const wrap = img.parentElement && img.parentElement.localName === 'span' ? parseDecl(img.parentElement.getAttribute('style')) : {};
      const px = v => { const m = String(v || '').match(/([\d.]+)px/); return m ? parseFloat(m[1]) : 0; };
      const w = px(wrap.width) || px(own.width);
      const h = px(wrap.height) || px(own.height);
      return { src: img.getAttribute('src') || '', w, h, alt: img.getAttribute('alt') || '' };
    }

    function collect(el) {
      return inline(el, { mono: false, link: false }, { html: '', text: '', chars: 0, monoChars: 0, images: [] });
    }

    function pushParagraph(el, key, extra) {
      const acc = collect(el);
      const text = acc.text.replace(/ /g, ' ');
      let k = key;
      let htmlOut = acc.html;
      if (acc.chars > 0 && acc.monoChars / acc.chars > 0.9 && (key === 'normal' || key === 'box')) {
        k = 'code';
        htmlOut = htmlOut.replace(/<\/?code>/g, '');
      }
      if (text.trim()) {
        blocks.push(Object.assign({ kind: 'p', key: k, html: htmlOut, text: text.trim() }, extra || {}));
      } else if (!acc.images.length) {
        blocks.push({ kind: 'empty', key: k });
      }
      for (const im of acc.images) {
        if (!im.src) continue;
        blocks.push({ kind: 'image', key: 'image', src: im.src, ratio: Math.min(1, (im.w * 0.75) / contentWidthPt) || 1, w: im.w, h: im.h });
      }
    }

    function listInfo(listEl, li) {
      const cls = Array.from(listEl.classList).find(c => /^lst-kix_/.test(c)) || '';
      const m = cls.match(/^lst-kix_(.+)-(\d+)$/);
      const id = m ? m[1] : cls;
      const level = m ? parseInt(m[2], 10) : 0;
      const ordered = listEl.localName === 'ol';
      if (!ordered) return { level, marker: ['•', '◦', '▪'][level % 3], ordered };
      const key = id + ':' + level;
      if (listEl.hasAttribute('start') && li === listEl.firstElementChild) {
        listCounters.set(key, parseInt(listEl.getAttribute('start'), 10) - 1 || 0);
      }
      const n = (listCounters.get(key) || 0) + 1;
      listCounters.set(key, n);
      for (const k of Array.from(listCounters.keys())) {
        const [kid, kl] = k.split(':');
        if (kid === id && parseInt(kl, 10) > level) listCounters.delete(k);
      }
      return { level, marker: n + '.', ordered };
    }

    function pushTable(table) {
      const rows = Array.from(table.rows);
      if (!rows.length) return;
      if (rows.length === 1 && rows[0].cells.length === 1) {
        // 1×1 표 = 코드/박스로 본다.
        const cell = rows[0].cells[0];
        const paras = Array.from(cell.children).filter(c => /^(p|h[1-6]|ul|ol)$/.test(c.localName));
        const start = blocks.length;
        for (const p of paras) {
          if (p.localName === 'ul' || p.localName === 'ol') {
            for (const li of p.children) pushParagraph(li, 'box', { list: listInfo(p, li) });
          } else {
            pushParagraph(p, 'box');
          }
        }
        // 박스 안 블록 중 하나라도 코드면 박스 전체를 코드로 통일
        const slice = blocks.slice(start);
        const isCode = slice.some(b => b.key === 'code') && slice.filter(b => b.kind === 'p').every(b => b.key === 'code' || !b.text);
        for (const b of slice) {
          if (b.kind === 'empty' || b.kind === 'p') b.key = isCode ? 'code' : b.key;
          b.boxed = true;
        }
        if (slice.length) { slice[0].boxStart = true; slice[slice.length - 1].boxEnd = true; }
        return;
      }
      const out = rows.map(tr => Array.from(tr.cells).map(td => {
        const parts = Array.from(td.children).map(c => collect(c).html).filter(h => h.trim());
        return { html: parts.join('<br>'), colspan: td.colSpan || 1, rowspan: td.rowSpan || 1 };
      }));
      blocks.push({ kind: 'table', key: 'table', rows: out, text: '' });
    }

    function walkContainer(container, footnote) {
      for (const el of Array.from(container.children)) {
        const tag = el.localName;
        if (tag === 'p') {
          let key = el.classList.contains('title') ? 'title' : el.classList.contains('subtitle') ? 'subtitle' : 'normal';
          if (footnote) key = 'footnote';
          pushParagraph(el, key);
        } else if (/^h[1-6]$/.test(tag)) {
          pushParagraph(el, footnote ? 'footnote' : tag);
        } else if (tag === 'ul' || tag === 'ol') {
          for (const li of Array.from(el.children)) {
            const info = listInfo(el, li);
            pushParagraph(li, footnote ? 'footnote' : (info.ordered ? 'ol' : 'li'), { list: info });
          }
        } else if (tag === 'table') {
          pushTable(el);
        } else if (tag === 'hr') {
          const st = el.getAttribute('style') || '';
          if (/page-break-before/.test(st)) blocks.push({ kind: 'break' });
        } else if (tag === 'div') {
          walkContainer(el, footnote);
        }
      }
    }

    // 본문 / 머리글·바닥글 / 각주 구분
    const children = Array.from(body.children);
    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      if (el.localName === 'div') {
        const isFootnote = !!el.querySelector('a[id^="ftnt"]:not([id^="ftnt_ref"])');
        if (isFootnote) { walkContainer(el, true); continue; }
        // 문서 맨 앞/맨 뒤 div = 머리글/바닥글 → 조판 원고에서 제외
        const before = children.slice(0, i).some(c => c.localName !== 'div');
        const after = children.slice(i + 1).some(c => c.localName !== 'div');
        if (!before || !after) continue;
        walkContainer(el, false);
        continue;
      }
      walkContainer({ children: [el] }, false);
    }

    const titleEl = doc.querySelector('title');
    return { title: titleEl ? titleEl.textContent : '', blocks, contentWidthPt, hash: hash(html) };
  }

  g.PTDocs = { docIdFromLocation, exportUrl, fetchDocsHtml, parseDocsHtml, hash };
})(globalThis);
