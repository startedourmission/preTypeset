// 집필 마크업 → 디자인 컴포넌트
// Docs 원고의 태그 관례(골든래빗 집필 가이드)를 읽어 조판 디자인 요소로 바꾼다.
//   h1 "01장 제목" + "학습 목표" + "여기서 공부하는 내용" 표  → 장 도비라 펼침면
//   h2 "01.1 제목" + "난이도 하" + "학습 날짜"               → 절 배너
//   1×2 표 "[워밍업] …"                                     → 워밍업 박스
//   [1:1 코칭] 제목 … [/1:1 코칭]                            → 코칭 박스
//   [나] … [/나], [AI] … [/AI], [임의] … [/임의]             → 말풍선/박스
//   <NOTE> 문장, <TIP> 문장                                  → 태그 박스
//   [바로 01] 제목, [바로 활용] 제목                         → 실습 제목
//   [바로 핵심 요약]                                         → 요약 박스
//   "01단계 …"                                               → 단계 라벨
(function (g) {
  'use strict';

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

  const CONTAINER_LABEL = { '나': '프롬프트', 'AI': 'AI', '1:1 코칭': '1:1 코칭' };
  const CONTAINER_KIND = { '나': 'prompt', 'AI': 'ai', '1:1 코칭': 'coach' };

  // html 앞부분에서 패턴에 해당하는 텍스트를 지운다(인라인 태그는 보존)
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

  function isMarker(b) {
    return (b.kind === 'p') && /^\[\/?[^\]]{1,20}\]$/.test(norm(b.text));
  }

  function apply(blocks, opts) {
    if (opts && opts.enabled === false) return blocks;
    const out = [];
    const stack = []; // 열린 컨테이너 [{kind, label, first}]
    let summaryOpen = false;

    const push = b => {
      const top = stack[stack.length - 1];
      if (top && b.kind !== 'break') {
        b.container = top.kind;
        b.cfirst = top.first;
        top.first = false;
        top.last = b;
      } else if (summaryOpen && b.kind !== 'break') {
        b.container = 'summary';
        b.cfirst = false;
      }
      out.push(b);
    };
    const closeTop = () => {
      const top = stack.pop();
      if (top && top.last) top.last.clast = true;
    };
    const closeSummary = () => {
      if (!summaryOpen) return;
      summaryOpen = false;
      for (let i = out.length - 1; i >= 0; i--) if (out[i].container === 'summary') { out[i].clast = true; break; }
    };

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const t = norm(b.text);

      // ---- 장 도비라 ----
      if (b.kind === 'p' && b.key === 'h1') {
        closeSummary();
        const m = t.match(/^(\d+)\s*장\s*(.*)$/);
        const ch = { kind: 'chapter', key: 'h1', number: m ? m[1] : '', title: m ? m[2] : t, text: t, goal: '', goalTitle: '', toc: null, tocTitle: '' };
        let j = i + 1;
        for (; j < blocks.length; j++) {
          const n = blocks[j];
          const nt = norm(n.text);
          if (n.kind === 'break' || (n.kind === 'p' && /^h[12]$/.test(n.key))) break;
          if (n.kind === 'empty') continue;
          if (n.kind === 'p' && /목표/.test(nt) && nt.length < 20) { ch.goalTitle = nt; continue; }
          if (n.kind === 'p' && /공부하는 내용|이 장에서/.test(nt) && nt.length < 30) { ch.tocTitle = nt; continue; }
          if (n.kind === 'table') { ch.toc = n.rows; continue; }
          if (n.kind === 'p') { ch.goal += (ch.goal ? '<br>' : '') + n.html; continue; }
        }
        out.push(ch);
        i = j - 1;
        continue;
      }

      // ---- 절 배너 ----
      if (b.kind === 'p' && b.key === 'h2') {
        closeSummary();
        if (!t) continue; // 간격용 빈 제목
        const m = t.match(/^(\d+(?:\.\d+)+)\s+(.*)$/);
        const sec = { kind: 'section', key: 'h2', number: m ? m[1] : '', title: m ? m[2] : t, text: t, level: '', date: false };
        let j = i + 1;
        for (; j < blocks.length; j++) {
          const n = blocks[j];
          const nt = norm(n.text);
          if (n.kind === 'empty') continue;
          const lv = nt.match(/^난이도\s*(.+)$/);
          if (lv) { sec.level = lv[1]; continue; }
          if (/^학습\s*날짜/.test(nt)) { sec.date = true; continue; }
          break;
        }
        out.push(sec);
        i = j - 1;
        continue;
      }

      // ---- 워밍업 (1×2 표) ----
      if (b.kind === 'table' && b.rows.length === 1 && b.rows[0].length === 2 && /^\s*\[워밍업\]/.test(b.rows[0][0].html.replace(/<[^>]+>/g, ''))) {
        closeSummary();
        const left = stripLead(b.rows[0][0].html, /^\s*\[워밍업\]\s*/);
        push({ kind: 'warmup', key: 'box', left, right: b.rows[0][1].html, text: '' });
        continue;
      }

      // ---- 컨테이너 열기/닫기 ----
      if ((b.kind === 'p') && /^\[\/?[^\]]{1,20}\]/.test(t)) {
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
          if (/^바로\s*핵심\s*요약$/.test(name)) {
            closeSummary();
            push({ kind: 'p', key: 'h3', comp: 'summary-title', html: esc(name), text: name });
            summaryOpen = true;
            continue;
          }
          const ba = name.match(/^바로\s*(\d+|활용)$/);
          if (ba) {
            closeSummary();
            push(Object.assign({}, b, { comp: 'practice', html: '<span class="pt-tag">바로 ' + esc(ba[1]) + '</span>' + stripLead(b.html, /^\s*\[[^\]]+\]\s*/) }));
            continue;
          }
          // 같은 줄에 내용이 없거나 제목만 있는 경우 → 컨테이너 시작
          if (rest.length < 60 && (CONTAINER_KIND[name] || b.key !== 'normal' || !rest)) {
            const kind = CONTAINER_KIND[name] || 'box';
            stack.push({ name, kind, first: true, last: null });
            push({ kind: 'p', key: 'box', comp: 'ctitle', label: CONTAINER_LABEL[name] || name, html: (rest ? esc(rest) : ''), text: rest || name });
            continue;
          }
        }
      }

      // 제목이 나오면 요약 박스를 닫는다
      if (b.kind === 'p' && /^h[1-4]$/.test(b.key)) closeSummary();
      if (b.kind === 'break') { closeSummary(); while (stack.length) closeTop(); }

      // ---- 태그 박스 <NOTE> ----
      if (b.kind === 'p') {
        const tag = t.match(/^<([A-Za-z가-힣 ]{1,12})>\s*/);
        if (tag) {
          push(Object.assign({}, b, { comp: 'note', html: '<span class="pt-tag">' + esc(tag[1]) + '</span>' + stripLead(b.html, /^\s*<[^>]{1,12}>\s*/) }));
          continue;
        }
        const step = t.match(/^(\d{1,2}\s*단계)\s*/);
        if (step) {
          push(Object.assign({}, b, { comp: 'step', html: '<span class="pt-step">' + esc(step[1]) + '</span> ' + stripLead(b.html, /^\s*\d{1,2}\s*단계\s*/) }));
          continue;
        }
      }

      // 제목에 붙은 그림 = 삽화 → 글 흘리기
      if (b.kind === 'image' && b.afterHeading) {
        push(Object.assign({}, b, { float: true }));
        continue;
      }

      push(b);
    }
    closeSummary();
    while (stack.length) closeTop();
    return out;
  }

  g.PTMarkup = { apply, stripLead };
})(globalThis);
