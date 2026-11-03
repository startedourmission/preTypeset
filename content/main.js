// preTypeset — Google Docs 오른쪽 조판 미리보기 패널
(function () {
  'use strict';
  if (window.__preTypesetLoaded) return;
  window.__preTypesetLoaded = true;

  const { PTIdml, PTDocs, PTStyle, PTLayout, PTDefaults } = globalThis;
  const PX_PER_PT = 96 / 72;
  const MM = 25.4 / 72;

  const KEY_LABEL = {
    title: '제목 (Title)', subtitle: '부제목', h1: '제목 1', h2: '제목 2', h3: '제목 3', h4: '제목 4', h5: '제목 5', h6: '제목 6',
    normal: '일반 텍스트', li: '글머리 목록', ol: '번호 목록', code: '코드', box: '박스 (1×1 표)', table: '표',
    footnote: '각주', image: '그림'
  };
  const KEY_ORDER = Object.keys(KEY_LABEL);
  const HEADING_KEYS = new Set(['title', 'subtitle', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

  const DEFAULT_OPTS = {
    width: Math.round(Math.min(720, Math.max(420, window.innerWidth * 0.42))),
    spread: true, zoom: 1, wordBreak: 'keep-all', skipEmpty: true, grid: false,
    startPage: 1, autoRefresh: true, push: true
  };

  // ---------- 저장소 ----------
  const store = {
    get: keys => new Promise(r => chrome.storage.local.get(keys, r)),
    set: obj => new Promise(r => chrome.storage.local.set(obj, r)),
    remove: keys => new Promise(r => chrome.storage.local.remove(keys, r))
  };
  const K = {
    opts: 'pt:opts', index: 'pt:templates', last: 'pt:last',
    tpl: id => 'pt:tpl:' + id, map: id => 'pt:map:' + id, doc: id => 'pt:doc:' + id
  };

  // ---------- 상태 ----------
  const S = {
    open: false, built: false,
    docId: PTDocs.docIdFromLocation(location),
    opts: Object.assign({}, DEFAULT_OPTS),
    index: {},
    tplId: null, tpl: null, mapping: {},
    styleById: new Map(), clsById: new Map(), fallback: {},
    doc: null, run: 0, laying: false, pages: [], wraps: [],
    carry: {}, missingFonts: [], editTimer: null, lastError: ''
  };

  // ---------- 유틸 ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid);
    return el;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mm = pt => Math.round(pt * MM * 10) / 10;
  const r1 = v => Math.round(v * 10) / 10;

  // ---------- UI ----------
  let host, shadow, ui = {};

  const PANEL_CSS = `
:host{all:initial}
*{box-sizing:border-box}
.pt-panel{position:fixed;top:0;right:0;bottom:0;width:var(--w,560px);display:flex;flex-direction:column;background:#e9eaee;border-left:1px solid #c4c7cc;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#1f1f1f;overflow:hidden}
.pt-resize{position:absolute;left:-3px;top:0;bottom:0;width:7px;cursor:col-resize;z-index:3}
.pt-resize:hover,.pt-resizing .pt-resize{background:rgba(26,115,232,.35)}
.pt-head{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#fff;border-bottom:1px solid #dadce0;flex:none}
.pt-logo{font-weight:700;font-size:13px;letter-spacing:-.2px;margin-right:2px;white-space:nowrap}
.pt-logo b{color:#1a73e8}
.pt-sel{min-width:0;flex:1;height:28px;border:1px solid #dadce0;border-radius:6px;background:#fff;font:inherit;font-size:12px;padding:0 6px;color:#1f1f1f}
.pt-btn{flex:none;height:28px;min-width:28px;padding:0 8px;border:1px solid #dadce0;border-radius:6px;background:#fff;color:#3c4043;font:inherit;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap}
.pt-btn:hover{background:#f1f3f4}
.pt-btn.pt-on{background:#e8f0fe;color:#174ea6;border-color:#aecbfa}
.pt-btn.pt-primary{background:#1a73e8;color:#fff;border-color:#1a73e8}
.pt-btn.pt-primary:hover{background:#1765cc}
.pt-btn svg{width:15px;height:15px;display:block}
.pt-sep{width:1px;height:18px;background:#dadce0;flex:none}
.pt-zoom{font-size:11px;color:#5f6368;min-width:34px;text-align:center;flex:none}
.pt-drawer{flex:none;max-height:55%;overflow:auto;background:#fff;border-bottom:1px solid #dadce0;padding:10px 12px;display:none}
.pt-drawer.pt-show{display:block}
.pt-drawer h4{margin:12px 0 6px;font-size:12px;color:#5f6368;font-weight:600}
.pt-drawer h4:first-child{margin-top:0}
.pt-map{width:100%;border-collapse:collapse;font-size:12px}
.pt-map td{padding:3px 0;vertical-align:middle}
.pt-map td:first-child{width:38%;color:#3c4043;padding-right:8px}
.pt-map .pt-count{color:#9aa0a6;font-size:11px;margin-left:4px}
.pt-map select{width:100%;height:26px;border:1px solid #dadce0;border-radius:5px;font:inherit;font-size:12px;background:#fff}
.pt-opts{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;font-size:12px}
.pt-opts label{display:flex;align-items:center;gap:6px;color:#3c4043}
.pt-opts input[type=number]{width:56px;height:24px;border:1px solid #dadce0;border-radius:5px;font:inherit;padding:0 4px}
.pt-opts select{height:24px;border:1px solid #dadce0;border-radius:5px;font:inherit;font-size:12px}
.pt-info{font-size:12px;color:#3c4043;line-height:1.6}
.pt-info .pt-k{color:#80868b;display:inline-block;min-width:64px}
.pt-font-ok{color:#188038}.pt-font-miss{color:#d93025}
.pt-viewer{flex:1;overflow:auto;padding:18px 16px 40px;position:relative}
.pt-pages{display:flex;flex-direction:column;align-items:center;width:max-content;min-width:100%}
.pt-row{display:flex;justify-content:center;margin-bottom:26px}
.pt-wrap{position:relative;flex:none;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.18),0 2px 10px rgba(0,0,0,.08)}
.pt-wrap.pt-spacer{background:transparent;box-shadow:none}
.pt-wrap>.pt-page{position:absolute;left:0;top:0;transform-origin:0 0}
.pt-wrap::after{content:attr(data-n);position:absolute;left:0;right:0;bottom:-18px;text-align:center;font-size:10px;color:#80868b}
.pt-wrap.pt-has-overset{outline:2px solid #d93025;outline-offset:2px}
.pt-empty{max-width:380px;margin:40px auto;text-align:center;color:#5f6368;line-height:1.7}
.pt-empty b{color:#1f1f1f}
.pt-empty .pt-btn{margin:10px 4px 0}
.pt-error{margin:12px auto;max-width:420px;padding:10px 12px;border-radius:8px;background:#fce8e6;color:#a50e0e;font-size:12px}
.pt-drop{position:absolute;inset:8px;border:2px dashed #1a73e8;border-radius:12px;background:rgba(232,240,254,.85);display:none;align-items:center;justify-content:center;font-weight:600;color:#174ea6;z-index:4}
.pt-dragging .pt-drop{display:flex}
.pt-foot{flex:none;display:flex;align-items:center;gap:8px;padding:6px 12px;background:#fff;border-top:1px solid #dadce0;font-size:11px;color:#5f6368;min-height:28px}
.pt-foot .pt-stat{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pt-foot .pt-warn{color:#d93025}
.pt-busy{width:10px;height:10px;border-radius:50%;border:2px solid #aecbfa;border-top-color:#1a73e8;animation:pt-spin .8s linear infinite;display:none;flex:none}
.pt-laying .pt-busy{display:block}
@keyframes pt-spin{to{transform:rotate(360deg)}}
.pt-measure{position:absolute;left:-200000px;top:0;visibility:hidden;pointer-events:none}

/* ---- 조판 페이지 ---- */
.pt-page{position:relative;background:#fff;overflow:hidden;color:#000;font-size:10pt;line-height:normal;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased;font-kerning:normal;hyphens:manual;overflow-wrap:anywhere;cursor:default}
.pt-page.pt-wb-keep-all{word-break:keep-all}
.pt-page.pt-wb-normal{word-break:normal}
.pt-frame{position:absolute;display:flex}
.pt-col{flex:none;height:100%;overflow:hidden;display:flex;flex-direction:column;position:relative}
.pt-col>*{flex:none;margin:0;box-sizing:border-box}
.pt-col>.pt-first{padding-top:0!important}
.pt-col>.pt-first.pt-boxed.pt-box-start{padding-top:4pt!important}
.pt-cont{text-indent:0!important;padding-top:0!important}
.pt-broken{padding-bottom:0!important}
.pt-marker{display:inline-block;width:1.2em;margin-left:-1.2em;text-indent:0}
.pt-li{text-indent:0!important}
.pt-code{white-space:pre-wrap;word-break:break-all!important;overflow-wrap:anywhere}
.pt-page code{font-family:"D2Coding","Menlo","Consolas",monospace;font-size:.92em}
.pt-page sup{font-size:.65em;line-height:0;vertical-align:.45em}
.pt-page sub{font-size:.65em;line-height:0;vertical-align:-.2em}
.pt-boxed{border-left:.5pt solid rgba(0,0,0,.25);border-right:.5pt solid rgba(0,0,0,.25)}
.pt-boxed.pt-box-start{border-top:.5pt solid rgba(0,0,0,.25);padding-top:4pt}
.pt-boxed.pt-box-end{border-bottom:.5pt solid rgba(0,0,0,.25);padding-bottom:4pt}
.pt-col>.pt-boxed.pt-box-end+*:not(.pt-boxed){margin-top:6pt}
.pt-col>*:not(.pt-boxed)+.pt-boxed.pt-box-start{margin-top:6pt}
.pt-img{text-indent:0!important}
.pt-img img{display:inline-block;max-width:100%;height:auto;max-height:var(--colh);object-fit:contain;vertical-align:top}
.pt-table{border-collapse:collapse;width:100%;text-indent:0!important}
.pt-table td{border:.5pt solid #555;padding:2pt 3pt;vertical-align:top;text-align:left}
.pt-table tr:first-child td{background:rgba(0,0,0,.06);font-weight:600}
.pt-table.pt-cont tr:first-child td{background:none;font-weight:inherit}
.pt-empty-para{min-height:1lh}
.pt-overset{outline:1.5pt solid #d93025;outline-offset:-1.5pt}
.pt-shapes{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.pt-mframe{position:absolute;display:flex;flex-direction:column;overflow:visible}
.pt-mframe>div{text-indent:0;padding-top:0;padding-bottom:0;white-space:pre-wrap}
.pt-grid{position:absolute;pointer-events:none}
`;

  const ICON = {
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    spread: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2.5" y="5" width="9.5" height="14" rx="1"/><rect x="12" y="5" width="9.5" height="14" rx="1"/></svg>',
    single: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="6.5" y="3.5" width="11" height="17" rx="1"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  function iconBtn(name, title, onclick) {
    const b = h('button', { class: 'pt-btn', title, 'aria-label': title, onclick });
    b.innerHTML = ICON[name];
    return b;
  }

  function buildUi() {
    if (S.built) return;
    S.built = true;
    host = h('div', { id: 'pretypeset-host' });
    host.style.cssText = 'position:fixed;top:0;right:0;bottom:0;z-index:980;display:none';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.append(h('style', { text: PANEL_CSS }));
    ui.dyn = h('style');
    shadow.append(ui.dyn);

    ui.file = h('input', { type: 'file', accept: '.idml,.indd', style: 'display:none', onchange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); } });
    ui.tplSel = h('select', { class: 'pt-sel', title: '내지 템플릿', onchange: e => selectTemplate(e.target.value) });
    ui.spreadBtn = iconBtn('spread', '펼침면 / 낱쪽 보기', () => { S.opts.spread = !S.opts.spread; saveOpts(); syncHeader(); rebuildRows(); });
    ui.zoomLbl = h('span', { class: 'pt-zoom' });
    ui.gearBtn = iconBtn('gear', '스타일 매핑 · 설정', () => { ui.drawer.classList.toggle('pt-show'); ui.gearBtn.classList.toggle('pt-on'); renderDrawer(); });
    const upBtn = iconBtn('upload', 'IDML 내지 올리기', () => ui.file.click());
    const refBtn = iconBtn('refresh', '원고 다시 불러오기', () => refresh(true));
    const zoomOut = h('button', { class: 'pt-btn', title: '축소', onclick: () => setZoom(S.opts.zoom / 1.2) }, '−');
    const zoomIn = h('button', { class: 'pt-btn', title: '확대', onclick: () => setZoom(S.opts.zoom * 1.2) }, '+');
    ui.zoomLbl.addEventListener('click', () => setZoom(1));
    ui.zoomLbl.title = '폭에 맞추기';
    ui.zoomLbl.style.cursor = 'pointer';
    const closeBtn = iconBtn('close', '닫기', () => toggle(false));

    ui.drawer = h('div', { class: 'pt-drawer' });
    ui.pages = h('div', { class: 'pt-pages' });
    ui.viewer = h('div', { class: 'pt-viewer' }, ui.pages, h('div', { class: 'pt-drop' }, 'IDML 파일을 여기에 놓으세요'));
    ui.measure = h('div', { class: 'pt-measure' });
    ui.stat = h('span', { class: 'pt-stat' });
    ui.foot = h('div', { class: 'pt-foot' }, h('span', { class: 'pt-busy' }), ui.stat);
    ui.resize = h('div', { class: 'pt-resize', title: '드래그해서 폭 조절' });
    ui.panel = h('div', { class: 'pt-panel' },
      ui.resize,
      h('div', { class: 'pt-head' },
        h('span', { class: 'pt-logo' }),
        ui.tplSel, upBtn, h('span', { class: 'pt-sep' }), refBtn, ui.spreadBtn,
        zoomOut, ui.zoomLbl, zoomIn, ui.gearBtn, closeBtn, ui.file),
      ui.drawer, ui.viewer, ui.foot, ui.measure);
    ui.panel.querySelector('.pt-logo').innerHTML = 'pre<b>Typeset</b>';
    shadow.append(ui.panel);
    document.documentElement.append(host);

    // Docs 단축키가 패널 입력을 가로채지 않도록
    for (const t of ['keydown', 'keyup', 'keypress', 'paste', 'copy', 'cut']) host.addEventListener(t, e => e.stopPropagation());

    // 폭 조절
    ui.resize.addEventListener('mousedown', e => {
      e.preventDefault();
      ui.panel.classList.add('pt-resizing');
      const move = ev => {
        const w = Math.round(Math.min(window.innerWidth * 0.85, Math.max(320, window.innerWidth - ev.clientX)));
        S.opts.width = w;
        applyWidth(false);
      };
      const up = () => {
        window.removeEventListener('mousemove', move, true);
        window.removeEventListener('mouseup', up, true);
        ui.panel.classList.remove('pt-resizing');
        applyWidth(true);
        saveOpts();
      };
      window.addEventListener('mousemove', move, true);
      window.addEventListener('mouseup', up, true);
    });

    // 드래그 앤 드롭
    ui.viewer.addEventListener('dragover', e => { e.preventDefault(); ui.panel.classList.add('pt-dragging'); });
    ui.viewer.addEventListener('dragleave', e => { if (e.target === ui.viewer.querySelector('.pt-drop')) ui.panel.classList.remove('pt-dragging'); });
    ui.viewer.addEventListener('drop', e => {
      e.preventDefault();
      ui.panel.classList.remove('pt-dragging');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) importFile(f);
    });

    new ResizeObserver(() => rescale()).observe(ui.viewer);
  }

  // ---------- Docs 화면 밀기 ----------
  let pushStyle = null;
  function applyWidth(final) {
    if (!host) return;
    host.style.width = S.opts.width + 'px';
    ui.panel.style.setProperty('--w', S.opts.width + 'px');
    const on = S.open && S.opts.push;
    if (!pushStyle) {
      pushStyle = h('style', { id: 'pretypeset-push' });
      pushStyle.textContent = 'html.pt-push body{width:calc(100% - var(--pt-w,0px))!important;min-width:0!important}';
      document.head.append(pushStyle);
    }
    document.documentElement.style.setProperty('--pt-w', S.opts.width + 'px');
    document.documentElement.classList.toggle('pt-push', on);
    if (final) window.dispatchEvent(new Event('resize'));
  }

  // ---------- 열기/닫기 ----------
  async function toggle(force) {
    const next = typeof force === 'boolean' ? force : !S.open;
    if (next === S.open) return;
    S.open = next;
    if (next) {
      buildUi();
      host.style.display = 'block';
      applyWidth(true);
      syncHeader();
      if (!S.tpl) await chooseInitialTemplate();
      refresh(false);
    } else {
      host.style.display = 'none';
      applyWidth(true);
      S.run++;
    }
  }

  // ---------- 템플릿 ----------
  async function chooseInitialTemplate() {
    const got = await store.get([K.doc(S.docId), K.last]);
    const id = got[K.doc(S.docId)] || got[K.last] || PTDefaults.BUILTIN.id;
    await loadTemplate(id);
  }

  async function loadTemplate(id) {
    let tpl = null;
    if (id === PTDefaults.BUILTIN.id) tpl = PTDefaults.BUILTIN;
    else {
      const got = await store.get([K.tpl(id), K.map(id)]);
      tpl = got[K.tpl(id)] || null;
      if (tpl) S.mapping = got[K.map(id)] || PTDefaults.guessMapping(tpl);
    }
    if (!tpl) { tpl = PTDefaults.BUILTIN; id = tpl.id; }
    if (tpl.builtin) {
      const got = await store.get(K.map(id));
      S.mapping = got[K.map(id)] || PTDefaults.guessMapping(tpl);
    }
    S.tpl = tpl;
    S.tplId = id;
    prepareStyles();
    syncHeader();
    renderDrawer();
  }

  async function selectTemplate(id) {
    await loadTemplate(id);
    await store.set({ [K.doc(S.docId)]: id, [K.last]: id });
    relayout();
  }

  async function importFile(file) {
    if (/\.indd$/i.test(file.name)) {
      showError('.indd 파일은 브라우저에서 읽을 수 없습니다. InDesign에서 [파일 → 다른 이름으로 저장 → 형식: InDesign Markup (IDML)]로 저장한 .idml 파일을 올려 주세요.');
      return;
    }
    if (!/\.idml$/i.test(file.name)) {
      showError('IDML(.idml) 파일만 올릴 수 있습니다.');
      return;
    }
    setStatus('IDML 읽는 중…', true);
    try {
      const tpl = await PTIdml.parseIdml(await file.arrayBuffer(), file.name);
      const id = 'tpl_' + Date.now().toString(36);
      tpl.id = id;
      S.index[id] = { name: tpl.name, createdAt: tpl.createdAt };
      const mapping = PTDefaults.guessMapping(tpl);
      await store.set({ [K.tpl(id)]: tpl, [K.map(id)]: mapping, [K.index]: S.index, [K.doc(S.docId)]: id, [K.last]: id });
      await loadTemplate(id);
      if (!ui.drawer.classList.contains('pt-show')) { ui.drawer.classList.add('pt-show'); ui.gearBtn.classList.add('pt-on'); renderDrawer(); }
      if (S.doc) relayout(); else refresh(true);
    } catch (e) {
      console.error('[preTypeset]', e);
      showError('IDML을 읽지 못했습니다: ' + (e && e.message ? e.message : e));
      setStatus('', false);
    }
  }

  async function deleteTemplate(id) {
    if (!id || id === PTDefaults.BUILTIN.id) return;
    delete S.index[id];
    await store.remove([K.tpl(id), K.map(id)]);
    await store.set({ [K.index]: S.index, [K.doc(S.docId)]: PTDefaults.BUILTIN.id, [K.last]: PTDefaults.BUILTIN.id });
    await loadTemplate(PTDefaults.BUILTIN.id);
    relayout();
  }

  // ---------- 스타일 ----------
  function derive(base, o) { return Object.assign({}, base, { font: Object.assign({}, base.font) }, o); }

  function prepareStyles() {
    const tpl = S.tpl;
    S.styleById = new Map(tpl.styles.map(s => [s.id, s]));
    S.clsById = new Map(tpl.styles.map((s, i) => [s.id, 'ps-' + i]));
    const base = S.styleById.get(S.mapping.normal) || S.styleById.get(tpl.defaultStyleId) || tpl.styles[0];
    const L = base.leading, Z = base.size;
    const head = (scale, sb) => derive(base, {
      size: Z * scale, leading: Math.max(L, Z * scale * 1.4), weight: 700, firstIndent: 0,
      justification: 'LeftAlign', spaceBefore: L * sb, spaceAfter: L * 0.5, keepWithNext: 2, startParagraph: 'Anywhere', shading: null
    });
    S.fallback = {
      title: derive(head(2, 0), { justification: 'CenterAlign', spaceAfter: L * 2 }),
      subtitle: derive(head(1.3, 0), { justification: 'CenterAlign', weight: 400 }),
      h1: head(1.6, 2), h2: head(1.35, 1.5), h3: head(1.15, 1), h4: head(1, 1), h5: head(1, 0.5), h6: head(1, 0.5),
      normal: base,
      li: derive(base, { firstIndent: 0 }), ol: derive(base, { firstIndent: 0 }),
      code: derive(base, { font: { family: 'D2Coding', style: 'Regular' }, mono: true, size: Z * 0.88, leading: L * 0.85, tracking: 0, firstIndent: 0, justification: 'LeftAlign', shading: 'rgb(242 242 242)', leftIndent: 6, rightIndent: 6 }),
      box: derive(base, { firstIndent: 0, shading: 'rgb(238 243 250)', leftIndent: 8, rightIndent: 8 }),
      table: derive(base, { size: Z * 0.88, leading: L * 0.85, firstIndent: 0, justification: 'LeftAlign' }),
      footnote: derive(base, { size: Z * 0.8, leading: L * 0.8, firstIndent: 0, justification: 'LeftAlign' }),
      image: derive(base, { firstIndent: 0, justification: 'CenterAlign', spaceBefore: L * 0.5, spaceAfter: L * 0.5 })
    };
    let css = '';
    tpl.styles.forEach((s, i) => { css += PTStyle.rulesFor('.ps-' + i, s); });
    for (const k of KEY_ORDER) css += PTStyle.rulesFor('.pk-' + k, S.fallback[k]);
    ui.dyn.textContent = css;

    // 실제로 쓰이는 스타일(매핑된 것 + 마스터 텍스트)의 글꼴만 확인
    const used = new Set(KEY_ORDER.map(k => resolveKey(k).desc));
    for (const side of ['left', 'right']) {
      for (const it of (tpl.master && tpl.master[side]) || []) {
        for (const p of it.paragraphs || []) if (S.styleById.has(p.styleId)) used.add(S.styleById.get(p.styleId));
      }
    }
    const fams = new Set();
    for (const s of used) if (s && s.font && s.font.family) fams.add(s.font.family);
    S.fonts = Array.from(fams).map(f => ({ family: f, ok: PTStyle.fontAvailable(f) }));
    S.missingFonts = S.fonts.filter(f => !f.ok).map(f => f.family);
  }

  function resolveKey(key) {
    const id = S.mapping[key];
    if (id && S.styleById.has(id)) return { cls: S.clsById.get(id), desc: S.styleById.get(id), mapped: true };
    if (key === 'li' || key === 'ol') {
      const other = S.mapping[key === 'li' ? 'ol' : 'li'];
      if (other && S.styleById.has(other)) return { cls: S.clsById.get(other), desc: S.styleById.get(other), mapped: true };
    }
    return { cls: 'pk-' + key, desc: S.fallback[key] || S.fallback.normal, mapped: false };
  }

  // ---------- 원고 ----------
  async function refresh(force) {
    if (!S.open) return;
    if (!S.docId) { showError('Google Docs 문서 주소를 찾지 못했습니다.'); return; }
    setStatus('원고 불러오는 중…', true);
    try {
      const html = await PTDocs.fetchDocsHtml(S.docId);
      const h1 = PTDocs.hash(html);
      if (!force && S.doc && S.doc.hash === h1 && S.pages.length) { setStatus(statusText(), false); return; }
      S.doc = PTDocs.parseDocsHtml(html);
      S.lastError = '';
      renderDrawer();
      await relayout();
    } catch (e) {
      console.error('[preTypeset]', e);
      showError('원고를 불러오지 못했습니다: ' + (e && e.message ? e.message : e));
      setStatus('', false);
    }
  }

  function buildItems() {
    const items = [];
    const varStyles = new Set(Object.values(S.tpl.variables || {}).filter(v => v.kind === 'style').map(v => v.styleId));
    for (const b of S.doc.blocks) {
      if (b.kind === 'break') { items.push({ kind: 'break' }); continue; }
      if (b.kind === 'empty' && S.opts.skipEmpty && !b.boxed) continue;
      const st = resolveKey(b.key);
      const d = st.desc;
      let el, split = 'text';
      if (b.kind === 'image') {
        el = h('div', { class: 'pt-img ' + st.cls });
        const img = h('img', { src: b.src, alt: b.alt || '', referrerpolicy: 'no-referrer' });
        img.style.width = Math.round(b.ratio * 1000) / 10 + '%';
        el.append(img);
        split = null;
      } else if (b.kind === 'table') {
        el = h('table', { class: 'pt-table ' + st.cls });
        const tb = h('tbody');
        for (const row of b.rows) {
          const tr = h('tr');
          for (const c of row) {
            const td = h('td');
            if (c.colspan > 1) td.colSpan = c.colspan;
            if (c.rowspan > 1) td.rowSpan = c.rowspan;
            td.innerHTML = c.html;
            tr.append(td);
          }
          tb.append(tr);
        }
        el.append(tb);
        split = 'table';
      } else {
        el = h('div', { class: st.cls });
        if (b.kind === 'empty') { el.classList.add('pt-empty-para'); el.innerHTML = '&#8203;'; split = null; }
        else el.innerHTML = b.html;
        if (b.key === 'code') el.classList.add('pt-code');
        if (b.list) {
          el.classList.add('pt-li');
          const step = 1.2 * d.size;
          const baseIndent = d.leftIndent > 0 ? d.leftIndent : step;
          el.style.paddingLeft = (baseIndent + b.list.level * step) + 'pt';
          el.prepend(h('span', { class: 'pt-marker', text: b.list.marker }));
        }
      }
      if (b.boxed) {
        el.classList.add('pt-boxed');
        if (b.boxStart) el.classList.add('pt-box-start');
        if (b.boxEnd) el.classList.add('pt-box-end');
      }
      el.dataset.sid = d.id || ('key:' + b.key);
      el.dataset.key = b.key;
      if ((d.keepWithNext > 0) || (!st.mapped && HEADING_KEYS.has(b.key))) el.dataset.kwn = '1';
      if (d.id && varStyles.has(d.id) && b.text) el.dataset.vt = b.text.slice(0, 200);
      items.push({ kind: b.kind, el, split, start: d.startParagraph, keepAll: d.keepAll });
    }
    return items;
  }

  async function preloadImages(items) {
    const imgs = items.filter(i => i.kind === 'image').map(i => i.el.querySelector('img'));
    if (!imgs.length) return;
    const timeout = new Promise(r => setTimeout(r, 8000));
    await Promise.race([Promise.all(imgs.map(img => img.decode().catch(() => {}))), timeout]);
  }

  // ---------- 페이지 ----------
  function makePage(number) {
    const tpl = S.tpl;
    const side = tpl.page.facing ? (number % 2 === 0 ? 'left' : 'right') : 'right';
    const m = (tpl.margins && (tpl.margins[side] || tpl.margins.right)) || { top: 36, bottom: 36, left: 36, right: 36, columns: 1, gutter: 12 };
    const W = tpl.page.width, H = tpl.page.height;
    const el = h('div', { class: 'pt-page pt-' + side + ' pt-wb-' + S.opts.wordBreak });
    el.style.width = W + 'pt';
    el.style.height = H + 'pt';
    const fw = Math.max(20, W - m.left - m.right), fh = Math.max(20, H - m.top - m.bottom);
    const frame = h('div', { class: 'pt-frame' });
    Object.assign(frame.style, { left: m.left + 'pt', top: m.top + 'pt', width: fw + 'pt', height: fh + 'pt', columnGap: m.gutter + 'pt', gap: m.gutter + 'pt' });
    frame.style.setProperty('--colh', fh + 'pt');
    const n = Math.max(1, m.columns || 1);
    const cw = (fw - m.gutter * (n - 1)) / n;
    const cols = [];
    for (let i = 0; i < n; i++) {
      const c = h('div', { class: 'pt-col' });
      c.style.width = cw + 'pt';
      frame.append(c);
      cols.push(c);
    }
    el.append(frame);
    return { el, cols, number, side, margins: m };
  }

  function runText(run, page) {
    if (run.t === 'text') return esc(run.v);
    if (run.t === 'page') return String(page.number);
    if (run.t === 'var') {
      const v = (S.tpl.variables || {})[run.id];
      if (!v) return esc(run.v || '');
      if (v.kind === 'lastPage') return '<span class="pt-lastpage"></span>';
      if (v.kind === 'style') {
        const val = page.vars[v.styleId];
        return val ? esc((v.before || '') + val + (v.after || '')) : '';
      }
      return esc(run.v || '');
    }
    return '';
  }

  function renderMaster(page) {
    const tpl = S.tpl;
    if (page.blank && !S.opts.masterOnBlank) return;
    const items = tpl.master ? (tpl.master[page.side] || []) : [];
    const shapes = items.filter(i => i.type === 'shape');
    if (shapes.length) {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'pt-shapes');
      svg.setAttribute('width', tpl.page.width + 'pt');
      svg.setAttribute('height', tpl.page.height + 'pt');
      svg.setAttribute('viewBox', '0 0 ' + tpl.page.width + ' ' + tpl.page.height);
      for (const s of shapes) {
        let node;
        if (s.oval) {
          const xs = s.points.map(p => p[0]), ys = s.points.map(p => p[1]);
          const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
          node = document.createElementNS(NS, 'ellipse');
          node.setAttribute('cx', (x0 + x1) / 2); node.setAttribute('cy', (y0 + y1) / 2);
          node.setAttribute('rx', (x1 - x0) / 2); node.setAttribute('ry', (y1 - y0) / 2);
        } else {
          node = document.createElementNS(NS, s.closed ? 'polygon' : 'polyline');
          node.setAttribute('points', s.points.map(p => p.join(',')).join(' '));
        }
        node.setAttribute('fill', s.closed && s.fill ? s.fill : 'none');
        if (s.stroke) { node.setAttribute('stroke', s.stroke); node.setAttribute('stroke-width', s.weight); }
        svg.append(node);
      }
      page.el.prepend(svg);
    }
    for (const t of items.filter(i => i.type === 'text')) {
      const f = h('div', { class: 'pt-mframe' });
      const ins = t.inset || [0, 0, 0, 0];
      Object.assign(f.style, {
        left: t.x + 'pt', top: t.y + 'pt', width: t.w + 'pt', height: t.h + 'pt',
        padding: ins[0] + 'pt ' + ins[3] + 'pt ' + ins[2] + 'pt ' + ins[1] + 'pt',
        justifyContent: t.valign === 'CenterAlign' ? 'center' : t.valign === 'BottomAlign' ? 'flex-end' : 'flex-start'
      });
      for (const p of t.paragraphs) {
        const cls = S.clsById.get(p.styleId) || 'pk-normal';
        const d = h('div', { class: cls });
        d.innerHTML = p.runs.map(r => runText(r, page)).join('').replace(/\t/g, ' ') || '&#8203;';
        f.append(d);
      }
      page.el.append(f);
    }
  }

  function renderGrid(page) {
    if (!S.opts.grid) return;
    const b = S.tpl.baseline;
    if (!b || !(b.step > 0)) return;
    const m = page.margins;
    const top = b.relative === 'margin' ? m.top + b.start : b.start;
    const g = h('div', { class: 'pt-grid' });
    const step = b.step;
    Object.assign(g.style, {
      left: m.left + 'pt', width: (S.tpl.page.width - m.left - m.right) + 'pt',
      top: (top - step) + 'pt', height: (S.tpl.page.height - m.bottom - top + step) + 'pt',
      backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent ' + (step - 0.8) + 'pt, rgba(0,150,255,.35) ' + (step - 0.8) + 'pt, rgba(0,150,255,.35) ' + step + 'pt)'
    });
    page.el.append(g);
  }

  function computeVars(page) {
    const first = {}, last = {};
    for (const el of page.el.querySelectorAll('[data-vt]')) {
      if (el.classList.contains('pt-cont')) continue;
      const sid = el.dataset.sid;
      if (!(sid in first)) first[sid] = el.dataset.vt;
      last[sid] = el.dataset.vt;
    }
    page.vars = {};
    for (const v of Object.values(S.tpl.variables || {})) {
      if (v.kind !== 'style') continue;
      const pick = v.strategy === 'LastOnPage' ? last : first;
      page.vars[v.styleId] = pick[v.styleId] || S.carry[v.styleId] || '';
    }
    for (const [sid, val] of Object.entries(last)) S.carry[sid] = val;
  }

  // ---------- 표시 ----------
  function scaleFor() {
    const tpl = S.tpl;
    if (!tpl || !ui.viewer) return 1;
    const avail = Math.max(120, ui.viewer.clientWidth - 40);
    const perRow = S.opts.spread && tpl.page.facing ? 2 : 1;
    return (avail / (tpl.page.width * PX_PER_PT * perRow)) * S.opts.zoom;
  }

  function wrapPage(page) {
    const wrap = h('div', { class: 'pt-wrap', 'data-n': String(page.number) });
    if (page.overset) wrap.classList.add('pt-has-overset');
    wrap.append(page.el);
    wrap._page = page;
    return wrap;
  }

  function sizeWrap(wrap, s) {
    const tpl = S.tpl;
    wrap.style.width = tpl.page.width * PX_PER_PT * s + 'px';
    wrap.style.height = tpl.page.height * PX_PER_PT * s + 'px';
    const pg = wrap.firstElementChild;
    if (pg) pg.style.transform = 'scale(' + s + ')';
  }

  function placeWrap(container, wrap) {
    const spread = S.opts.spread && S.tpl.page.facing;
    const side = wrap._page.side;
    let row = container.lastElementChild;
    if (!spread || side === 'left' || !row || row.childElementCount >= 2 || !row.lastElementChild._page || row.lastElementChild._page.side !== 'left') {
      row = h('div', { class: 'pt-row' });
      container.append(row);
      if (spread && side === 'right') {
        const spacer = h('div', { class: 'pt-wrap pt-spacer' });
        row.append(spacer);
      }
    }
    row.append(wrap);
    sizeWrap(wrap, scaleFor());
    const spacer = row.querySelector('.pt-spacer');
    if (spacer) sizeWrap(spacer, scaleFor());
  }

  function rebuildRows() {
    if (!S.wraps.length) return;
    const top = firstVisibleIndex();
    ui.pages.textContent = '';
    for (const w of S.wraps) placeWrap(ui.pages, w);
    scrollToIndex(top);
  }

  function rescale() {
    if (!ui.pages) return;
    const s = scaleFor();
    for (const w of ui.pages.querySelectorAll('.pt-wrap')) sizeWrap(w, s);
    syncHeader();
  }

  function setZoom(z) {
    const top = firstVisibleIndex();
    S.opts.zoom = Math.max(0.3, Math.min(4, z));
    saveOpts();
    rescale();
    scrollToIndex(top);
  }

  function firstVisibleIndex() {
    if (!ui.viewer) return 0;
    const vt = ui.viewer.getBoundingClientRect().top;
    for (let i = 0; i < S.wraps.length; i++) {
      if (S.wraps[i].getBoundingClientRect().bottom > vt + 10) return i;
    }
    return 0;
  }

  function scrollToIndex(i) {
    const w = S.wraps[Math.min(i, S.wraps.length - 1)];
    if (!w || !w.isConnected) return;
    ui.viewer.scrollTop += w.getBoundingClientRect().top - ui.viewer.getBoundingClientRect().top - 18;
  }

  // ---------- 조판 실행 ----------
  async function relayout() {
    if (!S.open || !S.tpl) return;
    if (!S.doc) { renderEmpty(); return; }
    const run = ++S.run;
    S.laying = true;
    setStatus('조판 중…', true);
    clearError();
    try {
      prepareStyles();
      const items = buildItems();
      await preloadImages(items);
      if (run !== S.run) return;
      await document.fonts.ready;

      const keepIndex = firstVisibleIndex();
      const keepScroll = ui.viewer.scrollTop;
      const hadPages = S.wraps.length > 0;
      const container = h('div', { class: 'pt-pages' });
      if (!hadPages) {
        ui.pages.replaceWith(container);
        ui.pages = container;
      }
      const wraps = [];
      S.carry = {};
      ui.measure.textContent = '';

      const pages = await PTLayout.paginate(items, {
        root: ui.measure,
        startNumber: Math.max(1, parseInt(S.opts.startPage, 10) || 1),
        isCancelled: () => run !== S.run,
        makePage,
        onPageDone(page) {
          computeVars(page);
          renderMaster(page);
          renderGrid(page);
          const wrap = wrapPage(page);
          wraps.push(wrap);
          placeWrap(container, wrap);
          if (wraps.length % 8 === 0) setStatus('조판 중… ' + wraps.length + '쪽', true);
        }
      });
      if (!pages || run !== S.run) return;

      const total = pages.length ? pages[pages.length - 1].number : 0;
      for (const sp of container.querySelectorAll('.pt-lastpage')) sp.textContent = String(total);
      if (hadPages) {
        ui.pages.replaceWith(container);
        ui.pages = container;
        S.wraps = wraps;
        if (keepIndex > 0) scrollToIndex(keepIndex); else ui.viewer.scrollTop = keepScroll;
      } else {
        S.wraps = wraps;
      }
      S.pages = pages;
      S.laying = false;
      setStatus(statusText(), false);
    } catch (e) {
      console.error('[preTypeset]', e);
      showError('조판 중 오류: ' + (e && e.message ? e.message : e));
      S.laying = false;
      setStatus('', false);
    }
  }

  // ---------- 상태 표시 ----------
  function statusText() {
    const tpl = S.tpl;
    if (!tpl) return '';
    const parts = [];
    if (S.pages.length) parts.push('<b>' + S.pages.length + '쪽</b>');
    parts.push(mm(tpl.page.width) + '×' + mm(tpl.page.height) + 'mm');
    const base = resolveKey('normal').desc;
    if (base) parts.push('본문 ' + esc(base.font.family || '기본') + ' ' + r1(base.size) + '/' + r1(base.leading) + 'pt');
    const overs = S.pages.filter(p => p.overset).length;
    if (overs) parts.push('<span class="pt-warn">넘침 ' + overs + '쪽</span>');
    if (S.missingFonts.length) parts.push('<span class="pt-warn" title="' + esc(S.missingFonts.join(', ')) + '">글꼴 없음 ' + S.missingFonts.length + '개</span>');
    return parts.join(' · ');
  }

  function setStatus(html, busy) {
    if (!ui.stat) return;
    ui.stat.innerHTML = html;
    ui.panel.classList.toggle('pt-laying', !!busy);
  }

  function showError(msg) {
    if (!ui.viewer) return;
    clearError();
    S.lastError = msg;
    ui.viewer.prepend(h('div', { class: 'pt-error', text: msg }));
  }
  function clearError() {
    if (ui.viewer) for (const e of ui.viewer.querySelectorAll('.pt-error')) e.remove();
  }

  function renderEmpty() {
    ui.pages.textContent = '';
    ui.pages.append(h('div', { class: 'pt-empty' },
      h('div', null, h('b', null, '인디자인 내지(IDML)'), '를 올리면 이 문서를 그 판형과 스타일로 조판해 보여 줍니다.'),
      h('div', null, h('button', { class: 'pt-btn pt-primary', onclick: () => ui.file.click() }, 'IDML 올리기'))));
  }

  function syncHeader() {
    if (!ui.tplSel) return;
    ui.tplSel.textContent = '';
    ui.tplSel.append(h('option', { value: PTDefaults.BUILTIN.id }, PTDefaults.BUILTIN.name));
    const ids = Object.keys(S.index).sort((a, b) => (S.index[b].createdAt || 0) - (S.index[a].createdAt || 0));
    for (const id of ids) ui.tplSel.append(h('option', { value: id }, S.index[id].name));
    ui.tplSel.value = S.tplId || PTDefaults.BUILTIN.id;
    ui.spreadBtn.innerHTML = S.opts.spread ? ICON.spread : ICON.single;
    ui.spreadBtn.title = S.opts.spread ? '펼침면 보기 (눌러서 낱쪽)' : '낱쪽 보기 (눌러서 펼침면)';
    ui.zoomLbl.textContent = Math.round(scaleFor() * 100) + '%';
  }

  // ---------- 설정 서랍 ----------
  function renderDrawer() {
    if (!ui.drawer || !ui.drawer.classList.contains('pt-show') || !S.tpl) return;
    const tpl = S.tpl;
    const d = ui.drawer;
    d.textContent = '';

    // 1) 스타일 매핑
    d.append(h('h4', null, '스타일 매핑 — Docs 단락 스타일 → 내지 단락 스타일'));
    const counts = {};
    if (S.doc) for (const b of S.doc.blocks) if (b.key && b.kind !== 'empty') counts[b.key] = (counts[b.key] || 0) + 1;
    const keys = KEY_ORDER.filter(k => counts[k] || S.mapping[k]);
    const showKeys = keys.length ? keys : ['title', 'h1', 'h2', 'h3', 'normal', 'li', 'code', 'table'];
    const table = h('table', { class: 'pt-map' });
    const styles = tpl.styles.filter(s => !/^\[/.test(s.name));
    for (const key of showKeys) {
      const sel = h('select', {
        onchange: async e => {
          if (e.target.value) S.mapping[key] = e.target.value; else delete S.mapping[key];
          await store.set({ [K.map(S.tplId)]: S.mapping });
          relayout();
        }
      });
      sel.append(h('option', { value: '' }, '자동 (본문 기반)'));
      const groups = new Map();
      for (const s of styles) {
        const gname = s.group || '';
        if (!groups.has(gname)) groups.set(gname, []);
        groups.get(gname).push(s);
      }
      for (const [gname, list] of groups) {
        const parent = gname ? h('optgroup', { label: gname }) : sel;
        for (const s of list) parent.append(h('option', { value: s.id }, s.name + '  ' + r1(s.size) + '/' + r1(s.leading)));
        if (gname) sel.append(parent);
      }
      sel.value = S.mapping[key] && S.styleById.has(S.mapping[key]) ? S.mapping[key] : '';
      table.append(h('tr', null,
        h('td', null, KEY_LABEL[key], counts[key] ? h('span', { class: 'pt-count' }, String(counts[key])) : null),
        h('td', null, sel)));
    }
    d.append(table);
    d.append(h('div', { style: 'margin-top:6px' },
      h('button', {
        class: 'pt-btn', onclick: async () => {
          S.mapping = PTDefaults.guessMapping(tpl);
          await store.set({ [K.map(S.tplId)]: S.mapping });
          renderDrawer();
          relayout();
        }
      }, '이름으로 자동 매핑 다시 하기')));

    // 2) 옵션
    d.append(h('h4', null, '조판 옵션'));
    const opt = (label, input) => h('label', null, input, label);
    const check = (k) => h('input', { type: 'checkbox', checked: !!S.opts[k], onchange: e => { S.opts[k] = e.target.checked; saveOpts(); afterOpt(k); } });
    const wb = h('select', { onchange: e => { S.opts.wordBreak = e.target.value; saveOpts(); relayout(); } },
      h('option', { value: 'keep-all' }, '어절 단위'), h('option', { value: 'normal' }, '글자 단위'));
    wb.value = S.opts.wordBreak;
    const sp = h('input', { type: 'number', min: '1', value: String(S.opts.startPage), onchange: e => { S.opts.startPage = Math.max(1, parseInt(e.target.value, 10) || 1); saveOpts(); relayout(); } });
    d.append(h('div', { class: 'pt-opts' },
      h('label', null, '줄바꿈 ', wb),
      h('label', null, '시작 쪽번호 ', sp),
      opt('빈 문단 건너뛰기', check('skipEmpty')),
      opt('기준선 격자 표시', check('grid')),
      opt('타이핑 멈추면 자동 갱신', check('autoRefresh')),
      opt('문서를 왼쪽으로 밀기', check('push'))));

    // 3) 템플릿 정보
    d.append(h('h4', null, '내지 정보'));
    const mL = tpl.margins.left, mR = tpl.margins.right;
    const info = h('div', { class: 'pt-info' });
    const line = (k, v) => info.append(h('div', null, h('span', { class: 'pt-k' }, k), v));
    line('판형', mm(tpl.page.width) + ' × ' + mm(tpl.page.height) + 'mm' + (tpl.page.facing ? ' · 마주보기' : ' · 낱장'));
    line('여백(왼쪽 면)', '위 ' + mm(mL.top) + ' · 아래 ' + mm(mL.bottom) + ' · 왼 ' + mm(mL.left) + ' · 오른 ' + mm(mL.right) + 'mm');
    line('여백(오른쪽 면)', '위 ' + mm(mR.top) + ' · 아래 ' + mm(mR.bottom) + ' · 왼 ' + mm(mR.left) + ' · 오른 ' + mm(mR.right) + 'mm');
    line('단', (mR.columns || 1) + '단' + ((mR.columns || 1) > 1 ? ' · 간격 ' + mm(mR.gutter) + 'mm' : ''));
    if (tpl.master) line('마스터', tpl.master.name + ' (요소 ' + ((tpl.master.left || []).length + (tpl.master.right || []).length) + '개)');
    line('단락 스타일', styles.length + '개');
    const fontLine = h('div', null, h('span', { class: 'pt-k' }, '글꼴'));
    (S.fonts || []).forEach((f, i) => {
      if (i) fontLine.append(', ');
      fontLine.append(h('span', { class: f.ok ? 'pt-font-ok' : 'pt-font-miss', title: f.ok ? '설치됨' : '이 컴퓨터에 없음 → 대체 글꼴로 표시' }, (f.ok ? '✓ ' : '✗ ') + f.family));
    });
    info.append(fontLine);
    d.append(info);
    if (!tpl.builtin) {
      d.append(h('div', { style: 'margin-top:8px' }, h('button', { class: 'pt-btn', onclick: () => { if (confirm('이 템플릿을 삭제할까요?')) deleteTemplate(S.tplId); } }, '이 템플릿 삭제')));
    }
  }

  function afterOpt(k) {
    if (k === 'push') applyWidth(true);
    else if (k === 'autoRefresh') { /* noop */ }
    else relayout();
  }

  function saveOpts() { store.set({ [K.opts]: S.opts }); }

  // ---------- 자동 갱신 ----------
  function onEdit() {
    if (!S.open || !S.opts.autoRefresh) return;
    clearTimeout(S.editTimer);
    S.editTimer = setTimeout(() => refresh(false), 3500);
  }
  function hookTyping() {
    const ifr = document.querySelector('.docs-texteventtarget-iframe');
    let ok = false;
    try {
      const d = ifr && ifr.contentDocument;
      if (d && !d.__ptHooked) {
        d.__ptHooked = true;
        for (const t of ['keydown', 'paste', 'cut', 'drop']) d.addEventListener(t, onEdit, true);
        ok = true;
      } else if (d) ok = true;
    } catch (e) { /* cross-origin: 무시 */ }
    setTimeout(hookTyping, ok ? 15000 : 2000);
  }

  // ---------- 시작 ----------
  async function init() {
    const got = await store.get([K.opts, K.index]);
    S.opts = Object.assign({}, DEFAULT_OPTS, got[K.opts] || {});
    S.index = got[K.index] || {};
    chrome.runtime.onMessage.addListener(msg => {
      if (msg && msg.type === 'pt-toggle') toggle();
    });
    document.addEventListener('keydown', onEdit, true);
    hookTyping();
  }

  globalThis.PTApp = { toggle, importFile, refresh, relayout, setZoom, state: S, _loadTemplate: loadTemplate };
  init();
})();
