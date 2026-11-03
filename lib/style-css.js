// 조판 스타일 설명자 → CSS 변환, 글꼴 처리
(function (g) {
  'use strict';

  const WEIGHTS = [
    [/hairline|thin|\bth\b/, 100],
    [/extra\s*light|ultra\s*light|\bel\b|\bul\b|\bxl\b/, 200],
    [/light|\blt\b|\bl\b/, 300],
    [/medium|\bmd\b|\bm\b/, 500],
    [/semi\s*bold|demi\s*bold|\bsb\b|\bdb\b/, 600],
    [/extra\s*bold|ultra\s*bold|\beb\b|\bxb\b/, 800],
    [/black|heavy|\bhv\b|\bblk\b|\bh\b/, 900],
    [/bold|\bbd\b|\bb\b/, 700]
  ];

  function fontWeight(style) {
    const s = String(style || '').toLowerCase().replace(/[_-]/g, ' ');
    const n = s.match(/\b([1-9]00)\b/);
    if (n) return parseInt(n[1], 10);
    for (const [re, w] of WEIGHTS) if (re.test(s)) return w;
    return 400;
  }

  function isItalic(style) { return /italic|oblique|\bit\b/i.test(style || ''); }

  function q(s) { return '"' + String(s).replace(/["\\]/g, '\\$&') + '"'; }

  const SERIF_FALLBACK = ['"AppleMyungjo"', '"Noto Serif KR"', '"Nanum Myeongjo"', '"Batang"', 'serif'];
  const SANS_FALLBACK = ['"Apple SD Gothic Neo"', '"Noto Sans KR"', '"Malgun Gothic"', 'sans-serif'];
  const MONO_FALLBACK = ['"D2Coding"', '"Menlo"', '"Consolas"', 'monospace'];

  function looksSerif(name) {
    return /명조|바탕|myeong|myung|batang|serif|minion|garamond|times|mincho|song/i.test(name) && !/sans|고딕|gothic|돋움|dotum/i.test(name);
  }
  function looksMono(name) {
    return /mono|code|coding|consolas|courier|menlo/i.test(name);
  }

  function familyStack(font, forceMono) {
    const fam = (font && font.family) || '';
    const style = (font && font.style) || '';
    const list = [];
    if (fam) {
      if (style && !/^regular$/i.test(style)) list.push(q(fam + ' ' + style));
      list.push(q(fam));
    }
    const fb = forceMono || looksMono(fam) ? MONO_FALLBACK : looksSerif(fam) ? SERIF_FALLBACK : SANS_FALLBACK;
    return list.concat(fb).join(', ');
  }

  function justify(j) {
    switch (j) {
      case 'CenterAlign': return { align: 'center', last: 'center' };
      case 'RightAlign': return { align: 'right', last: 'right' };
      case 'LeftJustified': return { align: 'justify', last: 'left' };
      case 'RightJustified': return { align: 'justify', last: 'right' };
      case 'CenterJustified': return { align: 'justify', last: 'center' };
      case 'FullyJustified': return { align: 'justify', last: 'justify' };
      case 'ToBindingSide': return { align: 'left', last: 'left', binding: 'to' };
      case 'AwayFromBindingSide': return { align: 'right', last: 'right', binding: 'away' };
      default: return { align: 'left', last: 'left' };
    }
  }

  function n(v) { return Math.round((Number(v) || 0) * 1000) / 1000; }

  function declFor(d) {
    const a = [];
    a.push('font-family:' + familyStack(d.font, d.mono));
    a.push('font-size:' + n(d.size) + 'pt');
    a.push('line-height:' + n(d.leading) + 'pt');
    a.push('font-weight:' + (d.weight || fontWeight(d.font && d.font.style)));
    a.push('font-style:' + (isItalic(d.font && d.font.style) ? 'italic' : 'normal'));
    a.push('letter-spacing:' + n((d.tracking || 0) / 1000) + 'em');
    a.push('text-indent:' + n(d.firstIndent) + 'pt');
    a.push('padding:' + [d.spaceBefore, d.rightIndent, d.spaceAfter, d.leftIndent].map(v => n(v) + 'pt').join(' '));
    const j = justify(d.justification);
    a.push('text-align:' + j.align, 'text-align-last:' + j.last);
    a.push('color:' + (d.color || 'rgb(0 0 0)'));
    if (d.caps === 'AllCaps') a.push('text-transform:uppercase');
    else if (d.caps === 'SmallCaps') a.push('font-variant-caps:small-caps');
    if (d.underline) a.push('text-decoration:underline');
    if (d.hscale && d.hscale !== 100) a.push('font-stretch:' + n(d.hscale) + '%');
    if (d.shading) a.push('background-color:' + d.shading);
    // 단락 괘선: 단락 앞/뒤 간격 안쪽, 글줄 가까이에 그린다 (InDesign 괘선 오프셋 근사)
    const bg = [];
    const rule = (r, edge, space) => {
      const w = Math.max(0.25, r.weight);
      const pos = Math.max(0, space - Math.max(0, r.offset) - w);
      bg.push({ img: 'linear-gradient(' + r.color + ',' + r.color + ')', size: '100% ' + n(w) + 'pt', pos: 'left 0 ' + edge + ' ' + n(pos) + 'pt' });
    };
    if (d.ruleAbove) rule(d.ruleAbove, 'top', d.spaceBefore);
    if (d.ruleBelow) rule(d.ruleBelow, 'bottom', d.spaceAfter);
    if (bg.length) {
      a.push('background-image:' + bg.map(b => b.img).join(','));
      a.push('background-size:' + bg.map(b => b.size).join(','));
      a.push('background-position:' + bg.map(b => b.pos).join(','));
      a.push('background-repeat:no-repeat');
    }
    return a.join(';');
  }

  function rulesFor(sel, d) {
    const j = justify(d.justification);
    let css = sel + '{' + declFor(d) + '}\n';
    if (j.align === 'justify') css += sel + '.pt-broken{text-align-last:justify}\n';
    if (j.binding === 'to') css += '.pt-left ' + sel + '{text-align:right;text-align-last:right}\n';
    if (j.binding === 'away') css += '.pt-left ' + sel + '{text-align:left;text-align-last:left}\n';
    return css;
  }

  // 설치 여부 확인: 지정 글꼴과 기본 글꼴의 폭이 같으면 없는 것으로 본다.
  let canvas = null;
  const fontCache = new Map();
  function fontAvailable(family) {
    if (!family) return true;
    if (fontCache.has(family)) return fontCache.get(family);
    canvas = canvas || document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const sample = '가나다라마바사 아자차카 abcdefgHIJK 0123456789';
    let ok = false;
    for (const base of ['monospace', 'serif', 'sans-serif']) {
      ctx.font = '40px ' + base;
      const w0 = ctx.measureText(sample).width;
      ctx.font = '40px ' + q(family) + ', ' + base;
      if (Math.abs(ctx.measureText(sample).width - w0) > 0.1) { ok = true; break; }
    }
    fontCache.set(family, ok);
    return ok;
  }

  g.PTStyle = { fontWeight, isItalic, familyStack, justify, declFor, rulesFor, fontAvailable, looksSerif };
})(globalThis);
