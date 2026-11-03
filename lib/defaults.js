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

  // 앞 패턴일수록 우선. 스타일 이름은 그룹 접두어를 뗀 이름(leaf)으로 비교한다.
  const KEY_RULES = {
    title: [/책\s*제목|표제|^title$|book\s*title/i],
    subtitle: [/^부제$|subtitle/i],
    h1: [/도비라_장제목/, /장\s*제목|^장$|chapter\s*title|대제목|제목\s*1|heading\s*1|^h1$/i],
    chapterNum: [/도비라_장번호/, /장\s*번호|chapter\s*num/i],
    goal: [],
    toc: [/공부내용/],
    h2: [/챕터제목/, /절\s*제목|^절$|제목\s*2|heading\s*2|section|^h2$/i],
    sectionNum: [/^중제숫자$/, /절\s*번호/],
    h3: [/^본문_중제목$/, /^중제목$|제목\s*3|heading\s*3|^h3$/i],
    h4: [/^본문_소소제목$/, /소소제목|^소제목$|제목\s*4|heading\s*4|^h4$/i],
    h5: [/^heading\s*5$/i, /제목\s*5/],
    h6: [/^heading\s*6$/i, /제목\s*6/],
    normal: [/^본문_본문$/, /^본문$/, /^body$/i, /body\s*text|basic\s*paragraph/i, /^normal$/i, /기본\s*단락/],
    li: [/점S$/, /글머리|불릿|bullet/i, /목록|리스트|list/i],
    liLast: [/점E$/],
    ol: [/번호S$/, /번호\s*목록|numbered/i],
    olLast: [/번호E$/],
    code: [/코딩S_회색$/, /코드|code|코딩|소스|listing/i],
    box: [/^본문_박스본문$/, /박스|box/i],
    table: [/도표텍스트라이트/, /표\s*본문|table\s*body/i, /^표$|table/i],
    tableHead: [/도표텍스트볼드/, /표\s*머리|table\s*head/i],
    footnote: [/각주|footnote/i],
    caption: [/그림설명|캡션|caption/i],
    image: [/^그림$|^figure$/i],
    note: [/tip_회색배경$/, /^tip|note|^팁/i],
    coachTitle: [/할수있다제목/, /코칭\s*제목/],
    coach: [/^본문_박스본문$/, /코칭/],
    coachLast: [/박스본문E 끝$/, /박스본문E$/],
    prompt: [/사람면색\(처음, 둘째줄\)ai앞/, /사람면색|프롬프트|prompt/i],
    promptLast: [/사람면색\(처음, 둘째줄\) 끝/],
    ai: [/로봇면색\(중간\)$/, /로봇면색|ai\s*답변|ai대화/i],
    aiLast: [/로봇면색\(마지막\)/],
    summaryTitle: [/^핵심요약$/, /핵심\s*요약/],
    practice: [/바로활용제목/, /실습\s*제목/],
    warmup: [/^워밍업$/]
  };

  const leaf = name => String(name || '').split(':').pop().trim();

  function guessMapping(tpl) {
    if (tpl.builtin) return Object.assign({}, BUILTIN_MAPPING);
    const styles = tpl.styles.filter(s => !/^\[/.test(s.name) && !/사본/.test(s.name));
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
