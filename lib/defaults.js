// 내장 템플릿(IDML 없이 바로 보기)과 Docs 스타일 → IDML 스타일 자동 매핑 규칙
(function (g) {
  'use strict';

  const MM = 72 / 25.4;
  const SANS = 'Apple SD Gothic Neo';
  const SERIF = 'AppleMyungjo';

  function style(id, name, o) {
    return Object.assign({
      id, name, group: '', label: name,
      font: { family: SERIF, style: 'Regular' },
      size: 10, leading: 17, tracking: -25, hscale: 100,
      firstIndent: 0, leftIndent: 0, rightIndent: 0, spaceBefore: 0, spaceAfter: 0,
      justification: 'LeftJustified', color: 'rgb(0 0 0)', caps: '', underline: false,
      startParagraph: 'Anywhere', keepWithNext: 0, keepAll: false,
      ruleAbove: null, ruleBelow: null, shading: null
    }, o);
  }

  const B = 'builtin/';
  const BUILTIN = {
    version: 1,
    id: 'builtin:sinkuk',
    name: '기본 신국판 (152×225mm)',
    builtin: true,
    page: { width: 152 * MM, height: 225 * MM, facing: true },
    margins: {
      left: { top: 20 * MM, bottom: 22 * MM, left: 16 * MM, right: 19 * MM, columns: 1, gutter: 12 },
      right: { top: 20 * MM, bottom: 22 * MM, left: 19 * MM, right: 16 * MM, columns: 1, gutter: 12 }
    },
    baseline: { start: 20 * MM, step: 17, relative: 'page' },
    styles: [
      style(B + '본문', '본문', { firstIndent: 10 }),
      style(B + '장제목', '장제목', { font: { family: SANS, style: 'Bold' }, size: 20, leading: 28, tracking: -40, justification: 'LeftAlign', spaceAfter: 40, startParagraph: 'NextOddPage', keepWithNext: 2 }),
      style(B + '절제목', '절제목', { font: { family: SANS, style: 'Bold' }, size: 14, leading: 20, tracking: -30, justification: 'LeftAlign', spaceBefore: 26, spaceAfter: 10, keepWithNext: 2 }),
      style(B + '소제목', '소제목', { font: { family: SANS, style: 'Bold' }, size: 11, leading: 17, tracking: -25, justification: 'LeftAlign', spaceBefore: 14, spaceAfter: 4, keepWithNext: 2 }),
      style(B + '목록', '목록', { leftIndent: 12 }),
      style(B + '코드', '코드', { font: { family: 'D2Coding', style: 'Regular' }, mono: true, size: 8.5, leading: 13, tracking: 0, justification: 'LeftAlign', shading: 'rgb(242 242 242)', leftIndent: 6, rightIndent: 6 }),
      style(B + '박스', '박스 본문', { font: { family: SANS, style: 'Regular' }, size: 9, leading: 15, tracking: -20, shading: 'rgb(236 242 250)', leftIndent: 8, rightIndent: 8 }),
      style(B + '표', '표 본문', { font: { family: SANS, style: 'Regular' }, size: 8.5, leading: 13, tracking: -20, justification: 'LeftAlign' }),
      style(B + '각주', '각주', { size: 8, leading: 12, tracking: -20, justification: 'LeftAlign' }),
      style(B + '그림', '그림', { justification: 'CenterAlign', spaceBefore: 8, spaceAfter: 8 }),
      style(B + '쪽번호L', '쪽번호(왼쪽)', { font: { family: SANS, style: 'Regular' }, size: 8, leading: 10, tracking: 0, justification: 'LeftAlign' }),
      style(B + '쪽번호R', '쪽번호(오른쪽)', { font: { family: SANS, style: 'Regular' }, size: 8, leading: 10, tracking: 0, justification: 'RightAlign' })
    ],
    defaultStyleId: B + '본문',
    variables: {
      [B + 'rh']: { kind: 'style', styleId: B + '장제목', strategy: 'FirstOnPage', before: '', after: '' },
      [B + 'rh2']: { kind: 'style', styleId: B + '절제목', strategy: 'FirstOnPage', before: '', after: '' }
    },
    master: {
      name: 'A-마스터',
      left: [{
        type: 'text', x: 16 * MM, y: 211 * MM, w: 80 * MM, h: 5 * MM, valign: 'TopAlign', inset: [0, 0, 0, 0],
        paragraphs: [{ styleId: B + '쪽번호L', runs: [{ t: 'page' }, { t: 'text', v: '\u2003' }, { t: 'var', id: B + 'rh', v: '' }] }]
      }],
      right: [{
        type: 'text', x: (152 - 16 - 80) * MM, y: 211 * MM, w: 80 * MM, h: 5 * MM, valign: 'TopAlign', inset: [0, 0, 0, 0],
        paragraphs: [{ styleId: B + '쪽번호R', runs: [{ t: 'var', id: B + 'rh2', v: '' }, { t: 'text', v: '\u2003' }, { t: 'page' }] }]
      }]
    }
  };

  const BUILTIN_MAPPING = {
    title: B + '장제목', h1: B + '장제목', h2: B + '절제목', h3: B + '소제목', h4: B + '소제목',
    normal: B + '본문', li: B + '목록', ol: B + '목록', code: B + '코드', box: B + '박스',
    table: B + '표', footnote: B + '각주', image: B + '그림'
  };

  // 스타일 "이름"만으로 짐작하는 일반 규칙 (특정 책·출판사 이름은 넣지 않는다).
  // 실제 매핑은 IDML 본문 텍스트에서 배운 결과가 우선이고, 이 규칙은 배울 것이 없을 때만 쓴다.
  const KEY_RULES = {
    title: [/^title$|^표제$|^책\s*제목$/i],
    subtitle: [/^subtitle$|^부제$/i],
    h1: [/^(제목|heading)\s*1$|^h1$|^장\s*제목$|^chapter\s*title$/i],
    h2: [/^(제목|heading)\s*2$|^h2$|^절\s*제목$|^section\s*title$/i],
    h3: [/^(제목|heading)\s*3$|^h3$/i],
    h4: [/^(제목|heading)\s*4$|^h4$/i],
    h5: [/^(제목|heading)\s*5$|^h5$/i],
    h6: [/^(제목|heading)\s*6$|^h6$/i],
    normal: [/^본문$|^body(\s*text)?$|^basic\s*paragraph$|^normal$/i, /^기본\s*단락$/],
    li: [/^(글머리|bullet(ed)?\s*list|목록)$/i],
    ol: [/^(번호\s*목록|numbered\s*list)$/i],
    code: [/^(코드|code|source\s*code)$/i],
    table: [/^(표|표\s*본문|table|table\s*body)$/i],
    footnote: [/^(각주|footnote)$/i],
    caption: [/^(캡션|caption|그림\s*설명)$/i],
    goal: [/(^|[_\s])학습\s*목표$/, /^(learning\s*)?objectives?$/i]
  };

  const leaf = name => String(name || '').split(':').pop().trim();

  function guessMapping(tpl) {
    if (tpl.builtin) return Object.assign({}, BUILTIN_MAPPING);
    const styles = tpl.styles.filter(s => !/^\[/.test(s.name));
    const out = {};
    for (const key of Object.keys(KEY_RULES)) {
      for (const re of KEY_RULES[key]) {
        const hit = styles.find(s => re.test(leaf(s.name)));
        if (hit) { out[key] = hit.id; break; }
      }
    }
    if (!out.normal && tpl.defaultStyleId) out.normal = tpl.defaultStyleId;
    return out;
  }

  g.PTDefaults = { BUILTIN, guessMapping, MM };
})(globalThis);
