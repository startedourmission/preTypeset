// 쪽 나눔 엔진: 블록 요소를 단(column)에 흘려 넣고, 넘치면 줄 경계에서 문단을 쪼갠다.
(function (g) {
  'use strict';

  const yieldFrame = () => new Promise(r => setTimeout(r, 0));

  function textPositions(el) {
    const nodes = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n, total = 0;
    while ((n = w.nextNode())) {
      if (n.parentElement && n.parentElement.closest('.pt-marker')) continue;
      const len = n.nodeValue.length;
      if (!len) continue;
      nodes.push({ node: n, start: total, len });
      total += len;
    }
    return { nodes, total };
  }

  function locate(tp, off) {
    let lo = 0, hi = tp.nodes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (tp.nodes[mid].start <= off) lo = mid; else hi = mid - 1;
    }
    const e = tp.nodes[lo];
    return { node: e.node, local: Math.min(off - e.start, e.len) };
  }

  const range = () => document.createRange();

  // i번째 글자부터 처음으로 보이는 글자의 사각형
  function charRect(tp, i) {
    const r = range();
    for (let j = i; j < tp.total && j < i + 64; j++) {
      const { node, local } = locate(tp, j);
      if (local >= node.nodeValue.length) continue;
      r.setStart(node, local);
      r.setEnd(node, local + 1);
      const rects = r.getClientRects();
      for (const rc of rects) if (rc.height > 0) return rc;
    }
    return null;
  }

  // limit 아래로 넘친 첫 줄의 시작 글자 위치 (없으면 total)
  function findTextSplit(el, limit) {
    const tp = textPositions(el);
    if (tp.total < 2) return null;
    let lo = 0, hi = tp.total;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const rc = charRect(tp, mid);
      if (rc && rc.bottom > limit + 0.5) hi = mid; else lo = mid + 1;
    }
    return { off: lo, tp };
  }

  function trimStart(el) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const t = n.nodeValue.replace(/^[  　]+/, '');
      n.nodeValue = t;
      if (t) break;
    }
  }

  function splitText(el, tp, off) {
    const { node, local } = locate(tp, off);
    const r1 = range(); r1.setStart(el, 0); r1.setEnd(node, local);
    const r2 = range(); r2.setStart(node, local); r2.setEnd(el, el.childNodes.length);
    const head = el.cloneNode(false); head.appendChild(r1.cloneContents());
    const tail = el.cloneNode(false); tail.appendChild(r2.cloneContents());
    trimStart(tail);
    head.classList.add('pt-broken');
    tail.classList.remove('pt-broken', 'pt-first');
    tail.classList.add('pt-cont');
    return [head, tail];
  }

  function splitTable(el, limit) {
    const rows = Array.from(el.rows);
    const i = rows.findIndex(r => r.getBoundingClientRect().bottom > limit + 0.5);
    if (i <= 0) return null;
    const head = el.cloneNode(true), tail = el.cloneNode(true);
    Array.from(head.rows).slice(i).forEach(r => r.remove());
    Array.from(tail.rows).slice(0, i).forEach(r => r.remove());
    head.classList.add('pt-broken');
    tail.classList.add('pt-cont');
    return [head, tail];
  }

  function contentBottom(el) {
    const rc = el.getBoundingClientRect();
    const pb = parseFloat(getComputedStyle(el).paddingBottom) || 0;
    return rc.bottom - pb;
  }

  function markFirst(col) {
    for (const k of col.children) k.classList.toggle('pt-first', k === col.firstElementChild);
  }

  /**
   * items: [{ kind, el, split: 'text'|'table'|null, start, keepAll }]
   * o: { root, makePage(number) → {el, cols, number, side}, onPageDone(page), startNumber, isCancelled() }
   */
  async function paginate(items, o) {
    const pages = [];
    let page = null, ci = 0;

    function openPage() {
      if (page) o.onPageDone(page);
      page = o.makePage(pages.length + o.startNumber);
      o.root.appendChild(page.el);
      ci = 0;
      pages.push(page);
    }
    const col = () => page.cols[ci];
    const pageHasContent = () => page.cols.some(c => c.firstElementChild);
    function advance() {
      if (ci < page.cols.length - 1) ci++;
      else openPage();
    }

    openPage();
    for (let idx = 0; idx < items.length; idx++) {
      if (idx % 12 === 11) {
        await yieldFrame();
        if (o.isCancelled()) return null;
      }
      const it = items[idx];
      if (it.kind === 'break') { if (pageHasContent()) openPage(); continue; }

      const sp = it.start;
      if (sp === 'NextPage' || sp === 'NextOddPage' || sp === 'NextEvenPage' || sp === 'NextFrame') {
        if (pageHasContent()) openPage();
        const odd = page.number % 2 === 1;
        if ((sp === 'NextOddPage' && !odd) || (sp === 'NextEvenPage' && odd)) { page.blank = true; openPage(); }
      } else if (sp === 'NextColumn' && col().firstElementChild) {
        advance();
      }

      let el = it.el;
      let guard = 0;
      while (el && guard++ < 5000) {
        const c = col();
        c.appendChild(el);
        markFirst(c);
        const limit = c.getBoundingClientRect().bottom;
        if (contentBottom(el) <= limit + 0.5) break;

        let parts = null;
        if (it.split === 'text' && !it.keepAll) {
          const r = findTextSplit(el, limit);
          if (r && r.off >= r.tp.total) break; // 넘친 것은 단락 뒤 공백뿐
          if (r && r.off > 0) parts = splitText(el, r.tp, r.off);
        } else if (it.split === 'table') {
          parts = splitTable(el, limit);
        }
        if (parts) {
          c.replaceChild(parts[0], el);
          el = parts[1];
          advance();
          continue;
        }
        if (c.firstElementChild === el) {
          // 단 하나도 못 들어가는 큰 블록: 그대로 두고 넘침 표시
          el.classList.add('pt-overset');
          page.overset = true;
          advance();
          break;
        }
        c.removeChild(el);
        // 다음과 함께 유지(제목 등): 단 끝에 남은 제목을 같이 넘긴다
        const carried = [];
        while (c.childElementCount > 1 && c.lastElementChild.dataset.kwn === '1' && !c.lastElementChild.classList.contains('pt-broken')) {
          carried.unshift(c.lastElementChild);
          c.removeChild(c.lastElementChild);
        }
        advance();
        for (const k of carried) col().appendChild(k);
        markFirst(col());
      }
    }

    if (pages.length > 1 && !pageHasContent()) {
      page.el.remove();
      pages.pop();
      page = pages[pages.length - 1];
      // 이미 넘긴 페이지는 onPageDone 처리됨
      return pages;
    }
    o.onPageDone(page);
    return pages;
  }

  g.PTLayout = { paginate, _internals: { findTextSplit, splitText, textPositions } };
})(globalThis);
