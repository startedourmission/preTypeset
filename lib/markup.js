// 집필 마크업 해석
// 원고의 태그(골든래빗 집필 가이드)를 읽어 각 문단에 "역할(role)"만 붙이고 태그 글자는 지운다.
// 모양은 만들지 않는다. 역할마다 어떤 IDML 스타일을 쓸지는 매핑(학습/직접 지정)이 정한다.
//
//   제목 1 "01장 제목"                 → chapterNum("01장") + h1("제목")
//     "학습 목표" / 이어지는 문단       → goalTitle / goal (페이지 나누기 전 제목 없는 짧은 장 소개도 goal)
//     "여기서 공부하는 내용" / 표       → tocTitle / toc
//   제목 2 "01.1 제목"                 → sectionNum("01.1") + h2("제목")
//     "난이도 하", "학습 날짜"          → sectionMeta
//   1×2 표 "[워밍업] …"                → 왼쪽 칸 문단 warmup, 오른쪽 칸 문단 normal
//   [1:1 코칭] 제목 … [/1:1 코칭]       → coachTitle, coach … coachLast
//   [나] … [/나], [AI] … [/AI]         → prompt … promptLast, ai … aiLast
//   [임의] … [/임의]                    → box
//   <NOTE> 문장                         → note (tag 'NOTE')
//   tag: 지운 표식 글자. IDML 장식의 바뀌는 글자 자리(예: '바로 01')를 채우고 장식 변형(NOTE/TIP)을 고른다
//   [바로 01] 제목                      → practice("제목", tag '바로 01')
//   [바로 핵심 요약] + 목록              → summaryTitle, summary
//   ```제목 … ```                        → codeTitle("제목") + 코드 문단 (``` 사이가 코드 한 덩어리, 글꼴과 무관)
//   ```C, ```python                      → 언어 표시(제목 아님)
(function (g) {
  'use strict';

  const norm = s => String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

  const CONTAINER = { '나': 'prompt', 'AI': 'ai', '1:1 코칭': 'coach' };

  // html 앞부분에서 패턴에 해당하는 글자를 지운다(인라인 태그는 보존)
  function stripLead(html, re) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const w = document.createTreeWalker(tmp, NodeFilter.SHOW_TEXT);
    let acc = '', n;
    const nodes = [];
    while ((n = w.nextNode())) { nodes.push(n); acc += n.nodeValue; }
    const m = acc.replace(/ /g, ' ').match(re);
    if (!m) return html;
    let cut = m[0].length;
    for (const t of nodes) {
      if (cut <= 0) break;
      const k = Math.min(cut, t.nodeValue.length);
      t.nodeValue = t.nodeValue.slice(k);
      cut -= k;
    }
    return tmp.innerHTML;
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const para = (role, text, html, extra) => Object.assign({ kind: 'p', key: 'normal', role, text, html: html != null ? html : esc(text) }, extra || {});

  function apply(blocks) {
    const out = [];
    const stack = []; // 열린 컨테이너
    let summaryOpen = false;
    let fenceSeq = 0;

    const push = b => {
      const top = stack[stack.length - 1];
      if (top && b.kind !== 'break') {
        b.container = top.kind;
        top.last = b;
      } else if (summaryOpen && b.kind !== 'break') {
        b.container = 'summary';
      }
      out.push(b);
    };
    const closeTop = () => {
      const top = stack.pop();
      if (top && top.last) top.last.clast = true;
    };
    const closeSummary = () => { summaryOpen = false; };

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const t = norm(b.text);

      // ---- 코드 블록 ``` 제목 … ``` ----
      // 여는 줄 뒤 글은 코드 제목. 닫는 ```이 없으면 페이지 나누기·제목 1/2 앞에서 끝낸다.
      if (b.kind === 'p' && /^`{3,}/.test(t)) {
        let label = t.replace(/^`{3,}\s*/, '');
        // ```C, ```python 같은 언어 표시는 제목이 아니다 (파일 이름 hello.py, '연결 리스트 1-1'은 제목)
        const lang = /^[A-Za-z][A-Za-z+#-]{0,15}$/.test(label) ? label : '';
        if (lang) label = '';
        let j = i + 1;
        const stop = x => x.kind === 'break' || (x.kind === 'p' && /^h[12]$/.test(x.key));
        while (j < blocks.length && !(blocks[j].kind === 'p' && /^`{3,}$/.test(norm(blocks[j].text))) && !stop(blocks[j])) j++;
        const closed = j < blocks.length && !stop(blocks[j]);
        const fence = ++fenceSeq;
        if (label) push(para('codeTitle', label, null, { tag: label }));
        const body = blocks.slice(i + 1, j);
        body.forEach((n, k) => {
          if (n.kind === 'p' || n.kind === 'empty') {
            push(Object.assign({}, n, { key: 'code', fence, lang, fenceStart: k === 0, fenceEnd: k === body.length - 1 }));
          } else push(n);
        });
        i = closed ? j : j - 1;
        continue;
      }

      // ---- 장 ----
      if (b.kind === 'p' && b.key === 'h1') {
        closeSummary();
        const m = t.match(/^(\d+\s*장)\s*(.*)$/);
        if (m) {
          push(para('chapterNum', m[1].replace(/\s+/g, ''), null, { key: 'h1' }));
          push(Object.assign({}, b, { role: 'h1', text: m[2], html: stripLead(b.html, /^\s*\d+\s*장\s*/) }));
        } else push(Object.assign({}, b, { role: 'h1' }));
        // 장 머리(다음 페이지 나누기·제목 2 전까지)의 학습 목표/공부 내용
        let mode = '';
        // 제목 없이 장 제목 바로 뒤에 오는 짧은 장 소개(페이지 나누기로 끝나는 장 머리, 3문단 이하)는 학습 목표 자리로 본다.
        // 장 제목 뒤에 본문이 바로 이어지는 원고는 그대로 본문.
        let k = i + 1, intro = 0;
        while (k < blocks.length && blocks[k].kind !== 'break' && !(blocks[k].kind === 'p' && /^h[12]$/.test(blocks[k].key))) { if (blocks[k].kind === 'p') intro++; k++; }
        const introGoal = k < blocks.length && blocks[k].kind === 'break' && intro <= 3;
        let j = i + 1;
        for (; j < blocks.length; j++) {
          const n = blocks[j];
          const nt = norm(n.text);
          if (n.kind === 'break' || (n.kind === 'p' && /^h[12]$/.test(n.key))) break;
          if (n.kind === 'empty') continue;
          if (n.kind === 'p' && /목표/.test(nt) && nt.length < 20) { push(Object.assign({}, n, { role: 'goalTitle' })); mode = 'goal'; continue; }
          if (n.kind === 'p' && /공부하는 내용|이 장에서/.test(nt) && nt.length < 30) { push(Object.assign({}, n, { role: 'tocTitle' })); mode = 'toc'; continue; }
          if (n.kind === 'table') { push(Object.assign({}, n, { role: 'toc' })); continue; }
          push(Object.assign({}, n, { role: mode === 'goal' || (!mode && introGoal && n.kind === 'p') ? 'goal' : undefined }));
        }
        i = j - 1;
        continue;
      }

      // ---- 절 ----
      if (b.kind === 'p' && b.key === 'h2') {
        closeSummary();
        if (!t) continue; // 간격용 빈 제목
        const m = t.match(/^(\d+(?:\.\d+)+)\s+(.*)$/);
        if (m) {
          push(para('sectionNum', m[1], null, { key: 'h2' }));
          push(Object.assign({}, b, { role: 'h2', text: m[2], html: stripLead(b.html, /^\s*\d+(?:\.\d+)+\s+/) }));
        } else push(Object.assign({}, b, { role: 'h2' }));
        let j = i + 1;
        for (; j < blocks.length; j++) {
          const n = blocks[j];
          const nt = norm(n.text);
          if (n.kind === 'empty') continue;
          if (/^난이도\s*\S/.test(nt) || /^학습\s*날짜/.test(nt)) { push(Object.assign({}, n, { role: 'sectionMeta' })); continue; }
          break;
        }
        i = j - 1;
        continue;
      }

      // ---- 워밍업 (1×2 표) ----
      if (b.kind === 'table' && b.rows.length === 1 && b.rows[0].length === 2 &&
          /^\s*\[워밍업\]/.test((b.rows[0][0].paras && b.rows[0][0].paras[0] || {}).text || '')) {
        closeSummary();
        const [left, right] = b.rows[0];
        left.paras.forEach((p, k) => {
          const text = k === 0 ? p.text.replace(/^\s*\[워밍업\]\s*/, '') : p.text;
          const html = k === 0 ? stripLead(p.html, /^\s*\[워밍업\]\s*/) : p.html;
          if (text) push(para('warmup', text, html));
        });
        for (const p of right.paras || []) if (p.text) push(para('normal', p.text, p.html));
        continue;
      }

      // ---- 컨테이너 [x] … [/x] ----
      if (b.kind === 'p' && /^\[\/?[^\]]{1,20}\]/.test(t)) {
        const close = t.match(/^\[\/([^\]]+)\]$/);
        if (close) {
          const name = close[1].trim();
          const idx = stack.map(s => s.name).lastIndexOf(name);
          if (idx >= 0) while (stack.length > idx) closeTop();
          continue;
        }
        const open = t.match(/^\[([^\]\/]+)\]\s*(.*)$/);
        if (open) {
          const name = open[1].trim();
          const rest = open[2];
          const html = stripLead(b.html, /^\s*\[[^\]]+\]\s*/);
          if (/^바로\s*핵심\s*요약$/.test(name)) {
            closeSummary();
            push(para('summaryTitle', name, null, { tag: name }));
            summaryOpen = true;
            continue;
          }
          if (/^바로\s*(\d+|활용)$/.test(name)) {
            closeSummary();
            push(Object.assign({}, b, { role: 'practice', tag: name, text: rest, html }));
            continue;
          }
          if (CONTAINER[name] || b.key !== 'normal' || !rest) {
            const kind = CONTAINER[name] || 'box';
            stack.push({ name, kind, last: null });
            if (rest) push(Object.assign({}, b, { role: kind === 'coach' ? 'coachTitle' : 'box', tag: name, text: rest, html }));
            continue;
          }
        }
      }

      if (b.kind === 'p' && /^h[1-4]$/.test(b.key)) closeSummary();
      if (b.kind === 'break') { closeSummary(); while (stack.length) closeTop(); }

      // ---- <NOTE> 문장 ----
      if (b.kind === 'p') {
        const tag = t.match(/^<([A-Za-z가-힣 ]{1,12})>\s*/);
        if (tag) {
          push(Object.assign({}, b, { role: 'note', tag: tag[1].trim(), text: t.slice(tag[0].length), html: stripLead(b.html, /^\s*<[^>]{1,12}>\s*/) }));
          continue;
        }
      }

      push(b);
    }
    while (stack.length) closeTop();
    return out;
  }

  g.PTMarkup = { apply, stripLead };
})(globalThis);
