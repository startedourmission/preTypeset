// IDML → 조판 템플릿(JSON) 변환.
// 판형·여백·단, 기준선 격자, 단락 스타일(상속 해석), 마스터 페이지(쪽번호·머리글·도형), 텍스트 변수를 읽는다.
(function (g) {
  'use strict';

  const ROOT_PS = 'ParagraphStyle/$ID/[No paragraph style]';

  function num(v, d) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : d;
  }
  function bool(v) { return v === true || v === 'true'; }

  function parseXml(text, name) {
    if (text == null) throw new Error((name || 'XML') + ' 파일이 없습니다.');
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error((name || 'XML') + ' 파싱에 실패했습니다.');
    return doc;
  }

  function childByName(el, name) {
    for (const c of el.children) if (c.localName === name) return c;
    return null;
  }

  function displayName(raw) {
    if (!raw) return '';
    const s = raw.replace(/^\$ID\//, '');
    if (s === 'NormalParagraphStyle') return '기본 단락';
    if (s === '[No paragraph style]') return '[단락 스타일 없음]';
    return s;
  }

  function readProps(el) {
    const props = {};
    for (const a of el.attributes) props[a.name] = a.value;
    const P = childByName(el, 'Properties');
    if (P) for (const c of P.children) if (c.children.length === 0) props[c.localName] = c.textContent;
    return props;
  }

  // ---------- 색상 ----------
  function clamp255(v) { return Math.max(0, Math.min(255, Math.round(v))); }
  function cmykToRgb(c, m, y, k) {
    c /= 100; m /= 100; y /= 100; k /= 100;
    return [255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k)];
  }
  function labToRgb(L, a, b) {
    let y = (L + 16) / 116, x = a / 500 + y, z = y - b / 200;
    const f = t => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
    x = 0.95047 * f(x); y = f(y); z = 1.08883 * f(z);
    let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
    let gg = x * -0.9689 + y * 1.8758 + z * 0.0415;
    let bb = x * 0.0557 + y * -0.2040 + z * 1.0570;
    const gam = v => (v > 0.0031308 ? 1.055 * Math.pow(v, 1 / 2.4) - 0.055 : 12.92 * v);
    return [gam(r) * 255, gam(gg) * 255, gam(bb) * 255];
  }
  function mixWhite(rgb, tint) {
    const t = tint / 100;
    return rgb.map(v => 255 - (255 - v) * t);
  }

  function parseColors(doc) {
    const map = new Map();
    map.set('Color/Black', [0, 0, 0]);
    map.set('Color/Paper', [255, 255, 255]);
    if (!doc) return map;
    for (const el of doc.getElementsByTagName('Color')) {
      const self = el.getAttribute('Self');
      const space = el.getAttribute('Space');
      const v = (el.getAttribute('ColorValue') || '').trim().split(/\s+/).map(Number);
      let rgb = null;
      if (space === 'CMYK' && v.length >= 4) rgb = cmykToRgb(v[0], v[1], v[2], v[3]);
      else if (space === 'RGB' && v.length >= 3) rgb = v.slice(0, 3);
      else if (space === 'LAB' && v.length >= 3) rgb = labToRgb(v[0], v[1], v[2]);
      if (self && rgb) map.set(self, rgb.map(clamp255));
    }
    for (const el of doc.getElementsByTagName('Tint')) {
      const self = el.getAttribute('Self');
      const base = map.get(el.getAttribute('BaseColor'));
      const tv = num(el.getAttribute('TintValue'), 100);
      if (self && base) map.set(self, mixWhite(base, tv).map(clamp255));
    }
    return map;
  }

  function resolveColor(colors, ref, tint) {
    if (!ref || ref === 'Swatch/None') return null;
    let rgb = colors.get(ref);
    if (!rgb) return null;
    const t = num(tint, -1);
    if (t >= 0 && t < 100) rgb = mixWhite(rgb, t).map(clamp255);
    return 'rgb(' + rgb.join(' ') + ')';
  }

  // ---------- 단락 스타일 ----------
  function parseParagraphStyles(doc, colors) {
    const raw = new Map();
    for (const el of doc.getElementsByTagName('ParagraphStyle')) {
      const self = el.getAttribute('Self');
      if (!self) continue;
      const groups = [];
      let p = el.parentElement;
      while (p && p.localName === 'ParagraphStyleGroup') {
        groups.unshift(displayName(p.getAttribute('Name')));
        p = p.parentElement;
      }
      raw.set(self, { self, name: displayName(el.getAttribute('Name')), group: groups.join(' / '), props: readProps(el) });
    }

    const cache = new Map();
    function resolve(self, depth) {
      if (cache.has(self)) return cache.get(self);
      const r = raw.get(self);
      if (!r || depth > 40) return {};
      let base = {};
      let b = r.props.BasedOn;
      if (b && !/^ParagraphStyle\//.test(b)) b = 'ParagraphStyle/' + b;
      if (b && b !== self && raw.has(b)) base = resolve(b, depth + 1);
      else if (self !== ROOT_PS && raw.has(ROOT_PS)) base = resolve(ROOT_PS, depth + 1);
      const out = Object.assign({}, base, r.props);
      delete out.BasedOn;
      cache.set(self, out);
      return out;
    }

    const list = [];
    for (const r of raw.values()) {
      if (r.self === ROOT_PS) continue;
      list.push(describe(r, resolve(r.self, 0), colors));
    }
    return list;
  }

  function ruleOf(p, prefix, colors, textColor) {
    if (!bool(p[prefix])) return null;
    const ref = p[prefix + 'Color'];
    return {
      weight: num(p[prefix + 'LineWeight'], 1),
      color: resolveColor(colors, ref, p[prefix + 'Tint']) || textColor || 'rgb(0 0 0)',
      offset: num(p[prefix + 'Offset'], 0)
    };
  }

  function describe(r, p, colors) {
    const size = num(p.PointSize, 12);
    const autoLead = num(p.AutoLeading, 120);
    const lead = (p.Leading === undefined || p.Leading === 'Auto') ? size * autoLead / 100 : num(p.Leading, size * 1.2);
    const color = resolveColor(colors, p.FillColor || 'Color/Black', p.FillTint);
    return {
      id: r.self,
      name: r.name,
      group: r.group,
      label: r.group ? r.group + ' / ' + r.name : r.name,
      font: { family: (p.AppliedFont || '').split('\t')[0], style: p.FontStyle || 'Regular' },
      size,
      leading: lead,
      tracking: num(p.Tracking, 0),
      hscale: num(p.HorizontalScale, 100),
      firstIndent: num(p.FirstLineIndent, 0),
      leftIndent: num(p.LeftIndent, 0),
      rightIndent: num(p.RightIndent, 0),
      spaceBefore: num(p.SpaceBefore, 0),
      spaceAfter: num(p.SpaceAfter, 0),
      justification: p.Justification || 'LeftAlign',
      color,
      caps: p.Capitalization || '',
      underline: bool(p.Underline),
      startParagraph: p.StartParagraph || 'Anywhere',
      keepWithNext: num(p.KeepWithNext, 0),
      keepAll: bool(p.KeepLinesTogether) && bool(p.KeepAllLinesTogether),
      ruleAbove: ruleOf(p, 'RuleAbove', colors, color),
      ruleBelow: ruleOf(p, 'RuleBelow', colors, color),
      shading: bool(p.ParagraphShadingOn) ? resolveColor(colors, p.ParagraphShadingColor, p.ParagraphShadingTint) : null
    };
  }

  // ---------- 기하 ----------
  function parseMatrix(s) {
    const m = String(s || '1 0 0 1 0 0').trim().split(/\s+/).map(Number);
    return m.length === 6 && m.every(Number.isFinite) ? m : [1, 0, 0, 1, 0, 0];
  }
  function applyM(m, pt) { return [m[0] * pt[0] + m[2] * pt[1] + m[4], m[1] * pt[0] + m[3] * pt[1] + m[5]]; }
  function toSpreadFn(el) {
    const ms = [];
    let cur = el;
    while (cur && cur.localName !== 'MasterSpread' && cur.localName !== 'Spread') {
      if (cur.hasAttribute && cur.hasAttribute('ItemTransform')) ms.push(parseMatrix(cur.getAttribute('ItemTransform')));
      cur = cur.parentElement;
    }
    return pt => ms.reduce((p, m) => applyM(m, p), pt);
  }
  function anchorsOf(el) {
    const out = [];
    const P = childByName(el, 'Properties');
    if (!P) return out;
    for (const pp of P.getElementsByTagName('PathPointType')) {
      const a = (pp.getAttribute('Anchor') || '').trim().split(/\s+/).map(Number);
      if (a.length === 2 && a.every(Number.isFinite)) out.push(a);
    }
    return out;
  }
  function bboxOf(pts) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }

  function pageInfo(pageEl) {
    const toSpread = toSpreadFn(pageEl);
    const gb = (pageEl.getAttribute('GeometricBounds') || '0 0 0 0').trim().split(/\s+/).map(Number);
    const box = bboxOf([[gb[1], gb[0]], [gb[3], gb[2]]].map(toSpread));
    const mp = childByName(pageEl, 'MarginPreference');
    return Object.assign(box, { name: pageEl.getAttribute('Name') || '', margin: mp ? readProps(mp) : null });
  }

  function physicalMargins(mp, side, facing, fallback) {
    const src = mp || fallback || {};
    const top = num(src.Top, 36), bottom = num(src.Bottom, 36);
    const L = num(src.Left, 36), R = num(src.Right, 36);
    const columns = Math.max(1, Math.round(num(src.ColumnCount, 1)));
    const gutter = num(src.ColumnGutter, 12);
    // 마주보는 페이지에서 Left=안쪽, Right=바깥쪽. 왼쪽 페이지는 물리적으로 좌우가 뒤집힌다.
    if (facing && side === 'left') return { top, bottom, left: R, right: L, columns, gutter };
    return { top, bottom, left: L, right: R, columns, gutter };
  }

  // ---------- 스토리 ----------
  // 단락/문자 범위의 로컬 서식(스타일 위에 덧씌운 값)
  function localOverrides(el, colors) {
    const p = readProps(el);
    const o = {};
    if (p.PointSize) o.size = num(p.PointSize, 0);
    if (p.FontStyle) o.style = p.FontStyle;
    if (p.AppliedFont) o.family = p.AppliedFont.split('\t')[0];
    if (p.FillColor && colors) { const c = resolveColor(colors, p.FillColor, p.FillTint); if (c) o.color = c; }
    if (p.Tracking) o.tracking = num(p.Tracking, 0);
    if (p.Justification) o.justification = p.Justification;
    return o;
  }

  function parseStory(doc, colors) {
    const story = doc.getElementsByTagName('Story')[0];
    const paras = [];
    if (!story) return paras;
    let cur = null, pending = false, curStyle = null, curPara = {}, curChar = {};
    function ensure() {
      if (!cur || pending) { cur = { styleId: curStyle, over: curPara, runs: [] }; paras.push(cur); pending = false; }
    }
    const withStyle = run => (Object.keys(curChar).length ? Object.assign(run, { st: curChar }) : run);
    function pi(n) {
      if (n.target !== 'ACE') return;
      const code = String(n.data).trim();
      ensure();
      if (code === '18') cur.runs.push(withStyle({ t: 'page' }));
      else if (code === '8') cur.runs.push(withStyle({ t: 'text', v: '\t' }));
    }
    function walk(node) {
      for (const n of node.childNodes) {
        if (n.nodeType === 7) { pi(n); continue; }
        if (n.nodeType !== 1) continue;
        const ln = n.localName;
        if (ln === 'ParagraphStyleRange') {
          curStyle = n.getAttribute('AppliedParagraphStyle');
          curPara = localOverrides(n, colors);
          if (cur && !pending && cur.runs.length === 0) { cur.styleId = curStyle; cur.over = curPara; }
          walk(n);
        } else if (ln === 'CharacterStyleRange') {
          const prev = curChar;
          curChar = localOverrides(n, colors);
          delete curChar.justification;
          walk(n);
          curChar = prev;
        } else if (ln === 'Content') {
          // <Content> 안에 <?ACE 18?>(쪽번호) 같은 처리 지시가 섞여 있을 수 있다
          for (const c of n.childNodes) {
            if (c.nodeType === 7) { pi(c); continue; }
            const v = (c.nodeValue || '').replace(/\uFEFF/g, '');
            if (v) { ensure(); cur.runs.push(withStyle({ t: 'text', v })); }
          }
        } else if (ln === 'Br') {
          ensure();
          pending = true;
        } else if (ln === 'TextVariableInstance') {
          ensure();
          cur.runs.push(withStyle({ t: 'var', id: n.getAttribute('AssociatedTextVariable'), v: n.getAttribute('ResultText') || '' }));
        } else if (ln === 'Properties' || ln === 'Table' || ln === 'Rectangle' || ln === 'Note' || ln === 'Footnote') {
          continue;
        } else {
          walk(n);
        }
      }
    }
    walk(story);
    return paras.filter((p, i) => p.runs.length || i < paras.length - 1);
  }

  async function loadStory(zip, id, cache, colors) {
    if (!id) return [];
    if (cache.has(id)) return cache.get(id);
    const text = await zip.text('Stories/Story_' + id + '.xml');
    const res = text ? parseStory(parseXml(text, 'Story_' + id), colors) : [];
    cache.set(id, res);
    return res;
  }

  // ---------- 마스터 ----------
  async function parseMaster(zip, doc, ctx) {
    const ms = doc.getElementsByTagName('MasterSpread')[0];
    if (!ms) return null;
    const pages = Array.from(ms.children).filter(c => c.localName === 'Page').map(pageInfo).sort((a, b) => a.x - b.x);
    if (!pages.length) return null;
    const sideOf = i => (pages.length >= 2 ? (i === 0 ? 'left' : 'right') : 'right');
    const items = { left: [], right: [] };
    const body = { left: null, right: null };
    const types = ['TextFrame', 'Rectangle', 'GraphicLine', 'Oval', 'Polygon'];

    for (const type of types) {
      for (const el of Array.from(ms.getElementsByTagName(type))) {
        if (el.getAttribute('Visible') === 'false') continue;
        const toSpread = toSpreadFn(el);
        const pts = anchorsOf(el).map(toSpread);
        if (!pts.length) continue;
        const bb = bboxOf(pts);
        const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
        const pi = pages.findIndex(pg => cx >= pg.x - 0.5 && cx <= pg.x + pg.w + 0.5 && cy >= pg.y - 200 && cy <= pg.y + pg.h + 200);
        if (pi < 0) continue;
        const pg = pages[pi];
        const side = sideOf(pi);
        const rel = pts.map(p => [p[0] - pg.x, p[1] - pg.y]);
        const rb = bboxOf(rel);

        if (type === 'TextFrame') {
          const story = await loadStory(zip, el.getAttribute('ParentStory'), ctx.stories, ctx.colors);
          const tfp = childByName(el, 'TextFramePreference');
          const tp = tfp ? readProps(tfp) : {};
          const hasText = story.some(p => p.runs.length);
          if (!hasText) {
            // 비어 있는 큰 프레임 = 본문(주 텍스트) 프레임으로 본다.
            if (rb.w * rb.h > 0.3 * pg.w * pg.h && (!body[side] || rb.w * rb.h > body[side].w * body[side].h)) {
              body[side] = Object.assign({}, rb, {
                columns: Math.max(1, Math.round(num(tp.TextColumnCount, 1))),
                gutter: num(tp.TextColumnGutter, 12)
              });
            }
            continue;
          }
          const inset = (tp.InsetSpacing || '0 0 0 0').split(/\s+/).map(Number);
          items[side].push({
            type: 'text', x: rb.x, y: rb.y, w: rb.w, h: rb.h,
            valign: tp.VerticalJustification || 'TopAlign',
            inset: inset.length === 4 && inset.every(Number.isFinite) ? inset : [0, 0, 0, 0],
            paragraphs: story
          });
        } else {
          const fill = resolveColor(ctx.colors, el.getAttribute('FillColor'), el.getAttribute('FillTint'));
          const stroke = resolveColor(ctx.colors, el.getAttribute('StrokeColor'), el.getAttribute('StrokeTint'));
          const weight = num(el.getAttribute('StrokeWeight'), 1);
          if (!fill && !(stroke && weight > 0)) continue;
          const gp = el.getElementsByTagName('GeometryPathType')[0];
          items[side].push({
            type: 'shape', points: rel,
            closed: type !== 'GraphicLine' && !(gp && gp.getAttribute('PathOpen') === 'true'),
            oval: type === 'Oval', fill, stroke: weight > 0 ? stroke : null, weight
          });
        }
      }
    }

    const margins = {};
    const pageW = pages[0].w, pageH = pages[0].h;
    pages.forEach((pg, i) => {
      const side = sideOf(i);
      const b = body[side];
      margins[side] = b
        ? { top: b.y, left: b.x, right: pageW - b.x - b.w, bottom: pageH - b.y - b.h, columns: b.columns, gutter: b.gutter }
        : physicalMargins(pg.margin, side, ctx.facing, ctx.docMargin);
    });
    if (!margins.left) { margins.left = margins.right; items.left = items.right; }
    return {
      self: ms.getAttribute('Self'),
      name: ms.getAttribute('Name') || ((ms.getAttribute('NamePrefix') || '') + '-' + (ms.getAttribute('BaseName') || '')),
      margins,
      items
    };
  }

  function parseVariables(designmap) {
    const vars = {};
    for (const tv of designmap.getElementsByTagName('TextVariable')) {
      const self = tv.getAttribute('Self');
      const type = tv.getAttribute('VariableType');
      if (!self) continue;
      if (type === 'MatchParagraphStyleType') {
        const pref = tv.getElementsByTagName('MatchParagraphStylePreference')[0];
        const p = pref ? readProps(pref) : {};
        vars[self] = {
          kind: 'style', styleId: p.AppliedParagraphStyle || '',
          strategy: p.SearchStrategy || 'FirstOnPage',
          before: p.TextBefore || '', after: p.TextAfter || ''
        };
      } else if (type === 'LastPageNumberType') {
        vars[self] = { kind: 'lastPage' };
      } else {
        vars[self] = { kind: 'static' };
      }
    }
    return vars;
  }

  async function parseIdml(buffer, fileName) {
    const zip = await g.PTZip.readZip(buffer);
    if (!zip.has('designmap.xml')) throw new Error('IDML 패키지가 아닙니다. (designmap.xml 없음)');
    const designmap = parseXml(await zip.text('designmap.xml'), 'designmap.xml');
    const prefs = zip.has('Resources/Preferences.xml') ? parseXml(await zip.text('Resources/Preferences.xml'), 'Preferences.xml') : null;
    const stylesDoc = parseXml(await zip.text('Resources/Styles.xml'), 'Styles.xml');
    const graphicDoc = zip.has('Resources/Graphic.xml') ? parseXml(await zip.text('Resources/Graphic.xml'), 'Graphic.xml') : null;
    const colors = parseColors(graphicDoc);

    const dp = prefs && prefs.getElementsByTagName('DocumentPreference')[0];
    const page = {
      width: num(dp && dp.getAttribute('PageWidth'), 595.28),
      height: num(dp && dp.getAttribute('PageHeight'), 841.89),
      facing: dp ? dp.getAttribute('FacingPages') !== 'false' : true
    };
    const dmEl = prefs && prefs.getElementsByTagName('MarginPreference')[0];
    const docMargin = dmEl ? readProps(dmEl) : null;
    const gp = prefs && prefs.getElementsByTagName('GridPreference')[0];
    const baseline = {
      start: num(gp && gp.getAttribute('BaselineStart'), 36),
      step: num(gp && gp.getAttribute('BaselineDivision'), 12),
      relative: gp && /Margin/.test(gp.getAttribute('BaselineGridRelativeOption') || '') ? 'margin' : 'page'
    };

    const styles = parseParagraphStyles(stylesDoc, colors);
    // 쪽번호 형식: 앞자리 0 (001, 01 …)
    const sec = designmap.getElementsByTagName('Section')[0];
    const pns = sec ? (readProps(sec).PageNumberStyle || '') : '';
    const folioDigits = { SingleLeadingZeros: 2, DoubleLeadingZeros: 3, TripleLeadingZeros: 4 }[pns] || 0;
    const variables = parseVariables(designmap);

    // 문서 페이지에 가장 많이 적용된 마스터를 고른다.
    const use = new Map();
    for (const name of zip.names.filter(n => /^Spreads\/.*\.xml$/.test(n))) {
      const text = await zip.text(name);
      const re = /<Page\b[^>]*?\bAppliedMaster="([^"]+)"/g;
      let m;
      while ((m = re.exec(text))) use.set(m[1], (use.get(m[1]) || 0) + 1);
    }
    const ctx = { colors, facing: page.facing, docMargin, stories: new Map() };
    const masters = [];
    for (const name of zip.names.filter(n => /^MasterSpreads\/.*\.xml$/.test(n))) {
      const m = await parseMaster(zip, parseXml(await zip.text(name), name), ctx);
      if (m) masters.push(m);
    }
    masters.sort((a, b) => (use.get(b.self) || 0) - (use.get(a.self) || 0));
    const master = masters[0] || null;

    const margins = master ? master.margins : {
      left: physicalMargins(docMargin, 'left', page.facing),
      right: physicalMargins(docMargin, 'right', page.facing)
    };

    const leafName = s => s.name.split(':').pop();
    const pick = re => styles.find(s => re.test(leafName(s)));
    const def = pick(/^본문_본문$/) || pick(/^본문$/) || pick(/^body/i) || styles.find(s => s.id === 'ParagraphStyle/$ID/NormalParagraphStyle') || styles[0];

    return {
      version: 1,
      id: '',
      name: (fileName || 'template').replace(/\.idml$/i, ''),
      createdAt: Date.now(),
      page,
      margins,
      baseline,
      styles,
      defaultStyleId: def ? def.id : '',
      variables,
      folioDigits,
      master: master ? { name: master.name, left: master.items.left, right: master.items.right } : null,
      masterCount: masters.length
    };
  }

  g.PTIdml = { parseIdml, _internals: { parseStory, parseXml, parseColors, parseMatrix } };
})(globalThis);
