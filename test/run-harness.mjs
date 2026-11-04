// 하네스를 헤드리스 Chrome으로 돌리고 결과 JSON(+스크린샷)을 받는다.
// node test/run-harness.mjs "<query>" [--shot out.png] [--page N] [--size 1700,1150] [--pdf out.pdf]
// 미리 프로젝트 루트에서 `python3 -m http.server 8765` 실행
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const query = args[0] || '';
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const shot = opt('--shot');
const shots = (opt('--pages') || '').split(',').filter(Boolean);
const [W, H] = (opt('--size') || '1700,1150').split(',').map(Number);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(join(tmpdir(), 'pt-prof-'));

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`,
  `--user-data-dir=${prof}`, `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const t = list.find(x => x.type === 'page');
      if (t) return t;
    } catch (e) { /* 아직 */ }
    await sleep(200);
  }
  throw new Error('chrome did not start');
}

let ws, seq = 0;
const pending = new Map();
function send(method, params) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

try {
  const t = await target();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:8765/${query.startsWith("/") ? query.slice(1) : "test/harness.html?" + query}` });
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    if (await evaluate('document.title').catch(() => '') === 'DONE') break;
    await sleep(500);
  }
  const result = await evaluate('document.getElementById("result").textContent');
  process.stdout.write(result + '\n');
  const capture = async file => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(file, Buffer.from(r.data, 'base64'));
  };
  if (shot && !shots.length) await capture(shot);
  // --pdf out.pdf : 'PDF로 저장'과 같은 인쇄 모드로 PDF를 만든다
  const pdf = opt('--pdf');
  if (pdf) {
    await evaluate('PTApp._printMode(true)');
    const r = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
    writeFileSync(pdf, Buffer.from(r.data, 'base64'));
    await evaluate('PTApp._printMode(false)');
  }
  for (const n of shots) {
    await evaluate(`(() => { const r = document.getElementById('pretypeset-host').shadowRoot; const w = r.querySelector('.pt-wrap[data-n="${n}"]'); const v = r.querySelector('.pt-viewer'); if (w) v.scrollTop += w.getBoundingClientRect().top - v.getBoundingClientRect().top - 10; return !!w; })()`);
    await sleep(400);
    await capture(shot.replace(/\.png$/, '') + '-' + n + '.png');
  }
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  chrome.kill();
  await sleep(300);
  try { rmSync(prof, { recursive: true, force: true }); } catch (e) { /* */ }
}
