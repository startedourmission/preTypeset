// 토인비 조판 (preTypeset) — Google Docs 오른쪽 조판 미리보기 패널
(function () {
  'use strict';
  if (window.__preTypesetLoaded) return;
  window.__preTypesetLoaded = true;

  const { PTIdml, PTDocs, PTStyle, PTLayout, PTDefaults, PTMarkup, PTFonts } = globalThis;
  const PX_PER_PT = 96 / 72;
  const MM = 25.4 / 72;

  const KEY_LABEL = {
    title: '제목 (Title)', subtitle: '부제목',
    chapterNum: '장 번호', h1: '장 제목 (제목 1)', goalTitle: '학습 목표 제목', goal: '학습 목표', tocTitle: '공부 내용 제목', toc: '공부 내용 표',
    sectionNum: '절 번호', h2: '절 제목 (제목 2)', sectionMeta: '난이도·학습 날짜',
    h3: '제목 3', h4: '제목 4', h5: '제목 5', h6: '제목 6',
    normal: '일반 텍스트', li: '글머리 목록', liLast: '글머리 목록 (끝)', ol: '번호 목록', olLast: '번호 목록 (끝)',
    code: '코드', codeTitle: '코드 제목', box: '박스', table: '표 본문', tableHead: '표 머리', footnote: '각주', image: '그림', caption: '그림 설명',
    warmup: '워밍업', note: 'NOTE·TIP', coachTitle: '1:1 코칭 제목', coach: '1:1 코칭 본문', coachLast: '1:1 코칭 본문 (끝)',
    prompt: '프롬프트', promptLast: '프롬프트 (끝)', ai: 'AI 답변', aiLast: 'AI 답변 (끝)',
    practice: '실습 제목', summaryTitle: '요약 제목', summary: '요약 목록'
  };
  // 매핑이 없을 때 차례로 빌려 쓸 키
  const KEY_FALLBACK = {
    liLast: ['li'], olLast: ['ol', 'li'], ol: ['li'], tableHead: ['table'], caption: ['image'],
    coachTitle: ['box'], coach: ['box'], coachLast: ['coach', 'box'],
    prompt: ['box'], promptLast: ['prompt', 'box'], ai: ['box'], aiLast: ['ai', 'box'],
    summaryTitle: ['h3'], summary: ['li'], practice: ['h3'], warmup: ['box'],
    codeTitle: ['caption', 'h4'], goalTitle: ['h3'], goal: ['normal'], tocTitle: ['h3'], toc: ['table'], sectionMeta: ['normal']
  };
  const KEY_ORDER = Object.keys(KEY_LABEL);
  const HEADING_KEYS = new Set(['title', 'subtitle', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

  const DEFAULT_OPTS = {
    width: Math.round(Math.min(720, Math.max(420, window.innerWidth * 0.42))),
    spread: true, zoom: 1, wordBreak: 'keep-all', skipEmpty: true, grid: false,
    startPage: 1, autoRefresh: true, push: true,
    markup: true, keepHeadings: false, syncScroll: false, syncCursor: true, useTemplates: true
  };

  // ---------- 저장소 ----------
  const store = {
    get: keys => new Promise(r => chrome.storage.local.get(keys, r)),
    set: obj => new Promise(r => chrome.storage.local.set(obj, r)),
    remove: keys => new Promise(r => chrome.storage.local.remove(keys, r))
  };
  const K = {
    opts: 'pt:opts', index: 'pt:templates', last: 'pt:last',
    tpl: id => 'pt:tpl:' + id, ovr: id => 'pt:ovr:' + id, doc: id => 'pt:doc:' + id,
    // 블록별로 바꾼 스타일 (문서 × 내지)
    blk: (doc, tpl) => 'pt:blk:' + doc + ':' + tpl
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
.pt-drive-row{display:none;gap:6px;padding:8px 10px;background:#f8f9fa;border-bottom:1px solid #dadce0;flex:none}
.pt-drive-row.pt-show{display:flex}
.pt-drive-input{flex:1;min-width:0;height:28px;border:1px solid #dadce0;border-radius:6px;padding:0 8px;font:inherit;font-size:12px}
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
.pt-col{flex:none;height:100%;overflow:clip;overflow-clip-margin:28pt;display:flow-root;position:relative}
.pt-col>*{margin:0;box-sizing:border-box}
.pt-col>.pt-first{padding-top:0!important}
.pt-cont{text-indent:0!important;padding-top:0!important}
.pt-broken{padding-bottom:0!important}
.pt-marker{display:inline-block;width:1.2em;margin-left:-1.2em;text-indent:0}
.pt-li{text-indent:0!important}
.pt-code{white-space:pre-wrap;word-break:break-all!important;overflow-wrap:anywhere}
.pt-page code{font-family:"D2Coding","Menlo","Consolas",monospace;font-size:.92em}
.pt-page sup{font-size:.65em;line-height:0;vertical-align:.45em}
.pt-page sub{font-size:.65em;line-height:0;vertical-align:-.2em}
.pt-img{text-indent:0!important}
.pt-img img{display:inline-block;max-width:100%;height:auto;max-height:var(--colh);object-fit:contain;vertical-align:top}
.pt-table{border-collapse:collapse;width:100%;text-indent:0!important}
.pt-table td{border:.5pt solid #555;padding:2pt 3pt;vertical-align:top;text-align:left}
.pt-empty-para{min-height:1lh}
.pt-overset{outline:1.5pt solid #d93025;outline-offset:-1.5pt}
.pt-shapes{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.pt-master,.pt-tpl{position:absolute;inset:0;pointer-events:none}
.pt-tpl>.pt-tframe{pointer-events:auto}
.pt-mframe{position:absolute;display:flex;flex-direction:column;overflow:visible}
.pt-mframe>div{text-indent:0;padding-top:0;padding-bottom:0;white-space:pre-wrap}
.pt-grid{position:absolute;pointer-events:none}

/* 흰 글자인데 바탕(IDML 개체)을 아직 못 그리는 자리: 읽을 수 있게 회색 바탕 */
.pt-tframe{position:absolute;display:flex;flex-direction:column;overflow:hidden}
.pt-tframe>*{margin:0;box-sizing:border-box;flex:none}
.pt-tframe>:first-child{padding-top:0!important}
.pt-tframe>.pt-table{width:100%}
.pt-idml-bullet{display:inline-block;text-indent:0}
.pt-deco{display:inline-block;position:relative;text-indent:0}
.pt-deco>.pt-shapes{position:absolute;left:0;top:0}
.pt-deco>.pt-mframe>div{white-space:pre}
.pt-decopara{white-space:normal}
.pt-onobj{background-color:#8a8f98!important;outline:1px dashed #5f6368;outline-offset:-1px}
/* 블록 스타일 바꾸기 */
.pt-picked{outline:1.5px solid rgba(26,115,232,.8);outline-offset:1px}
.pt-picker{position:absolute;z-index:5;width:max-content;transform:translateX(-100%);font:12px/1.4 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif}
.pt-chip{white-space:nowrap;display:inline-flex;align-items:center;gap:4px;max-width:260px;height:20px;padding:0 7px;border:1px solid #1a73e8;border-radius:10px;background:#fff;color:#174ea6;font:inherit;font-size:11px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.15);float:right}
.pt-chip:hover{background:#e8f0fe}
.pt-chip-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pt-chip-own{background:#1a73e8;color:#fff;border-radius:6px;padding:0 4px;font-size:10px}
.pt-menu{display:none;clear:both;position:absolute;right:0;top:24px;width:300px;background:#fff;border:1px solid #dadce0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.18);overflow:hidden}
.pt-menu.pt-show{display:block}
.pt-menu-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;color:#5f6368;font-size:11px;border-bottom:1px solid #eee}
.pt-menu-group{min-width:0;max-width:170px;height:22px;border:1px solid #dadce0;border-radius:5px;font:inherit;font-size:11px;background:#fff}
.pt-menu-list{max-height:280px;overflow:auto;padding:4px 0}
.pt-menu-item{display:flex;align-items:center;gap:6px;width:100%;padding:5px 10px;border:0;background:none;font:inherit;font-size:12px;color:#1f1f1f;text-align:left;cursor:pointer}
.pt-menu-item:hover{background:#f1f3f4}
.pt-menu-item.pt-cur{color:#174ea6;font-weight:600}
.pt-menu-item.pt-unused{color:#9aa0a6}
.pt-mi-check{width:12px;flex:none}
.pt-mi-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pt-mi-pos{flex:none;font-size:10px;color:#5f6368;background:#f1f3f4;border-radius:4px;padding:0 4px}
.pt-mi-n{flex:none;font-size:10px;color:#9aa0a6;min-width:26px;text-align:right}
.pt-menu-foot{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 10px;border-top:1px solid #eee;font-size:11px;color:#3c4043}
.pt-menu-foot label{display:flex;align-items:center;gap:4px}
.pt-menu-foot .pt-btn{height:22px;font-size:11px}
/* PDF로 저장(인쇄): 조판 쪽만, 실제 판형 크기로 한 쪽씩 */
@media print{
  :host{all:initial}
  .pt-panel{position:static!important;display:block!important;width:auto!important;height:auto!important;overflow:visible!important;background:#fff!important;border:0!important}
  .pt-head,.pt-drive-row,.pt-drawer,.pt-foot,.pt-resize,.pt-measure,.pt-drop,.pt-empty,.pt-error,.pt-picker,.pt-spacer,.pt-grid{display:none!important}
  .pt-viewer{display:block!important;overflow:visible!important;padding:0!important;height:auto!important}
  .pt-pages{display:block!important;width:auto!important;min-width:0!important}
  .pt-row{display:block!important;margin:0!important}
  .pt-wrap{width:auto!important;height:auto!important;box-shadow:none!important;outline:none!important;break-after:page;page-break-after:always;overflow:hidden}
  .pt-wrap::after{display:none!important}
  .pt-wrap>.pt-page{position:relative!important;transform:none!important}
  .pt-cursor{box-shadow:none!important}
  .pt-picked,.pt-overset{outline:none!important}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
}
/* 커서 위치 표시 */
.pt-cursor{box-shadow:-5pt 0 0 -2pt rgb(26 115 232)}
`;

  const ICON = {
    drive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8.5 3.5h7l6 10.5-3.5 6h-12L2.5 14z"/><path d="M8.5 3.5l6 10.5M15.5 3.5L9.5 14M2.5 14h19"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    spread: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2.5" y="5" width="9.5" height="14" rx="1"/><rect x="12" y="5" width="9.5" height="14" rx="1"/></svg>',
    single: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="6.5" y="3.5" width="11" height="17" rx="1"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 19h14"/></svg>',
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
    const driveBtn = iconBtn('drive', '구글 드라이브 링크로 불러오기', () => { ui.driveRow.classList.toggle('pt-show'); if (ui.driveRow.classList.contains('pt-show')) ui.driveInput.focus(); });
    ui.driveInput = h('input', { class: 'pt-drive-input', type: 'url', placeholder: '구글 드라이브 폴더 링크 (IDML + Document fonts)' });
    ui.driveInput.addEventListener('keydown', e => { if (e.key === 'Enter') importFromDrive(ui.driveInput.value); });
    ui.driveRow = h('div', { class: 'pt-drive-row' }, ui.driveInput,
      h('button', { class: 'pt-btn pt-primary', onclick: () => importFromDrive(ui.driveInput.value) }, '불러오기'));
    const refBtn = iconBtn('refresh', '원고 다시 불러오기', () => refresh(true));
    const pdfBtn = iconBtn('pdf', 'PDF로 저장 (인쇄 창에서 대상: PDF로 저장)', () => printPdf());
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
        ui.tplSel, upBtn, driveBtn, h('span', { class: 'pt-sep' }), refBtn, pdfBtn, ui.spreadBtn,
        zoomOut, ui.zoomLbl, zoomIn, ui.gearBtn, closeBtn, ui.file),
      ui.driveRow, ui.drawer, ui.viewer, ui.foot, ui.measure);
    ui.panel.querySelector('.pt-logo').innerHTML = '토인비 <b>조판</b>';
    shadow.append(ui.panel);
    document.documentElement.append(host);

    // Docs 단축키가 패널 입력을 가로채지 않도록
    for (const t of ['keydown', 'keyup', 'keypress', 'paste', 'copy', 'cut']) host.addEventListener(t, e => e.stopPropagation());
    host.addEventListener('keydown', e => { if (e.key === 'Escape') closePicker(); });

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
    ui.viewer.addEventListener('drop', async e => {
      e.preventDefault();
      ui.panel.classList.remove('pt-dragging');
      const files = await filesFromDrop(e.dataTransfer);
      if (files.some(f => /\.(otf|ttf|ttc)$/i.test(f.name))) { importFonts(files); return; }
      const f = files.find(x => /\.(idml|indd)$/i.test(x.name)) || files[0];
      if (f) importFile(f);
    });

    new ResizeObserver(() => rescale()).observe(ui.viewer);
    ui.viewer.addEventListener('scroll', onViewerScroll, { passive: true });
    ui.viewer.addEventListener('click', onViewerClick);
  }

  // ---------- PDF로 저장 ----------
  // 브라우저 인쇄로 조판 쪽만 판형 크기 그대로 내보낸다 (글자는 벡터, 내지 글꼴 포함).
  // Docs 화면은 인쇄에서 숨기고, 패널 안 인쇄 CSS가 쪽을 한 장씩 실제 크기로 편다.
  let printStyle = null;
  function printMode(on) {
    const de = document.documentElement;
    if (on) {
      const p = S.tpl.page;
      if (!printStyle) { printStyle = document.createElement('style'); printStyle.id = 'pretypeset-print'; }
      printStyle.textContent = '@media print{' +
        '@page{size:' + p.width + 'pt ' + p.height + 'pt;margin:0}' +
        'html.pt-print,html.pt-print body{width:auto!important;height:auto!important;min-width:0!important;overflow:visible!important;background:#fff!important}' +
        'html.pt-print>:not(#pretypeset-host):not(head){display:none!important}' +
        'html.pt-print>#pretypeset-host{display:block!important;position:static!important;width:auto!important;height:auto!important}}';
      (document.head || de).append(printStyle);
      de.classList.add('pt-print');
    } else {
      de.classList.remove('pt-print');
      if (printStyle) printStyle.remove();
    }
  }

  async function printPdf() {
    if (!S.tpl || !S.pages.length) { setStatus('조판된 쪽이 없습니다.', false); return; }
    if (S.laying) { setStatus('조판이 끝나면 다시 눌러 주세요.', false); return; }
    closePicker();
    await document.fonts.ready;
    const title = document.title;
    // 인쇄 창의 기본 파일 이름
    document.title = title.replace(/\s*-\s*Google (Docs|문서)\s*$/i, '') + ' (조판)';
    printMode(true);
    const done = () => { printMode(false); document.title = title; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } finally { setTimeout(done, 0); }
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
      pushStyle.textContent = 'html.pt-push body{width:calc(100% - var(--pt-w,0px))!important;min-width:0!important}' +
        // 오른쪽 끝에 붙는 Docs 사이드 아이콘 줄(캘린더·Keep 등)도 패널 왼쪽으로
        'html.pt-push .docs-companion-app-switcher-container{right:var(--pt-w,0px)!important;left:auto!important}';
      document.head.append(pushStyle);
    }
    document.documentElement.style.setProperty('--pt-w', S.opts.width + 'px');
    document.documentElement.classList.toggle('pt-push', on);
    // Docs는 창 폭으로 편집기 폭을 정하므로, 메인 월드 브리지가 이 값만큼 줄인 폭을 알려 준다 (page-bridge.js)
    if (on) document.documentElement.setAttribute('data-pt-push', String(S.opts.width));
    else document.documentElement.removeAttribute('data-pt-push');
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
      docsScroller();
      refresh(false);
      pollCursor();
    } else {
      host.style.display = 'none';
      applyWidth(true);
      S.run++;
    }
  }

  // ---------- 템플릿 ----------
  // 올린 내지가 없으면 아무것도 고르지 않는다 (내장 템플릿을 대신 쓰지 않음)
  async function chooseInitialTemplate() {
    const got = await store.get([K.doc(S.docId), K.last]);
    const ids = Object.keys(S.index);
    let id = [got[K.doc(S.docId)], got[K.last]].find(x => x && S.index[x]);
    if (!id && ids.length) id = ids.sort((a, b) => (S.index[b].createdAt || 0) - (S.index[a].createdAt || 0))[0];
    if (id) await loadTemplate(id);
    else clearTemplate();
  }

  function clearTemplate() {
    S.tpl = null;
    S.tplId = null;
    S.pages = [];
    S.wraps = [];
    syncHeader();
    if (ui.drawer) { ui.drawer.classList.remove('pt-show'); ui.gearBtn.classList.remove('pt-on'); }
  }

  async function loadTemplate(id) {
    let tpl = null;
    if (id === PTDefaults.BUILTIN.id) tpl = PTDefaults.BUILTIN; // 테스트용 (목록에는 안 보임)
    else {
      const got = await store.get([K.tpl(id), K.ovr(id)]);
      tpl = got[K.tpl(id)] || null;
      S.overrides = got[K.ovr(id)] || {};
    }
    if (!tpl) { clearTemplate(); return; }
    if (tpl.builtin) {
      const got = await store.get(K.ovr(id));
      S.overrides = got[K.ovr(id)] || {};
    }
    S.tpl = tpl;
    S.tplId = id;
    S.blockOv = (await store.get(K.blk(S.docId, id)))[K.blk(S.docId, id)] || {};
    S.nameGuess = PTDefaults.guessMapping(tpl);
    S.learned = {};
    S.learnStats = {};
    combineMapping();
    prepareStyles();
    await ensureFonts();
    syncHeader();
    renderDrawer();
  }

  async function selectTemplate(id) {
    await loadTemplate(id);
    await store.set({ [K.doc(S.docId)]: id, [K.last]: id });
    relayout();
  }

  async function importFile(file, source) {
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
      if (source) { tpl.source = source; S.index[id].source = source; }
      // 같은 Drive 링크로 다시 불러온 경우 이전 템플릿을 대체
      if (source) for (const [oid, info] of Object.entries(S.index)) {
        if (oid !== id && info.source === source) { delete S.index[oid]; store.remove([K.tpl(oid)]); }
      }
      await store.set({ [K.tpl(id)]: tpl, [K.index]: S.index, [K.doc(S.docId)]: id, [K.last]: id });
      await loadTemplate(id);
      if (!ui.drawer.classList.contains('pt-show')) { ui.drawer.classList.add('pt-show'); ui.gearBtn.classList.add('pt-on'); renderDrawer(); }
      if (S.doc) relayout(); else refresh(true);
      return true;
    } catch (e) {
      console.error('[preTypeset]', e);
      showError('IDML을 읽지 못했습니다: ' + (e && e.message ? e.message : e));
      setStatus('', false);
    }
  }

  // ---------- 구글 드라이브 ----------
  // 백그라운드가 로그인된 세션으로 폴더를 읽고 파일을 받아 1MB씩 넘겨준다.
  function driveCall(msg, onChunk) {
    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: 'pt-drive' });
      let buf = null, got = 0;
      port.onMessage.addListener(m => {
        if (m.chunk != null) {
          if (!buf) buf = new Uint8Array(m.size);
          const bin = atob(m.chunk);
          for (let i = 0; i < bin.length; i++) buf[got + i] = bin.charCodeAt(i);
          got += bin.length;
          if (onChunk) onChunk(got, m.size);
          return;
        }
        port.disconnect();
        if (!m.ok) reject(new Error(m.error || 'Drive 오류'));
        else resolve(m.done ? (buf || new Uint8Array(0)) : m);
      });
      port.onDisconnect.addListener(() => reject(new Error('백그라운드 연결이 끊겼습니다. 확장을 새로고침해 보세요.')));
      port.postMessage(Object.assign({ req: 1 }, msg));
    });
  }

  const mb = n => (n / 1048576).toFixed(1) + 'MB';

  async function importFromDrive(url) {
    url = String(url || '').trim();
    if (!url) return;
    clearError();
    try {
      setStatus('드라이브 폴더 읽는 중…', true);
      const acct = location.pathname.match(/\/u\/(\d+)\//);
      const list = await driveCall({ op: 'list', url, authuser: acct ? acct[1] : '' });
      const files = list.files || [];
      const idmls = files.filter(f => /\.idml$/i.test(f.name));
      const fonts = files.filter(f => /\.(otf|ttf|ttc)$/i.test(f.name));
      if (!idmls.length) {
        const indd = files.find(f => /\.indd$/i.test(f.name));
        throw new Error(indd ? '폴더에 .indd만 있고 .idml이 없습니다. InDesign에서 IDML로 저장해 같은 폴더에 넣어 주세요.' : '폴더에서 .idml 파일을 찾지 못했습니다. (파일 ' + files.length + '개)');
      }
      // 최상위 IDML 우선, "사본"은 뒤로
      idmls.sort((a, b) => (a.path.split('/').length - b.path.split('/').length) || (/사본|copy/i.test(a.name) - /사본|copy/i.test(b.name)));
      const pick = idmls[0];

      // 1) 글꼴 먼저 (IDML을 읽을 때 바로 적용되도록)
      if (fonts.length) {
        const stored = new Set((await PTFonts.listStored()).map(r => r.file));
        const need = fonts.filter(f => !stored.has(f.name));
        const got = [];
        for (let i = 0; i < need.length; i++) {
          const f = need[i];
          const bytes = await driveCall({ op: 'get', id: f.id, authuser: f.authuser }, (n, t) => setStatus('글꼴 받는 중 ' + (i + 1) + '/' + need.length + ' · ' + f.name + ' ' + mb(n) + '/' + mb(t), true));
          got.push(new File([bytes], f.name));
        }
        if (got.length) {
          setStatus('글꼴 ' + got.length + '개 저장 중…', true);
          // 저장만 하고, 등록은 IDML을 읽은 뒤 필요한 글꼴만 (ensureFonts)
          await PTFonts.importFiles(got, ['\u0000']);
        }
      }

      // 2) IDML
      const bytes = await driveCall({ op: 'get', id: pick.id, authuser: pick.authuser }, (n, t) => setStatus('IDML 받는 중 · ' + pick.name + ' ' + mb(n) + '/' + mb(t), true));
      await importFile(new File([bytes], pick.name), url);
      ui.driveRow.classList.remove('pt-show');
    } catch (e) {
      console.error('[preTypeset] drive', e);
      showError('드라이브에서 불러오지 못했습니다: ' + (e && e.message ? e.message : e));
      setStatus('', false);
    }
  }

  async function deleteTemplate(id) {
    if (!id || id === PTDefaults.BUILTIN.id) return;
    delete S.index[id];
    await store.remove([K.tpl(id), K.ovr(id)]);
    await store.remove([K.doc(S.docId), K.last]);
    await chooseInitialTemplate();
    if (S.tpl) relayout(); else renderEmpty();
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
      box: derive(base, { firstIndent: 0 }),
      table: derive(base, { size: Z * 0.88, leading: L * 0.85, firstIndent: 0, justification: 'LeftAlign' }),
      footnote: derive(base, { size: Z * 0.8, leading: L * 0.8, firstIndent: 0, justification: 'LeftAlign' }),
      image: derive(base, { firstIndent: 0, justification: 'CenterAlign', spaceBefore: L * 0.5, spaceAfter: L * 0.5 }),
      note: derive(base, { size: Z * 0.85, leading: L * 0.85, firstIndent: 0, justification: 'LeftAlign', spaceBefore: 0, spaceAfter: 0 }),
      sectionNum: head(1.35, 1.5),
      chapterNum: head(1.6, 2)
    };
    // 대체 스타일은 IDML 스타일이 아니다 (본문 스타일의 id·장식이 따라가지 않게).
    // normal은 IDML 본문 스타일 객체 그 자체이므로 고치지 말고 복사본을 쓴다.
    for (const k of Object.keys(S.fallback)) S.fallback[k] = Object.assign({}, S.fallback[k], { id: '' });

    buildFamilies();
    let css = '';
    tpl.styles.forEach((s, i) => { css += PTStyle.rulesFor('.ps-' + i, s); });
    // 음영·테두리 설정이 같은 스타일끼리 이어지면 상자를 합친다
    S.bxById = new Map();
    const bxSig = new Map();
    for (const s of tpl.styles) {
      if (!s.shade && !s.border) continue;
      // 위·아래 오프셋, 모서리는 합칠 때 어차피 첫/끝 단락 것만 쓰므로 빼고 비교한다 (코드S·C·E가 한 상자로)
      const side = b => b && [b.color, b.width, b.offset && [b.offset[1], b.offset[3]], b.weight && [b.weight[1], b.weight[3]]];
      const k = JSON.stringify([side(s.shade), side(s.border)]);
      if (!bxSig.has(k)) bxSig.set(k, 'bx-' + bxSig.size);
      S.bxById.set(s.id, bxSig.get(k));
    }
    for (const c of bxSig.values()) css += PTStyle.mergeRules(c);
    for (const k of Object.keys(S.fallback)) css += PTStyle.rulesFor('.pk-' + k, S.fallback[k]);
    ui.dyn.textContent = css;

    // 실제로 쓰이는 스타일(매핑된 것 + 마스터 텍스트)의 글꼴만 확인
    const used = new Set(KEY_ORDER.map(k => resolveKey(k).desc));
    const idmlTexts = idmlTextItems();
    for (const it of idmlTexts) for (const p of it.paragraphs || []) if (S.styleById.has(p.styleId)) used.add(S.styleById.get(p.styleId));
    for (const t of tpl.templates || []) for (const pg of t.pages) for (const f of pg.frames) for (const sid of f.styles || []) if (S.styleById.has(sid)) used.add(S.styleById.get(sid));
    for (const sid of Object.values(tpl.precede || {})) if (S.styleById.has(sid)) used.add(S.styleById.get(sid));
    const fams = new Set();
    const wanted = new Set();
    const addFont = (fam, style) => {
      if (!fam) return;
      fams.add(fam);
      wanted.add(fam);
      if (style && !/^regular$/i.test(style)) wanted.add(fam + ' ' + style);
    };
    for (const s of used) if (s && s.font) addFont(s.font.family, s.font.style);
    for (const it of idmlTexts) {
      for (const p of it.paragraphs || []) {
        if (p.over && p.over.family) addFont(p.over.family, p.over.style);
        for (const r of p.runs) if (r.st && r.st.family) addFont(r.st.family, r.st.style);
      }
    }
    S.wantedFonts = Array.from(wanted);
    S.fonts = Array.from(fams).map(f => ({ family: f, ok: fontOk(f) }));
    S.missingFonts = S.fonts.filter(f => !f.ok).map(f => f.family);
  }

  // IDML에서 그대로 그리는 글 상자 전부 (마스터, 틀의 고정 문구, 장식)
  function idmlTextItems() {
    const tpl = S.tpl, out = [];
    const add = list => { for (const it of list || []) if (it.type === 'text') out.push(it); };
    if (tpl.master) { add(tpl.master.left); add(tpl.master.right); }
    for (const m of Object.values(tpl.masters || {})) { add(m.left); add(m.right); }
    for (const t of tpl.templates || []) for (const pg of t.pages) add(pg.frames.map(f => Object.assign({ type: 'text' }, f)));
    for (const list of Object.values(tpl.decos || {})) for (const d of list) add(d.items);
    return out;
  }

  function fontOk(f) {
    return !!(PTFonts && PTFonts.isRegistered(f)) || PTStyle.fontAvailable(f);
  }

  // 저장해 둔 글꼴 중 이 템플릿이 쓰는 것을 등록
  async function ensureFonts() {
    if (!PTFonts || !S.wantedFonts || !S.wantedFonts.length) return;
    try {
      const hit = await PTFonts.ensure(S.wantedFonts);
      if (hit.length) prepareStyles();
    } catch (e) { console.warn('[preTypeset] fonts', e); }
  }

  async function importFonts(files) {
    if (!PTFonts) return;
    const list = Array.from(files).filter(f => /\.(otf|ttf|ttc)$/i.test(f.name));
    if (!list.length) { showError('글꼴 파일(.otf, .ttf)이 없습니다.'); return; }
    setStatus('글꼴 ' + list.length + '개 읽는 중…', true);
    try {
      const added = await PTFonts.importFiles(list, S.wantedFonts);
      prepareStyles();
      renderDrawer();
      setStatus('글꼴 ' + added.length + '개 저장', false);
      relayout();
    } catch (e) {
      showError('글꼴을 읽지 못했습니다: ' + (e && e.message ? e.message : e));
      setStatus('', false);
    }
  }

  // 끌어다 놓은 폴더 안의 파일까지 모은다
  async function filesFromDrop(dt) {
    const out = [];
    const items = Array.from(dt.items || []).map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (!items.length) return Array.from(dt.files || []);
    const walk = entry => new Promise(resolve => {
      if (entry.isFile) entry.file(f => { out.push(f); resolve(); }, () => resolve());
      else if (entry.isDirectory) {
        const reader = entry.createReader();
        const all = [];
        const read = () => reader.readEntries(async ents => {
          if (!ents.length) { for (const e of all) await walk(e); resolve(); return; }
          all.push(...ents);
          read();
        }, () => resolve());
        read();
      } else resolve();
    });
    for (const e of items) await walk(e);
    return out;
  }

  // ---------- 매핑 ----------
  // 우선순위: 직접 지정 > IDML 본문에서 배운 것 > 스타일 이름 일반 규칙
  function combineMapping() {
    S.mapping = Object.assign({}, S.nameGuess || {}, S.learned || {}, S.overrides || {});
  }

  function sourceOf(key) {
    if (S.overrides && S.overrides[key]) return '직접';
    if (S.learned && S.learned[key]) return '학습';
    if (S.nameGuess && S.nameGuess[key]) return '이름';
    return '';
  }

  // 원고 문단 텍스트를 IDML 본문 샘플(텍스트 → 스타일)에 대 보고, 역할마다 가장 많이 맞은 스타일을 고른다
  function learnMapping(blocks) {
    S.learned = {};
    S.learnStats = {};
    const samples = S.tpl && S.tpl.samples;
    if (!samples) return;
    const tally = {};
    // [기본 단락]은 손으로 놓은 글 상자(라벨·탭 등)에 붙는 기본값이다. 같은 글이 이름 있는 스타일에도 있으면 그쪽만 본다.
    const basic = new Set(S.tpl.styles.map((st, si) => /NormalParagraphStyle$|^\[?(기본 단락|Basic Paragraph)\]?$/i.test(st.id.replace(/^ParagraphStyle\//, '')) ? si : -1).filter(si => si >= 0));
    // 같은 글이 없으면 숫자만 다른 글(예: 이 책의 '03장' ↔ IDML의 '01장'·'02장')을 모아 본다
    const shapeOf = k => k.replace(/\d/g, '0');
    let shaped = null;
    const byShape = k => {
      if (!shaped) {
        shaped = new Map();
        for (const [sk, cand] of Object.entries(samples)) {
          if (!/\d/.test(sk) || !Array.isArray(cand)) continue;
          const m = shaped.get(shapeOf(sk)) || new Map();
          for (const [si, c] of cand) m.set(si, (m.get(si) || 0) + c);
          shaped.set(shapeOf(sk), m);
        }
      }
      const m = shaped.get(shapeOf(k));
      return m ? Array.from(m) : null;
    };
    // 같은 텍스트가 여러 스타일에 있으면 횟수 비율만큼 나눠서 표를 준다
    const add = (role, text) => {
      // 짧은 코드 줄('None', '} Node;' …)은 어느 코드 스타일에나 있어 근거가 못 된다
      if (role === 'code' && String(text || '').replace(/\s/g, '').length < 10) return;
      const k = PTIdml.sampleKey(text);
      let cand = k && samples[k];
      if ((!Array.isArray(cand) || !cand.length) && k && /\d/.test(k)) cand = byShape(k);
      if (!Array.isArray(cand) || !cand.length) return;
      if (cand.some(([si]) => !basic.has(si))) cand = cand.filter(([si]) => !basic.has(si));
      // 코드 줄('None', '}' …)은 IDML 어디에나 있으니 고정폭 글꼴 스타일에서만 찾는다
      if (role === 'code') cand = cand.filter(([si]) => { const st = S.tpl.styles[si]; return st && st.font && PTStyle.looksMono(st.font.family || ''); });
      if (!cand.length) return;
      const sum = cand.reduce((a, c) => a + c[1], 0);
      const t = tally[role] || (tally[role] = { total: 0, by: {} });
      t.total++;
      for (const [si, c] of cand) t.by[si] = (t.by[si] || 0) + c / sum;
    };
    blocks.forEach((b, i) => {
      const role = roleKey(b, blocks[i + 1]);
      if (b.kind === 'p' && b.text) add(role, b.text);
      else if (b.kind === 'table') {
        b.rows.forEach((row, ri) => row.forEach(c => (c.paras || []).forEach(p => add(ri === 0 ? (role === 'toc' ? 'toc' : 'tableHead') : role, p.text))));
      }
    });
    // 동점이면 러닝헤드 변수(단락 스타일 일치)가 가리키는 스타일 = 구조 스타일을 조금 더 믿는다
    const varIdx = new Set(Object.values(S.tpl.variables || {}).filter(v => v.kind === 'style')
      .map(v => S.tpl.styles.findIndex(st => st.id === v.styleId)).filter(i => i >= 0).map(String));
    for (const [role, t] of Object.entries(tally)) {
      let best = null, n = 0, score = 0;
      for (const [si, c] of Object.entries(t.by)) {
        const sc = c * (varIdx.has(si) ? 1.5 : 1);
        if (sc > score) { best = si; n = c; score = sc; }
      }
      if (varIdx.has(best)) n = Math.min(t.total, n * 1.5);
      const st = S.tpl.styles[best];
      if (st && n / t.total >= 0.5) {
        S.learned[role] = st.id;
        S.learnStats[role] = { hit: Math.round(n * 10) / 10, total: t.total };
      }
    }
    learnFromTemplates(blocks);
    // 본문·코드: 원고 글로 못 배웠고, 이름 규칙이 고른 스타일이 책에서 거의 안 쓰였으면(예: Word에서 들어온 'Normal',
    // 쓰지 않는 '코드') 가장 많이 쓴 스타일로. 코드는 고정폭 글꼴, 본문은 그 밖의 일반 스타일 중에서.
    {
      const use = new Map();
      for (const cand of Object.values(samples)) if (Array.isArray(cand)) for (const [si, c] of cand) use.set(si, (use.get(si) || 0) + c);
      const idx = new Map(S.tpl.styles.map((st, si) => [st.id, si]));
      const mono = st => st.font && PTStyle.looksMono(st.font.family || '');
      const basic = st => /NormalParagraphStyle$/.test(st.id) || /^\[/.test(st.name);
      const pick = (key, ok, why) => {
        if (S.learned[key] || (S.overrides || {})[key]) return;
        let best = -1, n = 0;
        S.tpl.styles.forEach((st, si) => { if (ok(st) && (use.get(si) || 0) > n) { best = si; n = use.get(si); } });
        // 근거가 될 만큼 쓰인 스타일만 (본문 글이 거의 없는 IDML이면 이름 규칙을 믿는다)
        if (best < 0 || n < 20) return;
        const guess = (S.nameGuess || {})[key];
        if (guess && idx.has(guess) && (use.get(idx.get(guess)) || 0) >= n * 0.25) return;
        S.learned[key] = S.tpl.styles[best].id;
        S.learnStats[key] = why;
      };
      pick('code', st => mono(st), { mono: true });
      pick('normal', st => !mono(st) && !basic(st) && !(st.shade || st.border), { body: true });
    }
    learnHeadings(blocks);
    learnFromLeadTags(blocks);
    // 표: IDML에서 가장 흔한 표의 칸 글 스타일
    const D = S.tpl.table;
    if (D) {
      for (const [key, pos] of [['table', 'mid:mid'], ['tableHead', 'head:mid']]) {
        const v = D[pos] || D[pos.replace('mid', 'first')];
        if (v && v.para && S.styleById.has(v.para) && !S.learned[key] && !(S.overrides || {})[key]) {
          S.learned[key] = v.para;
          S.learnStats[key] = { table: true };
        }
      }
    }
  }

  // 원고 표식(예: [1:1 코칭])과 같은 고정 글이 든 IDML 머리 띠가 있으면, 그 머리 띠가 늘 앞에 서는 스타일을 그 박스의 본문으로 본다
  function learnFromLeadTags(blocks) {
    const prec = S.tpl.precede || {}, decos = S.tpl.decos || {};
    const BODY = { coachTitle: 'coach', box: 'box', note: 'note' };
    const norm = t => normText(t).replace(/\s+/g, '').replace(/\d+/g, '#');
    for (const b of blocks) {
      const body = BODY[b.role];
      if (!b.tag || !body || S.learned[body] || (S.overrides || {})[body]) continue;
      const nt = norm(b.tag);
      for (const [y, x] of Object.entries(prec)) {
        if (!S.styleById.has(y)) continue;
        if ((decos[x] || []).some(d => d.norm.split('|').some(t => norm(t) === nt))) {
          S.learned[body] = y;
          S.learnStats[body] = { tag: true };
          break;
        }
      }
    }
  }

  // 제목 3~6: 원고 글로도 이름으로도 못 찾으면 IDML 스타일 모양으로 고른다.
  //   본문 흐름에서 자주 쓰이고(가장 많이 쓴 제목 후보의 10% 이상), 본문보다 크고 굵은 스타일.
  //   반복 틀 핵심 스타일·[기본 단락]·고정폭·이미 다른 역할에 붙은 스타일은 뺀다. 큰 것부터 제목 3, 4, …
  function learnHeadings(blocks) {
    const want = ['h3', 'h4', 'h5', 'h6'].filter(k => blocks.some(b => b.kind === 'p' && b.key === k && !b.role) &&
      !S.learned[k] && !(S.overrides || {})[k] && !(S.nameGuess || {})[k]);
    if (!want.length) return;
    const use = new Map();
    for (const cand of Object.values(S.tpl.samples || {})) if (Array.isArray(cand)) for (const [si, c] of cand) use.set(si, (use.get(si) || 0) + c);
    const isBasic = st => /NormalParagraphStyle$/.test(st.id) || /^\[/.test(st.name);
    const mono = st => st.font && PTStyle.looksMono(st.font.family || '');
    // 본문 크기: 가장 많이 쓴 일반 스타일
    let body = null, bn = 0;
    S.tpl.styles.forEach((st, si) => { if (!isBasic(st) && !mono(st) && (use.get(si) || 0) > bn) { body = st; bn = use.get(si); } });
    if (!body) return;
    const taken = new Set(Object.values(Object.assign({}, S.nameGuess || {}, S.learned, S.overrides || {})));
    // 반복 틀의 핵심 스타일(장·절 제목 등)과, 쓰임 대부분이 틀 자리인 스타일(틀의 '워밍업' 라벨 등)
    const inTpl = new Map();
    for (const t of S.tpl.templates || []) {
      for (const k of t.keys) taken.add(k);
      for (const pg of t.pages) for (const f of pg.frames) for (const sid of f.styles || []) inTpl.set(sid, (inTpl.get(sid) || 0) + (t.count || 1));
    }
    const cands = [];
    S.tpl.styles.forEach((st, si) => {
      const n = use.get(si) || 0;
      if (n < 5 || isBasic(st) || mono(st) || taken.has(st.id) || (inTpl.get(st.id) || 0) >= n * 0.5) return;
      if (!(st.size > body.size) || PTStyle.fontWeight(st.font && st.font.style) < 600) return;
      cands.push({ st, n });
    });
    if (!cands.length) return;
    const top = Math.max(...cands.map(c => c.n));
    const picked = cands.filter(c => c.n >= top * 0.1).sort((a, b) => b.st.size - a.st.size || b.n - a.n);
    want.forEach((k, i) => {
      const c = picked[Math.min(i, picked.length - 1)];
      S.learned[k] = c.st.id;
      S.learnStats[k] = { heading: true };
    });
  }

  // 원고 글이 IDML에 없어 배우지 못한 제목(예: 이 책의 장·절 제목)은 반복 틀의 구조에서 배운다.
  // 번호 블록이 틀을 열었는데 바로 다음 역할 블록의 스타일이 그 틀에 자리가 없으면,
  // 틀에서 아직 비어 있는 원고 자리 중 글자가 가장 큰 자리(제목 자리)의 스타일로 본다.
  function learnFromTemplates(blocks) {
    const T = S.tpl.templates || [];
    if (!T.length || !S.styleById) return;
    const fixed = k => (S.overrides || {})[k] || S.learned[k];
    const cur = k => fixed(k) || (S.nameGuess || {})[k];
    const byKey = new Map();
    for (const t of T) for (const k of t.keys) { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(t); }
    const sizeOf = sid => (S.styleById.get(sid) || {}).size || 0;
    const tally = {};
    blocks.forEach((b, i) => {
      const nb = blocks[i + 1];
      if (b.kind !== 'p' || !nb || nb.kind !== 'p' || !nb.role) return;
      if (!HEADING_KEYS.has(roleKey(nb, blocks[i + 2]))) return;
      const sid = cur(roleKey(b, nb));
      const cands = sid && byKey.get(sid);
      if (!cands) return;
      const nrole = roleKey(nb, blocks[i + 2]);
      if (fixed(nrole)) return;
      const nsid = cur(nrole);
      for (const t of cands) {
        const frames = [].concat(...t.pages.map(pg => pg.frames)).filter(f => !f.constant && !f.hasTable);
        if (!frames.some(f => (f.styles || []).includes(sid))) continue;
        if (nsid && frames.some(f => (f.styles || []).includes(nsid))) continue;
        let best = null, size = 0;
        for (const f of frames) {
          if ((f.styles || []).includes(sid)) continue;
          for (const fs of f.styles || []) if (sizeOf(fs) > size) { size = sizeOf(fs); best = fs; }
        }
        if (!best) continue;
        const v = tally[nrole] || (tally[nrole] = { total: 0, by: {} });
        v.total += t.count || 1;
        v.by[best] = (v.by[best] || 0) + (t.count || 1);
      }
    });
    for (const [role, v] of Object.entries(tally)) {
      const [best, n] = Object.entries(v.by).sort((a, b) => b[1] - a[1])[0];
      if (n / v.total < 0.5) continue;
      S.learned[role] = best;
      S.learnStats[role] = { tpl: true };
    }
  }

  function resolveKey(key) {
    for (const k of [key].concat(KEY_FALLBACK[key] || [])) {
      const id = S.mapping[k];
      if (id && S.styleById.has(id)) return { cls: S.clsById.get(id), desc: S.styleById.get(id), mapped: true, key: k };
    }
    const fk = S.fallback[key] ? key : (KEY_FALLBACK[key] || []).find(k => S.fallback[k]) || 'normal';
    return { cls: 'pk-' + fk, desc: S.fallback[fk], mapped: false, key: fk };
  }

  // ---------- 원고 ----------
  async function refresh(force) {
    if (!S.open) return;
    if (!S.tpl) { renderEmpty(); setStatus('', false); return; }
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

  function varStyleSet() {
    return new Set(Object.values(S.tpl.variables || {}).filter(v => v.kind === 'style').map(v => v.styleId));
  }

  function tableEl(rows, cls, headCls) {
    const el = h('table', { class: 'pt-table ' + cls });
    const tb = h('tbody');
    // IDML에서 가장 흔한 표 모양 (첫 행·가운데 행·마지막 행 × 첫 열·가운데·마지막 열)
    const D = S.tpl && S.tpl.table;
    const userSet = k => !!(S.overrides && S.overrides[k]);
    for (const [ri, row] of rows.entries()) {
      const tr = h('tr');
      for (const [ci, c] of row.entries()) {
        const td = h('td', { class: ri === 0 && headCls ? headCls : null });
        if (c.colspan > 1) td.colSpan = c.colspan;
        if (c.rowspan > 1) td.rowSpan = c.rowspan;
        td.innerHTML = c.html;
        if (D && rows.length > 1) {
          const rr = ri === 0 ? 'head' : ri === rows.length - 1 ? 'last' : 'mid';
          const cc = row.length < 2 ? 'mid' : ci === 0 ? 'first' : ci === row.length - 1 ? 'last' : 'mid';
          const v = D[rr + ':' + cc] || D[rr + ':mid'] || D['mid:' + cc] || D['mid:mid'];
          if (v) {
            const bd = e => e ? e.w + 'pt solid ' + e.c : '0 none';
            Object.assign(td.style, {
              backgroundColor: v.fill || 'transparent',
              borderTop: bd(v.edges[0]), borderLeft: bd(v.edges[1]), borderBottom: bd(v.edges[2]), borderRight: bd(v.edges[3]),
              padding: v.inset[0] + 'pt ' + v.inset[3] + 'pt ' + v.inset[2] + 'pt ' + v.inset[1] + 'pt',
              verticalAlign: v.valign === 'CenterAlign' ? 'middle' : v.valign === 'BottomAlign' ? 'bottom' : 'top'
            });
            // 칸 글 스타일: 매핑 표에서 직접 고르지 않았으면 IDML 표의 그 자리 스타일
            const k = ri === 0 ? 'tableHead' : 'table';
            if (v.para && S.clsById.has(v.para) && !userSet(k)) td.className = S.clsById.get(v.para);
          }
        }
        tr.append(td);
      }
      tb.append(tr);
    }
    el.append(tb);
    return el;
  }

  function buildItems(blocks) {
    const items = [];
    const vs = varStyleSet();
    const used = {};
    const tpl = S.tpl;
    const precede = tpl.precede || {};
    const mark = (el, d, key, bi) => {
      if (isLight(d.color) && !d.shading) el.classList.add('pt-onobj');
      if (bi != null) el.dataset.bi = String(bi);
      el.dataset.sid = d.id || ('key:' + key);
      el.dataset.key = key;
      const bx = d.id && S.bxById && S.bxById.get(d.id);
      if (bx) el.classList.add(bx);
    };
    S.units = blockUnits(blocks);
    blocks.forEach((b, bi) => {
      if (b.kind === 'break') { items.push({ kind: 'break' }); return; }
      if (b.kind === 'empty' && S.opts.skipEmpty && !b.boxed && !b.container) return;
      const key = roleKey(b, blocks[bi + 1]);
      used[key] = (used[key] || 0) + 1;
      let st = resolveKey(key);
      const u = S.units[bi];
      const usid = u && unitStyle(u, st);
      if (usid && usid !== st.desc.id && S.styleById.has(usid)) st = { cls: S.clsById.get(usid), desc: S.styleById.get(usid), mapped: true, key };
      const d = st.desc;

      // IDML에서 이 스타일 앞에는 늘 장식만 있는 문단이 선다 (예: 프롬프트 머리, 코칭·코드 머리 띠)
      let lead = d.id && precede[d.id];
      // 박스(컨테이너)의 첫 문단이면, 박스 안 어느 문단 스타일에든 머리 문단이 있으면 그것을 쓴다
      const pb = blocks[bi - 1];
      if (!lead && b.container && (!pb || pb.container !== b.container || pb.clast)) {
        for (let k = bi; k < blocks.length && blocks[k].container === b.container; k++) {
          const kd = resolveKey(roleKey(blocks[k], blocks[k + 1])).desc;
          if (kd.id && precede[kd.id]) { lead = precede[kd.id]; break; }
          if (blocks[k].clast) break;
        }
      }
      // 제목 블록(코칭 제목·코드 제목)인데 다음 블록 앞에 '글 자리가 있는 머리 띠'가 서면,
      // 제목 글을 머리 띠의 자리에 넣고 제목 블록은 따로 그리지 않는다
      let title = null;
      if (b.kind === 'p' && /Title$/.test(b.role || '') && blocks[bi + 1]) {
        const nsid = finalStyle(blocks, bi + 1);
        const nl = (nsid && precede[nsid]) || lead;
        const list = nl && (S.tpl.decos || {})[nl];
        if (list && list.some(x => x.slot >= 0)) { lead = nl; title = b.text || ''; }
      }
      const prev = items[items.length - 1];
      if (lead && S.styleById.has(lead) && !(prev && (prev.sid === lead || prev.sid === d.id))) {
        const ld = S.styleById.get(lead);
        const el = h('div', { class: S.clsById.get(lead) + ' pt-decopara' });
        const dec = pickLead(lead, title);
        // 글 자리가 있는데 넣을 글이 없으면 IDML 첫 사례 글 대신 비워 둔다
        if (dec) el.append(decoEl(dec, dec.slot >= 0 ? (title || ' ') : null));
        el.append(document.createTextNode('​'));
        mark(el, ld, key, null);
        el.classList.remove('pt-onobj');
        el.dataset.kwn = '1';
        items.push({ kind: 'p', el, split: null, start: ld.startParagraph, sid: lead, virtual: true });
        if (title != null) return;
      }
      if (title != null && prev && prev.sid === lead) return;

      let el, split = 'text';
      if (b.kind === 'image') {
        el = h('div', { class: 'pt-img ' + st.cls });
        const img = h('img', { src: b.src, alt: b.alt || '', 'data-w': String(b.w || ''), 'data-h': String(b.h || '') });
        img.style.width = Math.round(b.ratio * 1000) / 10 + '%';
        el.append(img);
        split = null;
      } else if (b.kind === 'table') {
        el = tableEl(b.rows, st.cls, resolveKey('tableHead').cls);
        split = 'table';
      } else {
        el = h('div', { class: st.cls });
        if (b.kind === 'empty') { el.classList.add('pt-empty-para'); el.innerHTML = '&#8203;'; split = null; }
        else el.innerHTML = b.html;
        if (b.key === 'code') el.classList.add('pt-code');
        if (b.key === 'code' && u && u.i === 0) el.classList.add('pt-ustart');
        const dec = b.kind === 'p' && d.id ? pickDeco(d.id, b) : null;
        if (dec) el.prepend(decoEl(dec, b.tag));
        const bul = b.list && !dec && d.bullet;
        if (bul) {
          // IDML 스타일의 글머리 기호(문자·색)와 내어쓰기를 그대로 쓴다
          const mk = h('span', { class: 'pt-marker pt-idml-bullet', text: d.bullet.char });
          mk.style.width = Math.max(0, -d.firstIndent) + 'pt';
          if (d.bullet.color) mk.style.color = d.bullet.color;
          el.prepend(mk);
        } else if (b.list && !dec) {
          el.classList.add('pt-li');
          const step = 1.2 * d.size;
          const baseIndent = d.leftIndent > 0 ? d.leftIndent : step;
          el.style.paddingLeft = (baseIndent + b.list.level * step) + 'pt';
          el.prepend(h('span', { class: 'pt-marker', text: b.list.marker }));
        }
      }
      // 흰 글자인데 바탕이 없는 스타일 = IDML에서는 개체 위에 얹힌 글자 → 읽을 수 있게만 표시
      mark(el, d, key, bi);
      // IDML '다음과 함께 유지'를 따른다. 옵션을 켜면 제목류는 IDML 값이 없어도 붙인다.
      const headingLike = HEADING_KEYS.has(key) || /Title$|Num$/.test(key) || key === 'practice';
      if (d.keepWithNext > 0 || (S.opts.keepHeadings && headingLike)) el.dataset.kwn = '1';
      const vt = b.text;
      if (d.id && vs.has(d.id) && vt) el.dataset.vt = vt.slice(0, 200);
      items.push({ kind: b.kind, el, split, start: d.startParagraph, keepAll: d.keepAll, sid: d.id || '', role: b.role || '', text: b.text || '', bi });
    });
    S.usedKeys = used;
    return applyTemplates(items);
  }

  // ---------- 같은 위상의 스타일 (블록별로 바꾸기) ----------
  // 이름에서 위치 표시(S·C·E·O = 시작·중간·끝·한 줄)를 뺀 이름이 같고 같은 그룹이면 한 계열.
  //   예: 코딩:본문_코딩S_별색_옅은 / …C… / …E… → 계열 '본문_코딩_별색_옅은'
  // 같은 그룹의 다른 계열이 '같은 위상의 다른 요소'다 (코드 ↔ 실행 결과 ↔ 터미널 …).
  // 위치 표시: 글자(S·C·E·O) 또는 한글 위치어(첫줄·중간·마지막 줄·한 줄 …)
  const POS_RE = /([가-힣])([SCEO])(?=$|[_\s(])/i;
  const POS_WORDS = [
    [/첫\s*째?\s*줄|첫\s*행|처음|시작/, 'S'], [/마지막\s*줄?|끝\s*줄|끝/, 'E'], [/한\s*줄|단독/, 'O'], [/중간/, 'C']
  ];
  function splitPos(leaf) {
    const m = leaf.match(POS_RE);
    if (m) return { pos: m[2].toUpperCase(), rest: leaf.replace(POS_RE, '$1') };
    for (const [re, p] of POS_WORDS) if (re.test(leaf)) return { pos: p, rest: leaf.replace(re, ' ') };
    return { pos: '', rest: leaf };
  }
  function buildFamilies() {
    const use = new Map();
    for (const cand of Object.values(S.tpl.samples || {})) if (Array.isArray(cand)) for (const [si, c] of cand) use.set(si, (use.get(si) || 0) + c);
    S.famOf = new Map();
    S.fams = new Map();
    const posN = new Map();
    S.tpl.styles.forEach((st, si) => {
      if (/^\[/.test(st.name)) return;
      const leaf = String(st.name).split(':').pop().trim();
      const { pos, rest } = splitPos(leaf);
      // 계열 이름: 위치어·'사본'·공백 차이는 무시 (따라 코드_첫줄 사본 ≈ 따라코드_마지막 줄)
      const key = rest.replace(/사본(\s*\d+)?/g, '').replace(/[\s_()-]+/g, '') || leaf;
      const fid = (st.group || '') + '\u0000' + key;
      let f = S.fams.get(fid);
      if (!f) S.fams.set(fid, f = { id: fid, group: st.group || '', label: rest.replace(/사본(\s*\d+)?/g, '').replace(/[\s_]+$/, '').replace(/\s{2,}/g, ' ').trim() || leaf, pos: {}, ids: [], count: 0, top: null, topN: -1 });
      const n = use.get(si) || 0;
      // 같은 위치에 여러 스타일이 있으면 많이 쓴 것
      if (pos && (!f.pos[pos] || n > (posN.get(fid + pos) || 0))) { f.pos[pos] = st.id; posN.set(fid + pos, n); }
      f.ids.push(st.id);
      f.count += n;
      if (n > f.topN) { f.top = st.id; f.topN = n; }
      S.famOf.set(st.id, f);
    });
  }

  // 블록 안 위치에 맞는 계열 스타일 (한 줄이면 O, 처음 S, 중간 C, 끝 E. 없으면 가까운 것)
  function posStyle(fam, i, n, fallback) {
    const order = n <= 1 ? ['O', 'E', 'S', 'C'] : i === 0 ? ['S', 'C'] : i === n - 1 ? ['E', 'C'] : ['C', 'S'];
    for (const p of order) if (fam.pos[p]) return fam.pos[p];
    return fallback;
  }
  const hasPositions = fam => fam && ['S', 'C', 'E'].filter(p => fam.pos[p]).length >= 2;

  // 원고 블록 → 바꿀 수 있는 단위. 코드는 이어진 코드 문단 전체(1×1 표 하나 = 한 단위), 나머지는 문단 하나.
  // sig: 원고를 고쳐도 되도록 역할 + 첫 문단 글 + 같은 글의 몇 번째
  function blockUnits(blocks) {
    const units = new Array(blocks.length);
    const seen = new Map();
    const sigOf = (key, text) => {
      const base = key + ':' + normText(text).slice(0, 80);
      const k = (seen.get(base) || 0) + 1;
      seen.set(base, k);
      return base + '#' + k;
    };
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.kind !== 'p' && b.kind !== 'empty') continue;
      const key = roleKey(b, blocks[i + 1]);
      if (key === 'code') {
        let j = i;
        // 한 덩어리: ``` … ``` 하나, 1×1 표 하나, 또는 이어진 고정폭 문단
        const isCode = x => x && (x.kind === 'p' || x.kind === 'empty') && x.key === 'code' && x.container === b.container;
        const joins = (a, c) => isCode(c) && c.fence === a.fence && !c.boxStart && !a.boxEnd && !c.fenceStart && !a.fenceEnd;
        while (joins(blocks[j], blocks[j + 1])) j++;
        const first = blocks.slice(i, j + 1).find(x => x.kind === 'p');
        const u = { sig: sigOf(key, first ? first.text : ''), key, from: i, n: j - i + 1 };
        for (let k = i; k <= j; k++) units[k] = Object.assign({ i: k - i }, u);
        i = j;
        continue;
      }
      if (b.kind !== 'p') continue;
      units[i] = { sig: sigOf(key, b.text), key, from: i, n: 1, i: 0 };
    }
    return units;
  }

  // 이 단위 문단에 쓸 스타일: 직접 고른 계열 > (코드) 매핑된 스타일의 계열을 위치에 맞게
  function unitStyle(u, st) {
    const chosen = S.blockOv && S.blockOv[u.sig];
    if (chosen && S.styleById.has(chosen)) {
      const fam = S.famOf && S.famOf.get(chosen);
      return fam && hasPositions(fam) ? posStyle(fam, u.i, u.n, chosen) : chosen;
    }
    if (u.key === 'code' && st.mapped && st.desc.id) {
      const fam = S.famOf && S.famOf.get(st.desc.id);
      if (hasPositions(fam)) return posStyle(fam, u.i, u.n, st.desc.id);
    }
    return null;
  }

  // 미리보기에서 누른 블록 옆에 스타일 칩 → 같은 그룹의 다른 계열로 바꾸기
  function closePicker() {
    if (ui.picker) { ui.picker.remove(); ui.picker = null; }
    if (ui.pages) for (const x of ui.pages.querySelectorAll('.pt-picked')) x.classList.remove('pt-picked');
  }

  function unitElements(u) {
    const out = [];
    for (let k = u.from; k < u.from + u.n; k++) out.push(...ui.pages.querySelectorAll('[data-bi="' + k + '"]'));
    return out;
  }

  function famLabel(f) {
    const ps = ['S', 'C', 'E', 'O'].filter(p => f.pos[p]);
    return { name: f.label, pos: ps.length > 1 ? ps.join('·') : '' };
  }

  function openPicker(bi) {
    closePicker();
    const u = S.units && S.units[bi];
    if (!u || !S.famOf) return;
    const els = unitElements(u);
    if (!els.length) return;
    const sid = els[0].dataset.sid;
    const cur = S.famOf.get(sid) || null; // 없으면 매핑이 없어 대체 모양으로 그린 블록
    for (const x of els) x.classList.add('pt-picked');
    const normalFam = S.famOf.get(S.mapping.normal);
    let group = cur ? cur.group : normalFam ? normalFam.group : '';
    const own = !!(S.blockOv && S.blockOv[u.sig]);
    const roleCount = S.units.filter((x, k) => x && x.key === u.key && x.i === 0 && k === x.from).length;

    const chip = h('button', { class: 'pt-chip', title: '이 블록의 스타일 바꾸기' });
    chip.append(...[h('span', { class: 'pt-chip-name', text: cur ? famLabel(cur).name : '(매핑 없음)' }), own ? h('span', { class: 'pt-chip-own', text: '직접' }) : null, h('span', { text: '▾' })].filter(Boolean));
    const menu = h('div', { class: 'pt-menu' });
    // 같은 그룹이 기본, 다른 그룹도 고를 수 있게
    const groups = new Map();
    for (const f of S.fams.values()) if (f.count > 0 || f === cur) groups.set(f.group, (groups.get(f.group) || 0) + f.count);
    const gsel = h('select', { class: 'pt-menu-group', title: 'IDML 스타일 그룹' });
    for (const [g, n] of Array.from(groups).sort((a, b) => b[1] - a[1])) gsel.append(h('option', { value: g }, (g || '(그룹 없음)') + (n ? '  ' + n : '')));
    gsel.value = group;
    gsel.addEventListener('change', () => { group = gsel.value; fill(); });
    const head = h('div', { class: 'pt-menu-head' }, h('span', { text: (KEY_LABEL[u.key] || u.key) + (u.n > 1 ? ' · ' + u.n + '줄' : '') }), gsel);
    menu.append(head);
    const list = h('div', { class: 'pt-menu-list' });
    const fill = () => {
    list.textContent = '';
    // 이 책에서 실제로 쓴 계열만 (사본·안 쓴 스타일은 뺀다). 지금 것은 늘 보인다.
    const alts = Array.from(S.fams.values()).filter(f => f.group === group && (f === cur || (f.count > 0 && !/사본/.test(f.label))))
      .sort((a, b) => (b === cur) - (a === cur) || b.count - a.count || a.label.localeCompare(b.label));
    for (const f of alts) {
      const lb = famLabel(f);
      const item = h('button', { class: 'pt-menu-item' + (f === cur ? ' pt-cur' : '') + (f.count ? '' : ' pt-unused'), title: f.ids.map(id => S.styleById.get(id).name).join('\n') },
        h('span', { class: 'pt-mi-check', text: f === cur ? '✓' : '' }),
        h('span', { class: 'pt-mi-name', text: lb.name }),
        lb.pos ? h('span', { class: 'pt-mi-pos', text: lb.pos }) : null,
        h('span', { class: 'pt-mi-n', text: f.count ? String(f.count) : '' }));
      item.addEventListener('click', ev => { ev.stopPropagation(); setBlockStyle(u, f, applyAll.checked); });
      list.append(item);
    }
    };
    fill();
    menu.append(list);
    const applyAll = h('input', { type: 'checkbox' });
    const foot = h('div', { class: 'pt-menu-foot' },
      h('label', { title: '[⚙] 매핑 표의 이 역할을 바꿉니다' }, applyAll, ' 이 역할 전체(' + (KEY_LABEL[u.key] || u.key) + ' ' + roleCount + '개)에 적용'),
      own ? h('button', { class: 'pt-btn', onclick: ev => { ev.stopPropagation(); setBlockStyle(u, null, false); } }, '원래대로') : null);
    menu.append(foot);
    menu.addEventListener('click', ev => ev.stopPropagation());
    chip.addEventListener('click', ev => { ev.stopPropagation(); menu.classList.toggle('pt-show'); });

    const box = h('div', { class: 'pt-picker' }, chip, menu);
    // 블록이 있는 쪽(wrap)에 비율로 붙인다: 확대·축소, 다시 그리기에도 자리가 맞는다
    const wrap = els[0].closest('.pt-wrap');
    if (!wrap) return;
    const wr = wrap.getBoundingClientRect();
    const r = els[0].getBoundingClientRect();
    const right = Math.max(...els.filter(x => x.closest('.pt-wrap') === wrap).map(x => x.getBoundingClientRect().right));
    box.style.top = 'calc(' + ((r.top - wr.top) / wr.height * 100) + '% - 22px)';
    box.style.left = ((right - wr.left) / wr.width * 100) + '%';
    wrap.append(box);
    ui.picker = box;
    ui.picker.dataset.bi = String(bi);
  }

  async function setBlockStyle(u, fam, all) {
    const bi = u.from;
    if (all && fam) {
      S.overrides = S.overrides || {};
      S.overrides[u.key] = fam.top || fam.ids[0];
      await store.set({ [K.ovr(S.tplId)]: S.overrides });
      // 역할 전체를 바꾸면 이 블록만 바꾼 것은 지운다
      if (S.blockOv) delete S.blockOv[u.sig];
    } else {
      S.blockOv = S.blockOv || {};
      if (fam) S.blockOv[u.sig] = fam.top || fam.ids[0];
      else delete S.blockOv[u.sig];
    }
    await store.set({ [K.blk(S.docId, S.tplId)]: S.blockOv || {} });
    closePicker();
    await relayout();
    renderDrawer();
    setTimeout(() => openPicker(bi), 50);
  }

  // ---------- IDML 장식 ----------
  // 스타일에 되풀이해 붙던 인라인 개체 중 이 문단에 맞는 것. 원고 표식(tag)이 있으면 같은 글의 변형을 고른다.
  function pickDeco(styleId, b) {
    const list = (S.tpl.decos || {})[styleId];
    if (!list || !list.length) return null;
    const tag = b && b.tag ? String(b.tag).trim() : '';
    if (tag) {
      const nt = tag.replace(/\d+/g, '#');
      const hit = list.find(x => x.norm.split('|').includes(nt));
      if (hit) return hit;
      // 같은 글의 변형이 없으면 가장 흔한 변형의 첫 글 자리에 표식을 넣는다
      const base = list[0];
      if (base.slot >= 0) return base;
      const texts = base.items.filter(i => i.type === 'text');
      const k = texts.findIndex(t => (t.paragraphs || []).some(p => p.runs.length));
      return k >= 0 ? Object.assign({}, base, { slot: k }) : base;
    }
    // 표식이 없는 문단에는 글이 늘 같은 장식만
    return list.find(x => x.slot < 0) || null;
  }

  // 머리 문단 장식: 제목이 있으면 글 자리가 있는 변형, 없으면 글이 늘 같은 변형(없으면 첫 변형을 빈 자리로)
  function pickLead(styleId, title) {
    const list = (S.tpl.decos || {})[styleId];
    if (!list || !list.length) return null;
    if (title != null) return list.find(x => x.slot >= 0) || list[0];
    return list.find(x => x.slot < 0) || list[0];
  }

  // k번째 원고 블록에 실제로 쓰는 스타일 id (역할 매핑 + 블록 안 위치·직접 고른 것)
  function finalStyle(blocks, k) {
    const b = blocks[k];
    if (!b) return '';
    const st = resolveKey(roleKey(b, blocks[k + 1]));
    const u = S.units && S.units[k];
    return (u && unitStyle(u, st)) || st.desc.id || '';
  }

  function decoEl(dec, tag) {
    const span = h('span', { class: 'pt-deco', 'aria-hidden': 'true' });
    Object.assign(span.style, { width: dec.w + 'pt', height: dec.h + 'pt', verticalAlign: (dec.yOffset || 0) + 'pt' });
    drawItems(span, dec.items, null, { w: dec.w, h: dec.h, slot: dec.slot, slotText: tag });
    return span;
  }

  // ---------- IDML 반복 틀 (장 도비라, 절 시작 쪽 …) ----------
  const normText = t => String(t || '').replace(/[\s ​﻿]+/g, ' ').trim();

  function applyTemplates(items) {
    const T = S.tpl.templates || [];
    if (!T.length || !S.opts.useTemplates) return items;
    const byKey = new Map();
    for (const t of T) for (const k of t.keys) { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(t); }
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const cands = it.sid && !it.virtual ? byKey.get(it.sid) : null;
      if (!cands) { out.push(it); continue; }
      let best = null;
      for (const t of cands) {
        const r = absorb(t, items, i);
        if (r && (!best || r.n > best.n || (r.n === best.n && t.count > best.t.count))) best = Object.assign({ t }, r);
      }
      if (!best) { out.push(it); continue; }
      out.push(fixedItem(best));
      i = best.end - 1;
    }
    return out;
  }

  // 틀이 받을 수 있는 원고 블록을 앞에서부터 모은다
  function absorb(t, items, i) {
    const frames = [];
    t.pages.forEach((pg, k) => pg.frames.forEach(f => frames.push({ f, k, cap: f.constant ? 0 : Math.max(1, f.maxParas), got: [] })));
    const constTexts = new Set();
    t.pages.forEach(pg => {
      for (const f of pg.frames) if (f.constant) for (const p of f.paragraphs || []) constTexts.add(normText(p.runs.map(r => r.v || '').join('')));
      const m = (S.tpl.masters || {})[pg.master];
      for (const it of (m && m[pg.side]) || []) if (it.type === 'text' && !(pg.overrides || []).includes(it.id)) for (const p of it.paragraphs || []) constTexts.add(normText(p.runs.map(r => r.v || '').join('')));
    });
    constTexts.delete('');
    let n = 0, j = i, end = i;
    let pending = 0; // 자리가 없는 역할 블록: 뒤 블록이 틀에 들어가면 틀의 그림 글자로 보고 뺀다
    for (; j < items.length; j++) {
      const it = items[j];
      if (it.kind === 'break') break;
      if (it.kind === 'empty') continue;
      // 첫 블록 다음부터는 집필 마크업이 역할을 붙인 블록만 (일반 본문은 흐름으로)
      if (j > i && !it.role && it.kind !== 'table') break;
      const nt = normText(it.text);
      // 틀에 이미 찍혀 있는 고정 문구와 같은 글 → 틀 것을 쓴다
      if (it.kind === 'p' && constTexts.has(nt)) { n += 2; end = j + 1; pending = 0; continue; }
      let slot = null, w = 1;
      if (it.kind === 'table') slot = frames.find(x => x.f && x.f.hasTable && x.cap > 0);
      else {
        // IDML에 같은 글이 있으면 그 글의 스타일이 든 프레임
        const cand = (S.tpl.samples || {})[PTIdml.sampleKey(it.text)] || [];
        for (const [si] of cand) {
          const sid = S.tpl.styles[si] && S.tpl.styles[si].id;
          slot = frames.find(x => x.f && x.cap > 0 && (x.f.styles || []).includes(sid));
          if (slot) { w = 2; break; }
        }
        if (!slot) slot = frames.find(x => x.f && x.cap > 0 && (x.f.styles || []).includes(it.sid));
      }
      if (slot) { slot.got.push(it); slot.cap--; n += w; pending = 0; end = j + 1; continue; }
      if (j > i && pending < 2 && it.kind === 'p' && nt.length <= 30) { pending++; continue; }
      break;
    }
    if (!n || !frames.some(x => x.f && x.got.length)) return null;
    // 채우지 못한 자리가 많은 틀, 자리를 못 찾고 흐름으로 밀려난 역할 블록(예: 제목)이 있는 틀은 덜 맞는 틀
    n -= 0.5 * frames.filter(x => x.f && !x.f.constant && !x.got.length).length;
    n -= 0.5 * pending;
    return { n, end: Math.max(end, i + 1), frames: frames.filter(x => x.f) };
  }

  function fixedItem(best) {
    const t = best.t;
    return {
      kind: 'fixed', count: t.pages.length, keepMaster: true,
      startOn: t.startSide === 'left' ? 'even' : t.startSide === 'right' ? 'odd' : '',
      render(page, k) {
        const pg = t.pages[k];
        const dx = sideShift(pg.side, page.side);
        page.master = pg.master;
        page.overrides = sideOverrides(pg, page.side, dx);
        page.blank = false;
        const box = h('div', { class: 'pt-tpl' });
        const bgs = pg.frames.filter(f => !f.constant && f.bg).map(f => Object.assign({ type: 'shape' }, f.bg));
        drawItems(box, pg.shapes.concat(bgs), page, { w: S.tpl.page.width, h: S.tpl.page.height, dx });
        drawItems(box, pg.frames.filter(f => f.constant).map(f => Object.assign({ type: 'text' }, f, { x: f.x + dx })), page, { w: S.tpl.page.width, h: S.tpl.page.height });
        for (const slot of best.frames) {
          if (slot.k !== k || !slot.got.length) continue;
          const f = slot.f;
          const fr = h('div', { class: 'pt-tframe' });
          const ins = f.inset || [0, 0, 0, 0];
          Object.assign(fr.style, {
            left: (f.x + dx) + 'pt', top: f.y + 'pt', width: f.w + 'pt', height: f.h + 'pt',
            padding: ins[0] + 'pt ' + ins[3] + 'pt ' + ins[2] + 'pt ' + ins[1] + 'pt',
            justifyContent: f.valign === 'CenterAlign' ? 'center' : f.valign === 'BottomAlign' ? 'flex-end' : 'flex-start'
          });
          for (const it of slot.got) { it.el.classList.remove('pt-onobj'); mimicRuns(it, f); fr.append(it.el); }
          box.append(fr);
          slot.fr = fr;
        }
        page.el.append(box);
        // 원고 글이 틀 프레임보다 길면 프레임을 늘리고, 본문 흐름 위쪽 프레임이면 흐름도 그만큼 내린다
        page.tplGrow = 0;
        for (const slot of best.frames) {
          if (slot.k !== k || !slot.fr) continue;
          const fr = slot.fr;
          if (fr.scrollHeight <= fr.clientHeight + 1) continue;
          const need = slot.f.h * fr.scrollHeight / Math.max(1, fr.clientHeight);
          fr.style.height = need + 'pt';
          if (pg.flow && slot.f.y < pg.flow.y) page.tplGrow = Math.max(page.tplGrow, need - slot.f.h);
        }
      },
      flowRect(page) {
        const pg = t.pages[t.pages.length - 1];
        if (!pg.flow) return null;
        const g = page.tplGrow || 0;
        return Object.assign({}, pg.flow, { x: pg.flow.x + sideShift(pg.side, page.side), y: pg.flow.y + g, h: Math.max(40, pg.flow.h - g) });
      }
    };
  }

  // 틀 첫 사례의 글이 숫자만 다르고 모양이 같으면(예: '01장'), 글자별 서식(크기·글꼴·색)을 그대로 입힌다
  function mimicRuns(it, f) {
    if (it.kind !== 'p' || !f.paragraphs) return;
    const mine = it.el.textContent;
    const shape = t => t.replace(/\d/g, '0');
    for (const p of f.paragraphs) {
      const runs = p.runs.filter(r => r.t === 'text');
      if (runs.length < 2 || runs.length !== p.runs.length) continue;
      const theirs = runs.map(r => r.v).join('');
      if (shape(theirs) !== shape(mine)) continue;
      let pos = 0, html = '';
      for (const r of runs) {
        const css = runStyle(r.st);
        const piece = esc(mine.slice(pos, pos + r.v.length));
        pos += r.v.length;
        html += css ? '<span style="' + esc(css) + '">' + piece + '</span>' : piece;
      }
      it.el.innerHTML = html;
      // 큰 글자가 섞이면 줄 높이도 그만큼 (InDesign 자동 행간)
      const big = Math.max(0, ...runs.map(r => (r.st && r.st.size) || 0));
      const d = S.styleById.get(it.sid);
      if (d && big > d.leading) it.el.style.lineHeight = (big * 1.2) + 'pt';
      return;
    }
  }

  // 틀 쪽에서 재정의(문서 페이지로 꺼내 고친) 마스터 요소. 틀을 반대쪽 페이지에 놓으면
  // 그쪽 마스터에서 같은 요소(모양·크기·글이 같고 판면 차이만큼 옮긴 것)를 찾아 뺀다.
  function sideOverrides(pg, side, dx) {
    const ids = new Set(pg.overrides || []);
    if (side === pg.side) return ids;
    const m = (S.tpl.masters || {})[pg.master];
    if (!m) return ids;
    const text = it => (it.paragraphs || []).map(p => p.runs.map(r => r.v || r.t).join('')).join('\n');
    const near = (a, b) => Math.abs(a - b) < 0.6;
    const other = (m[side] || []).slice();
    for (const it of m[pg.side] || []) {
      if (!ids.has(it.id)) continue;
      const k = other.findIndex(o => o.type === it.type && near(o.w, it.w) && near(o.h, it.h) && near(o.y, it.y) && near(o.x, it.x + dx) && text(o) === text(it));
      if (k >= 0) { ids.add(other[k].id); other.splice(k, 1); }
    }
    return ids;
  }

  // 틀을 반대쪽 페이지에 놓을 때: 판면 왼쪽 여백 차이만큼 옮긴다
  function sideShift(from, to) {
    const m = S.tpl.margins || {};
    if (from === to || !m.left || !m.right) return 0;
    return (m[to] || m.right).left - (m[from] || m.right).left;
  }

  function setFlow(page, r) {
    const frame = page.el.querySelector('.pt-frame');
    if (!frame) return;
    const n = page.cols.length;
    const gutter = r.gutter || 12;
    Object.assign(frame.style, { left: r.x + 'pt', top: r.y + 'pt', width: r.w + 'pt', height: r.h + 'pt' });
    frame.style.setProperty('--colh', r.h + 'pt');
    const cw = (r.w - gutter * (n - 1)) / n;
    for (const c of page.cols) c.style.width = cw + 'pt';
    page.margins = Object.assign({}, page.margins, { top: r.y, left: r.x, right: S.tpl.page.width - r.x - r.w, bottom: S.tpl.page.height - r.y - r.h });
  }

  // 블록의 역할 → 매핑 키 (박스 안 위치, 목록 끝 등)
  function roleKey(b, next) {
    if (b.kind === 'image') return 'image';
    if (b.kind === 'table') return b.role === 'toc' ? 'toc' : 'table';
    if (b.container === 'summary') return 'summary';
    if (b.role && !b.container) return b.role;
    if (b.container === 'coach') return b.role === 'coachTitle' ? 'coachTitle' : b.clast ? 'coachLast' : 'coach';
    if (b.container === 'prompt') return b.clast ? 'promptLast' : 'prompt';
    if (b.container === 'ai') return b.clast ? 'aiLast' : 'ai';
    if (b.container) return b.role || 'box';
    if (b.list && (b.key === 'li' || b.key === 'ol')) {
      const cont = next && next.list && next.key === b.key && next.container === b.container;
      return cont ? b.key : b.key + 'Last';
    }
    if (b.key === 'box') return 'box';
    return b.key;
  }

  function isLight(c) {
    const m = String(c || '').match(/\d+/g);
    return !!m && m.length >= 3 && m.slice(0, 3).every(v => +v > 235);
  }

  // 못 불러온 그림은 같은 비율의 자리표시로 바꿔 쪽 나눔이 어긋나지 않게 한다
  function placeholderSrc(w, h) {
    w = Math.max(1, Math.round(w || 400)); h = Math.max(1, Math.round(h || 300));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<rect width="100%" height="100%" fill="#e6e6e6"/><path d="M0 0L' + w + ' ' + h + 'M' + w + ' 0L0 ' + h + '" stroke="#c8c8c8" stroke-width="2"/></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  async function preloadImages(items) {
    const imgs = items.filter(i => i.kind === 'image').map(i => i.el.querySelector('img'));
    if (!imgs.length) return;
    const timeout = new Promise(r => setTimeout(r, 8000));
    const load = img => img.decode().catch(() => {
      const m = img.getAttribute('src') || '';
      const w = parseFloat(img.dataset.w) || parseFloat((m.match(/[?&]w=(\d+)/) || [])[1]);
      const h = parseFloat(img.dataset.h) || parseFloat((m.match(/[?&]h=(\d+)/) || [])[1]);
      img.src = placeholderSrc(w, h);
      img.title = '그림을 불러오지 못함';
      return img.decode().catch(() => {});
    });
    await Promise.race([Promise.all(imgs.map(load)), timeout]);
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

  function runStyle(st) {
    if (!st) return '';
    const a = [];
    if (st.family) a.push('font-family:' + PTStyle.familyStack({ family: st.family, style: st.style || '' }));
    if (st.style) a.push('font-weight:' + PTStyle.fontWeight(st.style));
    if (st.size) a.push('font-size:' + st.size + 'pt');
    if (st.color) a.push('color:' + st.color);
    if (st.tracking) a.push('letter-spacing:' + st.tracking / 1000 + 'em');
    return a.join(';');
  }

  function runText(run, page) {
    const inner = runInner(run, page);
    const css = runStyle(run.st);
    return css && inner ? '<span style="' + esc(css) + '">' + inner + '</span>' : inner;
  }

  function runInner(run, page) {
    if (run.t === 'text') return esc(run.v);
    if (run.t === 'page') return String(page.number).padStart(S.tpl.folioDigits || 0, '0');
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

  // IDML 개체(도형·글 상자)를 host 안에 그린다. 마스터, 틀, 장식이 같이 쓴다.
  //   o.w/o.h: 도형 좌표계 크기, o.slot/o.slotText: slot번째 글 상자의 글을 바꿔 넣는다
  function drawItems(host, items, page, o) {
    // 글 상자의 칠·선도 도형처럼 (글보다 아래에) 그린다
    const shapes = items.flatMap(i => i.type === 'shape' ? [i] : i.type === 'text' && i.bg ? [Object.assign({ type: 'shape' }, i.bg)] : []);
    if (shapes.length) {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'pt-shapes');
      svg.setAttribute('width', o.w + 'pt');
      svg.setAttribute('height', o.h + 'pt');
      svg.setAttribute('viewBox', '0 0 ' + o.w + ' ' + o.h);
      for (const s of shapes) {
        let node;
        if (s.d) {
          node = document.createElementNS(NS, 'path');
          node.setAttribute('d', s.d);
          node.setAttribute('fill-rule', 'evenodd');
          if (o.dx) node.setAttribute('transform', 'translate(' + o.dx + ' 0)');
        } else if (s.oval) {
          const xs = s.points.map(p => p[0]), ys = s.points.map(p => p[1]);
          const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
          node = document.createElementNS(NS, 'ellipse');
          node.setAttribute('cx', (x0 + x1) / 2); node.setAttribute('cy', (y0 + y1) / 2);
          node.setAttribute('rx', (x1 - x0) / 2); node.setAttribute('ry', (y1 - y0) / 2);
        } else if (s.points) {
          node = document.createElementNS(NS, s.closed ? 'polygon' : 'polyline');
          node.setAttribute('points', s.points.map(p => p.join(',')).join(' '));
        } else continue;
        node.setAttribute('fill', s.fill || 'none');
        if (s.stroke) { node.setAttribute('stroke', s.stroke); node.setAttribute('stroke-width', s.weight); }
        svg.append(node);
      }
      host.prepend(svg);
    }
    let ti = -1;
    for (const t of items) {
      if (t.type !== 'text') continue;
      ti++;
      const f = h('div', { class: 'pt-mframe' });
      const ins = t.inset || [0, 0, 0, 0];
      Object.assign(f.style, {
        left: t.x + 'pt', top: t.y + 'pt', width: t.w + 'pt', height: t.h + 'pt',
        padding: ins[0] + 'pt ' + ins[3] + 'pt ' + ins[2] + 'pt ' + ins[1] + 'pt',
        justifyContent: t.valign === 'CenterAlign' ? 'center' : t.valign === 'BottomAlign' ? 'flex-end' : 'flex-start'
      });
      const slot = o.slot === ti && o.slotText;
      const paras = t.paragraphs || [];
      for (let pi = 0; pi < paras.length; pi++) {
        const p = paras[pi];
        if (slot && pi > 0) break;
        const cls = S.clsById.get(p.styleId) || 'pk-normal';
        const d = h('div', { class: cls });
        const bx = S.bxById && S.bxById.get(p.styleId);
        if (bx) d.classList.add(bx);
        const ov = p.over || {};
        if (ov.justification) {
          const j = PTStyle.justify(ov.justification);
          d.style.textAlign = j.align;
          d.style.textAlignLast = j.last;
        }
        const pcss = runStyle(ov);
        if (pcss) d.style.cssText += ';' + pcss;
        if (slot) {
          // 자리 글자는 원래 첫 글 조각의 글자 모양을 따른다
          const r0 = p.runs.find(r => r.t === 'text') || {};
          d.innerHTML = runText({ t: 'text', v: o.slotText, st: r0.st }, page);
        } else {
          d.innerHTML = p.runs.map(r => runText(r, page)).join('').replace(/\t/g, ' ') || '&#8203;';
        }
        f.append(d);
      }
      host.append(f);
    }
  }

  function renderMaster(page) {
    const tpl = S.tpl;
    if (page.blank && !S.opts.masterOnBlank) return;
    const m = page.master && tpl.masters && tpl.masters[page.master] ? tpl.masters[page.master] : tpl.master;
    let items = m ? (m[page.side] || []) : [];
    if (page.overrides && page.overrides.size) items = items.filter(it => !page.overrides.has(it.id));
    const box = h('div', { class: 'pt-master' });
    drawItems(box, items, page, { w: tpl.page.width, h: tpl.page.height });
    page.el.prepend(box);
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
    SY.muteView = Date.now() + 400;
    const w = S.wraps[Math.min(i, S.wraps.length - 1)];
    if (!w || !w.isConnected) return;
    ui.viewer.scrollTop += w.getBoundingClientRect().top - ui.viewer.getBoundingClientRect().top - 18;
  }

  // ---------- 조판 실행 ----------
  async function relayout() {
    if (!S.open) return;
    if (!S.tpl) { renderEmpty(); return; }
    if (!S.doc) { renderEmpty(); return; }
    const run = ++S.run;
    closePicker();
    S.laying = true;
    setStatus('조판 중…', true);
    clearError();
    try {
      const blocks = S.opts.markup ? PTMarkup.apply(S.doc.blocks) : S.doc.blocks;
      S.blocks = blocks;
      learnMapping(blocks);
      combineMapping();
      prepareStyles();
      const items = buildItems(blocks);
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
        setFlow,
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
        SY.muteView = Date.now() + 400;
        if (keepIndex > 0) scrollToIndex(keepIndex); else ui.viewer.scrollTop = keepScroll;
      } else {
        S.wraps = wraps;
      }
      S.pages = pages;
      S.laying = false;
      setStatus(statusText(), false);
      syncModel();
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
    if (!ui.pages) return;
    S.pages = [];
    S.wraps = [];
    ui.pages.textContent = '';
    ui.pages.append(h('div', { class: 'pt-empty' },
      h('div', null, h('b', null, '인디자인 내지(IDML)'), '를 올리면 이 문서를 그 판형과 스타일로 조판해 보여 줍니다.'),
      h('div', null,
        h('button', { class: 'pt-btn pt-primary', onclick: () => ui.file.click() }, 'IDML 올리기'),
        h('button', { class: 'pt-btn', onclick: () => { ui.driveRow.classList.add('pt-show'); ui.driveInput.focus(); } }, '드라이브 링크로 불러오기'))));
  }

  function syncHeader() {
    if (!ui.tplSel) return;
    ui.tplSel.textContent = '';
    const ids = Object.keys(S.index).sort((a, b) => (S.index[b].createdAt || 0) - (S.index[a].createdAt || 0));
    if (!ids.length) ui.tplSel.append(h('option', { value: '' }, '올린 내지 없음'));
    for (const id of ids) ui.tplSel.append(h('option', { value: id }, S.index[id].name));
    if (S.tplId && S.tplId === PTDefaults.BUILTIN.id) ui.tplSel.append(h('option', { value: S.tplId }, PTDefaults.BUILTIN.name));
    ui.tplSel.value = S.tplId || '';
    ui.tplSel.disabled = !ids.length;
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
    d.append(h('h4', null, '스타일 매핑 — 원고 역할 → 내지 단락 스타일'));
    d.append(h('div', { style: 'font-size:11px;color:#80868b;margin:-2px 0 6px' },
      '학습: 원고 문단을 IDML 본문에 대 보고 실제로 쓰인 스타일 · 이름: 스타일 이름 일반 규칙 · 직접: 내가 고른 것'));
    const counts = Object.assign({}, S.usedKeys || {});
    if (!S.usedKeys && S.doc) for (const b of S.doc.blocks) if (b.key && b.kind !== 'empty') counts[b.key] = (counts[b.key] || 0) + 1;
    const keys = KEY_ORDER.filter(k => counts[k] || S.mapping[k]);
    const showKeys = keys.length ? keys : ['title', 'h1', 'h2', 'h3', 'normal', 'li', 'code', 'table'];
    const table = h('table', { class: 'pt-map' });
    const styles = tpl.styles.filter(s => !/^\[/.test(s.name));
    for (const key of showKeys) {
      const sel = h('select', {
        onchange: async e => {
          S.overrides = S.overrides || {};
          if (e.target.value) S.overrides[key] = e.target.value; else delete S.overrides[key];
          await store.set({ [K.ovr(S.tplId)]: S.overrides });
          combineMapping();
          renderDrawer();
          relayout();
        }
      });
      const auto = Object.assign({}, S.nameGuess, S.learned)[key];
      const autoSt = auto && S.styleById.get(auto);
      sel.append(h('option', { value: '' }, '자동: ' + (autoSt ? autoSt.name : '본문 기반 기본값')));
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
      sel.value = S.overrides && S.overrides[key] && S.styleById.has(S.overrides[key]) ? S.overrides[key] : '';
      const src = sourceOf(key);
      const stat = S.learnStats && S.learnStats[key];
      const badge = src ? h('span', { class: 'pt-count', title: stat && stat.tpl ? 'IDML 반복 틀에서 번호 다음 자리의 스타일' : stat && stat.mono ? 'IDML에서 가장 많이 쓴 고정폭 글꼴 스타일' : stat && stat.heading ? '본문 흐름에서 자주 쓰는, 본문보다 크고 굵은 스타일 (큰 것부터 제목 3, 4…)' : stat && stat.body ? 'IDML에서 가장 많이 쓴 일반 스타일' : stat && stat.tag ? '원고 표식과 같은 글이 든 IDML 머리 띠가 앞에 서는 스타일' : stat && stat.table ? 'IDML에서 가장 흔한 표의 칸 글 스타일' : stat ? '원고 문단 ' + stat.total + '개 중 ' + stat.hit + '개가 IDML에서 이 스타일' : '' },
        src + (src === '학습' && stat && stat.tpl ? ' (틀)' : src === '학습' && stat && stat.mono ? ' (고정폭)' : src === '학습' && stat && stat.heading ? ' (제목 모양)' : src === '학습' && stat && stat.body ? ' (가장 많이 씀)' : src === '학습' && stat && stat.tag ? ' (머리 띠)' : src === '학습' && stat && stat.table ? ' (표)' : src === '학습' && stat ? ' ' + stat.hit + '/' + stat.total : '')) : null;
      table.append(h('tr', null,
        h('td', null, KEY_LABEL[key] || key, counts[key] ? h('span', { class: 'pt-count' }, String(counts[key]) + '개') : null),
        h('td', null, h('div', { style: 'display:flex;gap:6px;align-items:center' }, sel, badge))));
    }
    d.append(table);
    d.append(h('div', { style: 'margin-top:6px' },
      h('button', {
        class: 'pt-btn', onclick: async () => {
          S.overrides = {};
          await store.remove(K.ovr(S.tplId));
          combineMapping();
          renderDrawer();
          relayout();
        }
      }, '직접 지정 모두 지우기')));

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
      opt('문서를 왼쪽으로 밀기', check('push')),
      opt('집필 마크업 해석', check('markup')),
      opt('커서 따라가기', check('syncCursor')),
      opt('스크롤 동기화', check('syncScroll')),
      opt('IDML 반복 틀 쓰기 (장 도비라·절 시작 쪽)', check('useTemplates')),
      opt('제목을 다음 문단과 붙이기 (IDML에 없어도)', check('keepHeadings'))));

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
    if (tpl.version >= 2) {
      line('반복 틀', (tpl.templates || []).length + '종 (문서 페이지에서 찾음)');
      line('장식', Object.values(tpl.decos || {}).reduce((a, l) => a + l.length, 0) + '종 (문단 첫머리 개체)');
    } else line('반복 틀·장식', '예전 방식으로 읽은 내지입니다. IDML을 다시 올리면 읽습니다.');
    line('단락 스타일', styles.length + '개');
    const fontLine = h('div', null, h('span', { class: 'pt-k' }, '글꼴'));
    (S.fonts || []).forEach((f, i) => {
      if (i) fontLine.append(', ');
      fontLine.append(h('span', { class: f.ok ? 'pt-font-ok' : 'pt-font-miss', title: f.ok ? '설치됨' : '이 컴퓨터에 없음 → 대체 글꼴로 표시' }, (f.ok ? '✓ ' : '✗ ') + f.family));
    });
    info.append(fontLine);
    const fontFiles = h('input', { type: 'file', multiple: true, accept: '.otf,.ttf,.ttc', style: 'display:none', onchange: e => { importFonts(e.target.files); e.target.value = ''; } });
    const fontDir = h('input', { type: 'file', multiple: true, style: 'display:none', onchange: e => { importFonts(e.target.files); e.target.value = ''; } });
    fontDir.webkitdirectory = true;
    info.append(h('div', { style: 'margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center' },
      h('button', { class: 'pt-btn', onclick: () => fontDir.click() }, '글꼴 폴더 올리기'),
      h('button', { class: 'pt-btn', onclick: () => fontFiles.click() }, '글꼴 파일 올리기'),
      h('span', { style: 'color:#80868b;font-size:11px' }, 'InDesign 패키지의 Document fonts 폴더를 끌어다 놓아도 됩니다. 이 브라우저에만 저장됩니다.'),
      fontFiles, fontDir));
    d.append(info);
    const src = tpl.source || (S.index[S.tplId] && S.index[S.tplId].source);
    if (src) {
      d.append(h('div', { style: 'margin-top:8px;font-size:12px;color:#5f6368;display:flex;gap:6px;align-items:center;flex-wrap:wrap' },
        '출처: 구글 드라이브',
        h('button', { class: 'pt-btn', onclick: () => importFromDrive(src) }, '드라이브에서 다시 불러오기')));
    }
    if (!tpl.builtin) {
      d.append(h('div', { style: 'margin-top:8px' }, h('button', { class: 'pt-btn', onclick: () => { if (confirm('이 템플릿을 삭제할까요?')) deleteTemplate(S.tplId); } }, '이 템플릿 삭제')));
    }
  }

  function afterOpt(k) {
    if (k === 'push') applyWidth(true);
    else if (k === 'autoRefresh' || k === 'syncScroll') { /* noop */ }
    else if (k === 'syncCursor') { SY.fails = 0; syncModel(); }
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

  // ---------- 동기화 ----------
  // 1) 커서 따라가기: Docs 내부 텍스트 모델의 커서 위치 → 해당 문단이 있는 쪽으로 이동
  // 2) 미리보기 클릭 → Docs 커서를 그 문단으로 옮김 (Docs가 스스로 스크롤)
  // 3) 스크롤 비율 동기화: 위가 안 될 때도 동작하는 기본 동기화
  const SY = { seq: 0, model: null, fails: 0, offsets: null, cursor: -1, timer: null, muteDocs: 0, muteView: 0, docsEl: null, raf: 0 };

  function injectBridge() {
    if (!chrome.runtime || !chrome.runtime.getURL) return;
    const sc = document.createElement('script');
    sc.src = chrome.runtime.getURL('content/page-bridge.js');
    sc.onload = () => sc.remove();
    (document.head || document.documentElement).append(sc);
  }

  function modelRequest(action, extra) {
    return new Promise(resolve => {
      const id = 'pt' + Date.now() + '-' + (++SY.seq);
      const timer = setTimeout(() => { window.removeEventListener('message', on); resolve({ ok: false, error: 'timeout' }); }, 2500);
      function on(e) {
        if (e.source !== window || !e.data || e.data.kind !== 'pt:model-response' || e.data.requestId !== id) return;
        clearTimeout(timer);
        window.removeEventListener('message', on);
        resolve(e.data);
      }
      window.addEventListener('message', on);
      window.postMessage(Object.assign({ kind: 'pt:model-request', requestId: id, action, extensionId: chrome.runtime && chrome.runtime.id }, extra || {}), '*');
    });
  }

  function blockProbe(b) {
    let t = b.kind === 'warmup' ? String(b.left || '').replace(/<[^>]+>/g, '') : (b.text || '');
    return t.replace(/\s+/g, '').slice(0, 14);
  }

  // 조판 블록 ↔ Docs 텍스트 오프셋 대응표
  function alignBlocks() {
    SY.offsets = null;
    if (!SY.model || !S.blocks) return;
    const raw = SY.model;
    let ns = '';
    const map = [];
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (/\s/.test(c) || c === ' ') continue;
      ns += c;
      map.push(i);
    }
    const offs = new Array(S.blocks.length).fill(-1);
    let pos = 0;
    S.blocks.forEach((b, i) => {
      const p = blockProbe(b);
      if (p.length < 2) return;
      const k = ns.indexOf(p, pos);
      if (k < 0 || k - pos > 30000) return;
      offs[i] = map[k];
      pos = k + 1;
    });
    let last = 0;
    for (let i = 0; i < offs.length; i++) { if (offs[i] < 0) offs[i] = last; else last = offs[i]; }
    SY.offsets = offs;
  }

  async function syncModel() {
    if (!S.opts.syncCursor || SY.fails > 3) return;
    const r = await modelRequest('getText');
    if (!r.ok) { SY.fails++; return; }
    SY.fails = 0;
    SY.model = r.text;
    alignBlocks();
    if (r.selection) { SY.cursor = -1; onCursor(r.selection.start); }
  }

  function blockAt(offset) {
    const o = SY.offsets;
    if (!o) return -1;
    let lo = 0, hi = o.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (o[mid] <= offset) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  function elementsFor(bi) {
    if (!ui.pages) return [];
    let list = Array.from(ui.pages.querySelectorAll('[data-bi="' + bi + '"]'));
    // 건너뛴 블록(빈 문단 등)이면 가까운 앞 블록
    for (let k = bi - 1; !list.length && k >= 0 && bi - k < 30; k--) list = Array.from(ui.pages.querySelectorAll('[data-bi="' + k + '"]'));
    return list;
  }

  function scrollViewerTo(el, ratio) {
    const v = ui.viewer;
    const vr = v.getBoundingClientRect(), er = el.getBoundingClientRect();
    const target = v.scrollTop + er.top - vr.top - v.clientHeight * ratio;
    SY.muteView = Date.now() + 500;
    v.scrollTop = Math.max(0, target);
  }

  function onCursor(offset) {
    if (offset == null || offset === SY.cursor) return;
    SY.cursor = offset;
    const bi = blockAt(offset);
    if (bi < 0) return;
    for (const e of ui.pages.querySelectorAll('.pt-cursor')) e.classList.remove('pt-cursor');
    const els = elementsFor(bi);
    if (!els.length) return;
    els.forEach(e => e.classList.add('pt-cursor'));
    // 이미 화면 안에 있으면 움직이지 않는다
    const vr = ui.viewer.getBoundingClientRect(), er = els[0].getBoundingClientRect();
    if (er.top < vr.top + 30 || er.top > vr.bottom - 60) scrollViewerTo(els[0], 0.3);
  }

  async function pollCursor() {
    clearTimeout(SY.timer);
    if (!S.open) return;
    if (S.opts.syncCursor && SY.offsets && SY.fails <= 3 && !S.laying) {
      const r = await modelRequest('getSelection');
      if (r.ok && r.selection) onCursor(r.selection.start);
      else if (!r.ok) SY.fails++;
    }
    SY.timer = setTimeout(pollCursor, 700);
  }

  function docsScroller() {
    if (SY.docsEl && SY.docsEl.isConnected) return SY.docsEl;
    SY.docsEl = document.querySelector('.kix-appview-editor');
    if (SY.docsEl && !SY.docsEl.__ptHooked) {
      SY.docsEl.__ptHooked = true;
      SY.docsEl.addEventListener('scroll', onDocsScroll, { passive: true });
    }
    return SY.docsEl;
  }
  const fracOf = el => { const m = el.scrollHeight - el.clientHeight; return m > 0 ? el.scrollTop / m : 0; };
  const setFrac = (el, f) => { el.scrollTop = f * (el.scrollHeight - el.clientHeight); };

  function onDocsScroll() {
    if (!S.open || !S.opts.syncScroll || Date.now() < SY.muteDocs || !ui.viewer) return;
    cancelAnimationFrame(SY.raf);
    SY.raf = requestAnimationFrame(() => {
      SY.muteView = Date.now() + 200;
      setFrac(ui.viewer, fracOf(SY.docsEl));
    });
  }

  function onViewerScroll() {
    if (!S.opts.syncScroll || Date.now() < SY.muteView) return;
    const d = docsScroller();
    if (!d) return;
    cancelAnimationFrame(SY.raf);
    SY.raf = requestAnimationFrame(() => {
      SY.muteDocs = Date.now() + 200;
      setFrac(d, fracOf(ui.viewer));
    });
  }

  async function onViewerClick(e) {
    const t = e.target.closest && e.target.closest('[data-bi]');
    if (!t) { if (!(e.target.closest && e.target.closest('.pt-picker'))) closePicker(); return; }
    const bi = parseInt(t.dataset.bi, 10);
    openPicker(bi);
    SY.muteDocs = Date.now() + 1200;
    if (SY.offsets && SY.fails <= 3) {
      const off = SY.offsets[bi];
      const r = await modelRequest('setSelection', { start: off, end: off });
      if (r.ok) {
        SY.cursor = off;
        for (const x of ui.pages.querySelectorAll('.pt-cursor')) x.classList.remove('pt-cursor');
        elementsFor(bi).forEach(x => x.classList.add('pt-cursor'));
        return;
      }
    }
    // 모델을 못 쓰면 비율로 Docs를 옮긴다
    const d = docsScroller();
    if (!d) return;
    const vr = ui.pages.getBoundingClientRect(), tr = t.getBoundingClientRect();
    setFrac(d, Math.min(1, Math.max(0, (tr.top - vr.top) / Math.max(1, vr.height))));
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
    injectBridge();
  }

  globalThis.PTApp = { _printMode: printMode, toggle, importFile, importFonts, importFromDrive, refresh, relayout, setZoom, state: S, sync: SY, _loadTemplate: loadTemplate, _onCursor: o => onCursor(o), _setModel: t => { SY.model = t; alignBlocks(); } };
  init();
})();
