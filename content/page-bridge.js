// 메인 월드 브리지: Docs 내부 텍스트 모델(커서·선택)을 콘텐츠 스크립트에 전달한다.
// _docs_annotate_getAnnotatedText(id) 사용 방식은 Toytype과 같다.
(function () {
  'use strict';
  if (window.__ptPageBridge) return;
  window.__ptPageBridge = true;

  const TOYTYPE_ID = 'gaampopggbpabdfceaappkbkknaikfph';
  let cached = null;

  function safeGet(obj, key) { try { return obj[key]; } catch (e) { return undefined; } }

  async function annotated(ids) {
    if (cached) return cached;
    const fn = safeGet(window, '_docs_annotate_getAnnotatedText');
    if (typeof fn !== 'function') throw new Error('annotated text API unavailable');
    let last = null;
    for (const id of ids) {
      try {
        const obj = await fn(id);
        if (obj && typeof obj.getText === 'function' && typeof obj.setSelection === 'function') {
          cached = obj;
          return obj;
        }
      } catch (e) { last = e; }
    }
    throw last || new Error('annotated text object unavailable');
  }

  function candidates(data) {
    const out = [];
    const add = v => { if (typeof v === 'string' && v && !out.includes(v)) out.push(v); };
    add(data.extensionId);
    add(TOYTYPE_ID);
    const m = location.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    add(m && m[1]);
    add('docs');
    add('kix');
    return out;
  }

  async function call(obj, name, args) {
    try {
      return await obj[name].apply(obj, args || []);
    } catch (e) {
      if (cached === obj) cached = null;
      throw e;
    }
  }

  function selOf(sel) {
    if (!Array.isArray(sel) || !sel.length) return null;
    const s = sel[0] || {};
    return typeof s.start === 'number' ? { start: s.start, end: typeof s.end === 'number' ? s.end : s.start } : null;
  }

  window.addEventListener('message', async event => {
    const data = event.data;
    if (event.source !== window || !data || data.kind !== 'pt:model-request') return;
    const reply = payload => window.postMessage(Object.assign({ kind: 'pt:model-response', requestId: data.requestId }, payload), '*');
    try {
      const obj = await annotated(candidates(data));
      if (data.action === 'getText') {
        const text = await call(obj, 'getText');
        reply({ ok: true, text: typeof text === 'string' ? text : '', selection: selOf(await call(obj, 'getSelection')) });
      } else if (data.action === 'getSelection') {
        reply({ ok: true, selection: selOf(await call(obj, 'getSelection')) });
      } else if (data.action === 'setSelection') {
        await call(obj, 'setSelection', [data.start, data.end]);
        reply({ ok: true });
      } else {
        reply({ ok: false, error: 'unknown action' });
      }
    } catch (e) {
      reply({ ok: false, error: String(e && e.message || e) });
    }
  });

  window.postMessage({ kind: 'pt:page-bridge-ready' }, '*');
})();
