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
    if (P) for (const c of P.children) {
      if (c.children.length) continue;
      props[c.localName] = c.textContent;
      if (c.localName === 'BulletChar') props.BulletCharacterValue = c.getAttribute('BulletCharacterValue') || '';
    }
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
      if (self && base) { map.set(self, mixWhite(base, tv).map(clamp255)); map.set('base:' + self, base); }
    }
    return map;
  }

  function resolveColor(colors, ref, tint) {
    if (!ref || ref === 'Swatch/None') return null;
    let rgb = colors.get(ref);
    if (!rgb) return null;
    const t = num(tint, -1);
    // 농도 견본에 농도를 다시 주면 바탕 색 기준 농도로 바뀐다 (InDesign 방식)
    if (t >= 0 && t < 100) rgb = mixWhite(colors.get('base:' + ref) || rgb, t).map(clamp255);
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
    const cs = parseCharStyles(doc, colors);
    for (const r of raw.values()) {
      if (r.self === ROOT_PS) continue;
      const d = describe(r, resolve(r.self, 0), colors);
      if (d.bullet) {
        const c = cs.get(d.bullet.charStyle);
        d.bullet.color = c && c.color || null;
        delete d.bullet.charStyle;
      }
      list.push(d);
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

  // 문자 스타일: 글머리 기호 색 정도만 쓴다
  function parseCharStyles(doc, colors) {
    const out = new Map();
    if (!doc) return out;
    for (const el of doc.getElementsByTagName('CharacterStyle')) {
      const p = readProps(el);
      const fill = p.FillColor ? resolveColor(colors, p.FillColor, p.FillTint) : null;
      out.set(el.getAttribute('Self'), { color: fill, font: p.AppliedFont ? p.AppliedFont.split('\t')[0] : '', style: p.FontStyle || '' });
    }
    return out;
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
      shading: bool(p.ParagraphShadingOn) ? resolveColor(colors, p.ParagraphShadingColor || 'Color/Black', p.ParagraphShadingTint) : null,
      shade: bool(p.ParagraphShadingOn) ? boxOf(p, 'ParagraphShading', colors, false) : null,
      bullet: p.BulletsAndNumberingListType === 'BulletList' ? {
        char: String.fromCodePoint(parseInt(p.BulletCharacterValue, 10) || 8226),
        charStyle: p.BulletsCharacterStyle || ''
      } : null,
      border: bool(p.ParagraphBorderOn) ? boxOf(p, 'ParagraphBorder', colors, true) : null
    };
  }

  // 단락 음영/테두리: 오프셋(위·오른쪽·아래·왼쪽), 모서리, 폭 기준, 선 굵기
  function boxOf(p, pre, colors, isBorder) {
    const sides = ['Top', 'Right', 'Bottom', 'Left'];
    const corners = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'];
    const box = {
      color: resolveColor(colors, p[pre + 'Color'] || 'Color/Black', p[pre + 'Tint']),
      offset: sides.map(s => num(p[pre + s + 'Offset'], 0)),
      radius: corners.map(c => (p[pre + c + 'CornerOption'] && p[pre + c + 'CornerOption'] !== 'None') ? num(p[pre + c + 'CornerRadius'], 0) : 0),
      width: p[pre + 'Width'] || 'ColumnWidth',
      topOrigin: p[pre + 'TopOrigin'] || 'AscentTopOrigin',
      bottomOrigin: p[pre + 'BottomOrigin'] || 'DescentBottomOrigin'
    };
    if (isBorder) box.weight = sides.map(s => num(p[pre + s + 'LineWeight'], 1));
    return box.color ? box : null;
  }

  // ---------- 기하 ----------
  function parseMatrix(s) {
    const m = String(s || '1 0 0 1 0 0').trim().split(/\s+/).map(Number);
    return m.length === 6 && m.every(Number.isFinite) ? m : [1, 0, 0, 1, 0, 0];
  }
  function applyM(m, pt) { return [m[0] * pt[0] + m[2] * pt[1] + m[4], m[1] * pt[0] + m[3] * pt[1] + m[5]]; }
  // 요소 → 펼침면(또는 스토리 안 개체의 자기) 좌표. 스프레드/스토리에서 멈춘다.
  function toSpreadFn(el) {
    const ms = [];
    let cur = el;
    while (cur && cur.localName !== 'MasterSpread' && cur.localName !== 'Spread' && cur.localName !== 'Story') {
      if (cur.hasAttribute && cur.hasAttribute('ItemTransform')) ms.push(parseMatrix(cur.getAttribute('ItemTransform')));
      cur = cur.parentElement;
    }
    return pt => ms.reduce((p, m) => applyM(m, p), pt);
  }
  const xy = s => {
    const a = String(s || '').trim().split(/\s+/).map(Number);
    return a.length === 2 && a.every(Number.isFinite) ? a : null;
  };
  // 패스: 점마다 [기준점, 들어오는 핸들(Left), 나가는 핸들(Right)]
  function pathsOf(el, fn) {
    const out = [];
    const P = childByName(el, 'Properties');
    if (!P) return out;
    for (const gp of P.getElementsByTagName('GeometryPathType')) {
      const pts = [];
      for (const pp of gp.getElementsByTagName('PathPointType')) {
        const a = xy(pp.getAttribute('Anchor'));
        if (!a) continue;
        const l = xy(pp.getAttribute('LeftDirection')) || a, r = xy(pp.getAttribute('RightDirection')) || a;
        pts.push([fn(a), fn(l), fn(r)]);
      }
      if (pts.length) out.push({ pts, open: gp.getAttribute('PathOpen') === 'true' });
    }
    return out;
  }
  function anchorsOf(el) {
    return pathsOf(el, p => p).flatMap(p => p.pts.map(q => q[0]));
  }
  function bboxOf(pts) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  const r2 = v => Math.round(v * 100) / 100;
  // SVG 패스 문자열 (원점 이동 ox, oy)
  function pathD(paths, ox, oy) {
    const P = q => r2(q[0] - ox) + ' ' + r2(q[1] - oy);
    let d = '';
    for (const { pts, open } of paths) {
      d += 'M' + P(pts[0][0]);
      const n = pts.length;
      const seg = (a, b) => {
        const straight = a[2][0] === a[0][0] && a[2][1] === a[0][1] && b[1][0] === b[0][0] && b[1][1] === b[0][1];
        d += straight ? 'L' + P(b[0]) : 'C' + P(a[2]) + ' ' + P(b[1]) + ' ' + P(b[0]);
      };
      for (let i = 0; i + 1 < n; i++) seg(pts[i], pts[i + 1]);
      if (!open && n > 1) { seg(pts[n - 1], pts[0]); d += 'Z'; }
    }
    return d;
  }

  // 둥근 모서리 사각형: 직선 4점 패스에 모서리 옵션이 있으면 호로 그린다
  function roundedD(el, paths, ox, oy) {
    const opt = el.getAttribute('CornerOption') || el.getAttribute('TopLeftCornerOption');
    const rad = num(el.getAttribute('CornerRadius') || el.getAttribute('TopLeftCornerRadius'), 0);
    if (!opt || opt === 'None' || !(rad > 0) || paths.length !== 1) return null;
    const pts = paths[0].pts;
    if (pts.length !== 4 || pts.some(q => q[1][0] !== q[0][0] || q[1][1] !== q[0][1] || q[2][0] !== q[0][0] || q[2][1] !== q[0][1])) return null;
    const bb = bboxOf(pts.map(q => q[0]));
    const axis = pts.every(q => Math.abs(q[0][0] - bb.x) < 0.01 || Math.abs(q[0][0] - bb.x - bb.w) < 0.01);
    if (!axis) return null;
    const r = Math.min(rad, bb.w / 2, bb.h / 2);
    const x = r2(bb.x - ox), y = r2(bb.y - oy), w = r2(bb.w), h = r2(bb.h), k = r2(r);
    return 'M' + (x + k) + ' ' + y + 'H' + r2(x + w - k) + 'A' + k + ' ' + k + ' 0 0 1 ' + r2(x + w) + ' ' + r2(y + k) +
      'V' + r2(y + h - k) + 'A' + k + ' ' + k + ' 0 0 1 ' + r2(x + w - k) + ' ' + r2(y + h) +
      'H' + r2(x + k) + 'A' + k + ' ' + k + ' 0 0 1 ' + x + ' ' + r2(y + h - k) +
      'V' + r2(y + k) + 'A' + k + ' ' + k + ' 0 0 1 ' + r2(x + k) + ' ' + y + 'Z';
  }

  const OBJ = new Set(['TextFrame', 'Rectangle', 'GraphicLine', 'Oval', 'Polygon']);
  function hidden(el, stop) {
    for (let c = el; c && c !== stop; c = c.parentElement) if (c.getAttribute && c.getAttribute('Visible') === 'false') return true;
    return false;
  }
  // 컨테이너 안(자신 포함)의 개체를 쌓임 순서대로 읽는다. 좌표는 fn을 거친 값.
  function objectsIn(root) {
    const out = [];
    if (OBJ.has(root.localName)) out.push(root);
    for (const el of root.getElementsByTagName('*')) if (OBJ.has(el.localName)) out.push(el);
    return out.filter(el => !hidden(el, root.parentElement));
  }
  // 개체 하나 → 그리기용 항목 (원점 ox, oy 기준). 텍스트 프레임은 스토리 id만 둔다.
  function itemOf(el, ctx, ox, oy) {
    const type = el.localName;
    const fn = toSpreadFn(el);
    const paths = pathsOf(el, fn);
    const pts = paths.flatMap(p => p.pts.map(q => q[0]));
    if (!pts.length) return null;
    const bb = bboxOf(pts);
    const fill0 = resolveColor(ctx.colors, el.getAttribute('FillColor'), el.getAttribute('FillTint'));
    const stroke0 = resolveColor(ctx.colors, el.getAttribute('StrokeColor'), el.getAttribute('StrokeTint'));
    const weight0 = num(el.getAttribute('StrokeWeight'), 1);
    const d0 = roundedD(el, paths, ox, oy) || pathD(paths, ox, oy);
    if (type === 'TextFrame') {
      const tfp = childByName(el, 'TextFramePreference');
      const tp = tfp ? readProps(tfp) : {};
      const inset = (tp.InsetSpacing || '0 0 0 0').split(/\s+/).map(Number);
      return {
        type: 'text', id: el.getAttribute('Self') || '', story: el.getAttribute('ParentStory') || '',
        x: r2(bb.x - ox), y: r2(bb.y - oy), w: r2(bb.w), h: r2(bb.h),
        valign: tp.VerticalJustification || 'TopAlign',
        columns: Math.max(1, Math.round(num(tp.TextColumnCount, 1))), gutter: num(tp.TextColumnGutter, 12),
        inset: inset.length === 4 && inset.every(Number.isFinite) ? inset : [0, 0, 0, 0],
        // 글 상자 자체의 칠·선
        bg: (fill0 || (stroke0 && weight0 > 0)) ? { d: d0, fill: fill0, stroke: weight0 > 0 ? stroke0 : null, weight: weight0 } : null
      };
    }
    const fill = fill0, stroke = stroke0, weight = weight0;
    if (!fill && !(stroke && weight > 0)) return null;
    const closed = type !== 'GraphicLine' && paths.some(p => !p.open);
    return {
      type: 'shape', id: el.getAttribute('Self') || '',
      d: d0, x: r2(bb.x - ox), y: r2(bb.y - oy), w: r2(bb.w), h: r2(bb.h),
      fill: closed ? fill : null, stroke: weight > 0 ? stroke : null, weight
    };
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

  // ---------- 펼침면(마스터/문서) ----------
  // 펼침면의 페이지와 그 위 개체를 페이지 기준 좌표로 나눈다.
  function spreadPages(sp, ctx, sideHint) {
    const pages = Array.from(sp.children).filter(c => c.localName === 'Page').map(el => Object.assign(pageInfo(el), {
      self: el.getAttribute('Self') || '',
      master: el.getAttribute('AppliedMaster') || '',
      overrides: (el.getAttribute('OverrideList') || '').split(/\s+/).filter(Boolean)
    })).sort((a, b) => a.x - b.x);
    pages.forEach((pg, i) => {
      pg.side = !ctx.facing ? 'right' : pages.length >= 2 ? (i === 0 ? 'left' : 'right') : sideHint(pg);
      pg.items = [];
    });
    if (!pages.length) return pages;
    for (const el of objectsIn(sp)) {
      if (el === sp) continue;
      const fn = toSpreadFn(el);
      const pts = anchorsOf(el).map(fn);
      if (!pts.length) continue;
      const bb = bboxOf(pts);
      const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
      const pg = pages.find(p => cx >= p.x - 0.5 && cx <= p.x + p.w + 0.5 && cy >= p.y - 200 && cy <= p.y + p.h + 200);
      if (!pg) continue;
      const it = itemOf(el, ctx, pg.x, pg.y);
      if (it) pg.items.push(it);
    }
    return pages;
  }

  async function textOf(zip, it, ctx) {
    it.paragraphs = await loadStory(zip, it.story, ctx.stories, ctx.colors);
    return it.paragraphs.some(p => p.runs.length);
  }

  // ---------- 마스터 ----------
  async function parseMaster(zip, doc, ctx) {
    const ms = doc.getElementsByTagName('MasterSpread')[0];
    if (!ms) return null;
    const pages = spreadPages(ms, ctx, () => 'right');
    if (!pages.length) return null;
    const items = { left: [], right: [] };
    const body = { left: null, right: null };
    for (const pg of pages) {
      for (const it of pg.items) {
        if (it.type === 'text') {
          if (!(await textOf(zip, it, ctx))) {
            // 비어 있는 큰 프레임 = 본문(주 텍스트) 프레임
            if (it.w * it.h > 0.3 * pg.w * pg.h && (!body[pg.side] || it.w * it.h > body[pg.side].w * body[pg.side].h)) body[pg.side] = it;
            continue;
          }
        }
        items[pg.side].push(it);
      }
    }
    const margins = {};
    for (const pg of pages) {
      const b = body[pg.side];
      margins[pg.side] = b
        ? { top: b.y, left: b.x, right: pg.w - b.x - b.w, bottom: pg.h - b.y - b.h, columns: b.columns, gutter: b.gutter }
        : physicalMargins(pg.margin, pg.side, ctx.facing, ctx.docMargin);
    }
    if (!margins.left) { margins.left = margins.right; items.left = items.right; }
    if (!margins.right) { margins.right = margins.left; items.right = items.left; }
    return {
      self: ms.getAttribute('Self'),
      name: ms.getAttribute('Name') || ((ms.getAttribute('NamePrefix') || '') + '-' + (ms.getAttribute('BaseName') || '')),
      margins,
      items,
      left: items.left,
      right: items.right
    };
  }

  // ---------- 문서 페이지의 반복 틀 ----------
  // 본문 흐름(여러 프레임에 이어지는 스토리) 밖에 손으로 놓은 프레임·도형이 같은 구성으로
  // 여러 번 나오면 "틀"로 본다: 장 도비라, 절 시작 쪽 같은 것. 첫 사례의 배치를 그대로 쓴다.
  async function parseTemplates(zip, ctx, meta, primary) {
    const spreadNames = ctx.spreadOrder;
    const frameCount = new Map();
    const docs = [];
    for (const name of spreadNames) {
      const text = await zip.text(name);
      if (!text) continue;
      const re = /<TextFrame\b[^>]*?\bParentStory="([^"]+)"/g;
      let m;
      while ((m = re.exec(text))) frameCount.set(m[1], (frameCount.get(m[1]) || 0) + 1);
      docs.push(name);
    }
    const isThread = sid => (frameCount.get(sid) || 0) >= 3;
    // 스타일마다 본문 흐름에 몇 번 나오는지
    const inThread = new Map();
    for (const [sid, n] of frameCount) {
      if (n < 3) continue;
      const mt = meta.get(sid);
      if (mt) for (const p of mt.paras) inThread.set(p.style, (inThread.get(p.style) || 0) + 1);
    }

    const groups = new Map();
    let index = 0;
    const sideHint = pg => (/^\d+$/.test(pg.name) ? (parseInt(pg.name, 10) % 2 === 0 ? 'left' : 'right') : 'right');
    for (const name of docs) {
      let doc;
      try { doc = parseXml(await zip.text(name), name); } catch (e) { continue; }
      const sp = doc.getElementsByTagName('Spread')[0];
      if (!sp) continue;
      const pages = spreadPages(sp, ctx, sideHint);
      const views = pages.map(pg => {
        index++;
        const thread = [], frames = [], shapes = [];
        for (const it of pg.items) {
          if (it.type === 'text' && isThread(it.story)) thread.push(it);
          else if (it.type === 'text') {
            const mt = meta.get(it.story);
            if (mt && mt.paras.length) { it.styles = Array.from(new Set(mt.paras.map(p => p.style))); it.text = mt.paras.map(p => p.text).join('\n'); it.hasTable = mt.hasTable; it.paraCount = mt.paras.length; frames.push(it); }
          } else shapes.push(it);
        }
        const top = thread.length ? Math.min(...thread.map(t => t.y)) : null;
        // 틀이 될 수 있는 쪽: 전용 마스터를 쓰거나, 본문 흐름이 쪽 위쪽을 비우고 시작
        const ok = frames.length && (pg.master !== primary || (top != null && top > pg.h * 0.18));
        return { pg, thread, frames, shapes, ok, index };
      });
      // 전용 마스터를 쓰고 본문 흐름이 없는 펼침면 두 쪽은 한 틀로 묶는다
      const units = [];
      if (views.length === 2 && views.every(v => v.ok && v.pg.master !== primary && !v.thread.length) && views[0].pg.master === views[1].pg.master) units.push(views);
      else for (const v of views) if (v.ok) units.push([v]);
      for (const u of units) {
        const sig = u.map(v => v.pg.master + ':' + Array.from(new Set(v.frames.map(f => f.styles[0]))).sort().join(',')).join('|');
        let gr = groups.get(sig);
        if (!gr) groups.set(sig, gr = { sig, count: 0, first: u, texts: [] });
        gr.count++;
        // 프레임 글이 사례마다 같은지 보려고 앞쪽 몇 개만 기록
        if (gr.texts.length < 4) gr.texts.push(u.map(v => v.frames.map(f => f.styles[0] + '\u0001' + f.text)));
      }
    }

    const out = [];
    for (const gr of groups.values()) {
      if (gr.count < 2) continue;
      const pages = [];
      const keys = new Set(), styles = new Set();
      for (let k = 0; k < gr.first.length; k++) {
        const v = gr.first[k];
        const frames = [];
        for (let fi = 0; fi < v.frames.length; fi++) {
          const f = v.frames[fi];
          const sig = f.styles[0] + '\u0001' + f.text;
          // 다른 사례에도 같은 스타일·같은 글의 프레임이 있으면 고정 문구
          const constant = gr.texts.length >= 2 && gr.texts.slice(1).every(t => (t[k] || []).includes(sig));
          let maxParas = f.paraCount;
          for (const t of gr.texts) for (const s of t[k] || []) if (s.split('\u0001')[0] === f.styles[0]) maxParas = Math.max(maxParas, s.split('\u0001')[1].split('\n').length);
          // 고정 문구는 그대로 그리고, 바뀌는 자리도 글자 모양(예: 큰 '01' + 작은 '장')을 본뜨려고 첫 사례 글을 둔다
          await textOf(zip, f, ctx);
          if (!constant) for (const s of f.styles) {
            styles.add(s);
            if ((inThread.get(s) || 0) <= gr.count * 0.25) keys.add(s);
          }
          frames.push(Object.assign(f, { constant, maxParas }));
        }
        const th = v.thread;
        let flow = null;
        if (th.length) {
          const x0 = Math.min(...th.map(t => t.x)), y0 = Math.min(...th.map(t => t.y));
          const x1 = Math.max(...th.map(t => t.x + t.w)), y1 = Math.max(...th.map(t => t.y + t.h));
          flow = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, columns: th.length > 1 ? th.length : th[0].columns, gutter: th[0].gutter };
        }
        pages.push({ side: v.pg.side, master: v.pg.master, overrides: v.pg.overrides, shapes: v.shapes, frames, flow });
      }
      if (!keys.size) continue;
      out.push({ id: 'T' + out.length, count: gr.count, pages, keys: Array.from(keys), styles: Array.from(styles), startSide: gr.first.length === 2 ? gr.first[0].pg.side : '' });
    }
    out.sort((a, b) => b.count - a.count);
    return out;
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

  // ---------- 본문 샘플: 문단 텍스트 → 적용된 스타일 ----------
  // 원고 문단을 이 표에 대 보면 "이 역할은 실제로 어떤 스타일로 조판됐는지"를 배울 수 있다.
  const sampleKey = t => {
    const k = String(t || '').replace(/[\s\u00a0\uFEFF]/g, '').slice(0, 16);
    return k.length >= 3 ? k : null;
  };

  function storyParagraphs(doc, onObject) {
    const out = [];
    for (const psr of Array.from(doc.getElementsByTagName('ParagraphStyleRange'))) {
      const style = psr.getAttribute('AppliedParagraphStyle');
      let text = '', deco = -1;
      const flush = () => { if (text.trim() || deco >= 0) out.push({ style, text, deco }); text = ''; deco = -1; };
      const walk = node => {
        for (const n of node.childNodes) {
          if (n.nodeType !== 1) continue;
          const ln = n.localName;
          if (ln === 'ParagraphStyleRange') continue; // 표 칸 안의 문단은 따로 센다
          if (ln === 'Content') text += n.textContent;
          else if (ln === 'Br') flush();
          else if (OBJ.has(ln) || ln === 'Group') {
            // 문단 첫머리(글자보다 앞)에 붙은 개체만 장식 후보
            if (onObject && deco < 0 && !text.replace(/[\s﻿ ]/g, '')) deco = onObject(n, style);
          } else if (ln !== 'Properties') walk(n);
        }
      };
      walk(psr);
      flush();
    }
    return out;
  }

  // 스토리 안 개체 → 자기 좌표(왼쪽 위 0,0) 장식
  function decoOf(el, ctx) {
    if (el.getElementsByTagName('Image').length || el.getElementsByTagName('PDF').length || el.getElementsByTagName('EPS').length) return null;
    const aos = el.getElementsByTagName('AnchoredObjectSetting')[0];
    const pos = aos ? aos.getAttribute('AnchoredPosition') || 'InlinePosition' : 'InlinePosition';
    if (pos !== 'InlinePosition') return null;
    const objs = objectsIn(el);
    const pre = objs.map(e => itemOf(e, ctx, 0, 0)).filter(Boolean);
    if (!pre.length) return null;
    const x0 = Math.min(...pre.map(i => i.x)), y0 = Math.min(...pre.map(i => i.y));
    const x1 = Math.max(...pre.map(i => i.x + i.w)), y1 = Math.max(...pre.map(i => i.y + i.h));
    const items = objs.map(e => itemOf(e, ctx, x0, y0)).filter(Boolean);
    return {
      w: r2(x1 - x0), h: r2(y1 - y0),
      yOffset: num(aos && aos.getAttribute('AnchorYoffset'), 0),
      items,
      shapeSig: items.map(i => i.type + ':' + (i.fill || '') + ':' + (i.stroke || '') + ':' + Math.round(i.w) + 'x' + Math.round(i.h)).join(';')
    };
  }

  // 모든 스토리를 한 번 읽어서
  //  - samples: 문단 텍스트 → 적용된 스타일 (매핑 학습용)
  //  - meta: 스토리별 문단(스타일·글) — 반복 틀 찾기용
  //  - decos: 스타일마다 문단 첫머리에 되풀이해 붙는 인라인 개체 (말머리 표식, 배너 등)
  //  - precede: 장식만 있는 빈 문단 X가 늘 문단 Y 앞에 온다 → Y 앞에 X를 넣는다
  async function scanStories(zip, styles, ctx) {
    const index = new Map(styles.map((s, i) => [s.id, i]));
    const counts = new Map();
    const meta = new Map();
    const cands = [];
    for (const name of zip.names.filter(n => /^Stories\/.*\.xml$/.test(n))) {
      let doc;
      try { doc = parseXml(await zip.text(name), name); } catch (e) { continue; }
      const sid = name.replace(/^Stories\/Story_|\.xml$/g, '');
      const story = doc.getElementsByTagName('Story')[0];
      const toc = story && story.getAttribute('AppliedTOCStyle');
      const paras = storyParagraphs(doc, (el, style) => {
        const d = decoOf(el, ctx);
        if (!d) return -1;
        d.style = style;
        cands.push(d);
        return cands.length - 1;
      });
      meta.set(sid, { paras, hasTable: doc.getElementsByTagName('Table').length > 0 });
      // 목차 스토리는 본문 제목을 그대로 되풀이하므로 학습에서 뺀다
      if (toc && toc !== 'n') continue;
      for (const p of paras) {
        const k = sampleKey(p.text);
        const si = index.get(p.style);
        if (!k || si == null) continue;
        let m = counts.get(k);
        if (!m) counts.set(k, m = new Map());
        m.set(si, (m.get(si) || 0) + 1);
      }
    }
    const samples = {};
    for (const [k, m] of counts) samples[k] = Array.from(m).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // ---- 장식 ----
    const perStyle = new Map();
    for (const mt of meta.values()) for (const p of mt.paras) perStyle.set(p.style, (perStyle.get(p.style) || 0) + 1);
    const textOfStory = sid => { const mt = meta.get(sid); return mt ? mt.paras.map(p => p.text).join('\n').trim() : ''; };
    const groups = new Map();
    cands.forEach((c, i) => {
      c.texts = c.items.filter(it => it.type === 'text').map(it => textOfStory(it.story));
      const norm = c.texts.map(t => t.replace(/\d+/g, '#')).join('|');
      const sig = c.style + '\u0001' + c.shapeSig + '\u0001' + norm;
      let g = groups.get(sig);
      if (!g) groups.set(sig, g = { first: c, count: 0, ids: [], texts: new Set(), norm });
      g.count++;
      g.ids.push(i);
      g.texts.add(c.texts.join('|'));
    });
    const decos = {};
    const okCand = new Set();
    // 스타일 문단 중 장식이 붙은 비율(변형 합계)이 30% 이상이어야 그 스타일의 장식으로 본다
    const decorated = new Map();
    for (const g of groups.values()) if (g.count >= 3) decorated.set(g.first.style, (decorated.get(g.first.style) || 0) + g.count);
    for (const g of groups.values()) {
      const total = perStyle.get(g.first.style) || 1;
      if (g.count < 3 || (decorated.get(g.first.style) || 0) / total < 0.3) continue;
      const c = g.first;
      // 사례마다 글이 다른 프레임 = 원고 표식으로 채울 자리
      let slot = -1;
      if (g.texts.size > 1) {
        const other = cands[g.ids.find(i => cands[i].texts.join('|') !== c.texts.join('|'))];
        slot = c.texts.findIndex((t, k) => other && other.texts[k] !== t);
      }
      for (const it of c.items) if (it.type === 'text') await textOf(zip, it, ctx);
      (decos[c.style] = decos[c.style] || []).push({ count: g.count, norm: g.norm, text: c.texts.join('|'), slot, w: c.w, h: c.h, yOffset: c.yOffset, items: c.items });
      for (const i of g.ids) okCand.add(i);
    }
    for (const list of Object.values(decos)) list.sort((a, b) => b.count - a.count);

    // ---- 장식 문단이 앞에 서는 스타일 ----
    const pair = new Map(), starts = new Map();
    for (const mt of meta.values()) {
      const ps = mt.paras;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i], prev = ps[i - 1];
        if (!prev || prev.style !== p.style) starts.set(p.style, (starts.get(p.style) || 0) + 1);
        if (prev && okCand.has(prev.deco) && !prev.text.replace(/[\s﻿ ]/g, '') && prev.style !== p.style) {
          const k = prev.style + '\u0001' + p.style;
          pair.set(k, (pair.get(k) || 0) + 1);
        }
      }
    }
    const precede = {};
    for (const [k, n] of pair) {
      const [x, y] = k.split('\u0001');
      if (n >= 3 && n / (starts.get(y) || 1) >= 0.5) precede[y] = x;
    }
    return { samples, meta, decos, precede };
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

    // 펼침면 순서는 designmap에 적힌 차례
    const spreadOrder = [];
    for (const el of designmap.getElementsByTagName('*')) {
      if (el.localName === 'Spread' && el.getAttribute('src')) spreadOrder.push(el.getAttribute('src'));
    }
    if (!spreadOrder.length) spreadOrder.push(...zip.names.filter(n => /^Spreads\/.*\.xml$/.test(n)));
    // 문서 페이지에 가장 많이 적용된 마스터 = 기본 마스터
    const use = new Map();
    for (const name of spreadOrder) {
      const text = await zip.text(name);
      if (!text) continue;
      const re = /<Page\b[^>]*?\bAppliedMaster="([^"]+)"/g;
      let m;
      while ((m = re.exec(text))) use.set(m[1], (use.get(m[1]) || 0) + 1);
    }
    const ctx = { colors, facing: page.facing, docMargin, stories: new Map(), spreadOrder };
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
    const def = pick(/^본문$/) || pick(/^body(\s*text)?$/i) || styles.find(s => s.id === 'ParagraphStyle/$ID/NormalParagraphStyle') || styles[0];

    const scan = await scanStories(zip, styles, ctx);
    const templates = master ? await parseTemplates(zip, ctx, scan.meta, master.self) : [];
    // 틀에 쓰이는 마스터만 남긴다
    const usedMasters = {};
    for (const t of templates) for (const p of t.pages) {
      const m = masters.find(x => x.self === p.master);
      if (m && m !== master) usedMasters[m.self] = { name: m.name, margins: m.margins, left: m.items.left, right: m.items.right };
    }

    return {
      version: 2,
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
      samples: scan.samples,
      decos: scan.decos,
      precede: scan.precede,
      templates,
      masters: usedMasters,
      master: master ? { self: master.self, name: master.name, left: master.items.left, right: master.items.right } : null,
      masterCount: masters.length
    };
  }

  g.PTIdml = { parseIdml, sampleKey, _internals: { parseStory, parseXml, parseColors, parseMatrix } };
})(globalThis);
