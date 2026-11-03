// Google Docs HTML export 형식을 흉내 낸 테스트 원고 생성
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sentences = [
  '조판은 원고를 정해진 판형과 스타일에 맞춰 페이지 위에 배치하는 일이다.',
  '편집자는 원고 단계에서 분량을 미리 가늠할 수 있어야 일정과 제작비를 정확히 잡을 수 있다.',
  '구글 독스에서 쓴 원고가 실제 책에서 몇 쪽이 될지, 장 시작이 어느 면에 걸릴지 알면 원고 조정이 훨씬 쉬워진다.',
  '특히 기술서는 코드 블록과 표, 그림이 많아 쪽 나눔이 예상과 크게 달라지곤 한다.',
  '이 미리보기는 인디자인 내지의 단락 스타일을 읽어 브라우저에서 근사적으로 쪽을 나눈다.',
  '행간과 자간, 들여쓰기, 문단 앞뒤 간격은 인디자인 값을 그대로 쓰지만 줄바꿈 위치는 조금 다를 수 있다.'
];
const para = (n, seed) => Array.from({ length: n }, (_, i) => sentences[(i + seed) % sentences.length]).join(' ');

let body = '';
const P = (t, cls = 'c2') => { body += `<p class="${cls}"><span class="c0">${t}</span></p>`; };
body += `<div><p class="c5"><span class="c0">머리글 텍스트(무시되어야 함)</span></p></div>`;
body += `<p class="c3 title" id="h.t"><span class="c4">파이썬으로 배우는 조판</span></p>`;
body += `<h1 class="c6" id="h.1"><span class="c4">1장 조판 미리보기의 필요성</span></h1>`;
for (let i = 0; i < 4; i++) P(para(5, i));
body += `<p class="c2"><span class="c0">본문 중간에 </span><span class="c7">굵은 글씨</span><span class="c0">와 </span><span class="c8">print(&quot;hello&quot;)</span><span class="c0"> 같은 인라인 코드, 그리고 각주</span><sup><a href="#ftnt1" id="ftnt_ref1">[1]</a></sup><span class="c0">가 들어 있다.</span><sup><a href="#cmnt1" id="cmnt_ref1">[a]</a></sup></p>`;
body += `<p class="c2"><span class="c0"></span></p>`;
body += `<h2 class="c9" id="h.2"><span class="c4">1.1 원고와 판면</span></h2>`;
for (let i = 0; i < 3; i++) P(para(6, i + 2));
body += `<ul class="c10 lst-kix_abc-0 start"><li class="c11 li-bullet-0"><span class="c0">판형: 152×225mm (신국판)</span></li><li class="c11 li-bullet-0"><span class="c0">본문: 명조 10pt, 행간 17pt</span></li></ul>`;
body += `<ul class="c10 lst-kix_abc-1 start"><li class="c11 li-bullet-0"><span class="c0">두 번째 수준 글머리</span></li></ul>`;
body += `<ol class="c10 lst-kix_num-0 start" start="1"><li class="c11 li-bullet-0"><span class="c0">원고를 쓴다</span></li><li class="c11 li-bullet-0"><span class="c0">내지를 올린다</span></li><li class="c11 li-bullet-0"><span class="c0">쪽수를 확인한다</span></li></ol>`;
body += `<h3 class="c9" id="h.3"><span class="c4">코드 예제</span></h3>`;
body += `<table class="c12"><tr class="c13"><td class="c14" colspan="1" rowspan="1">`;
for (const line of ['def typeset(doc, template):', '    pages = []', '    for block in doc.blocks:', '        place(block, pages)', '    return pages']) {
  body += `<p class="c15"><span class="c8">${line.replace(/ /g, '&nbsp;')}</span></p>`;
}
body += `</td></tr></table>`;
for (let i = 0; i < 3; i++) P(para(6, i + 4));
body += `<table class="c12"><tr><td><p><span class="c0">항목</span></p></td><td><p><span class="c0">인디자인</span></p></td><td><p><span class="c0">미리보기</span></p></td></tr>`;
for (const r of [['행간', '정확', '정확'], ['자간', '정확', '정확'], ['줄바꿈', '컴포저', '브라우저 근사'], ['쪽 나눔', '정확', '근사']]) {
  body += `<tr>${r.map(c => `<td><p><span class="c0">${c}</span></p></td>`).join('')}</tr>`;
}
body += `</table>`;
body += `<p class="c2"><span style="overflow: hidden; display: inline-block; width: 300.00px; height: 150.00px;"><img alt="" src="data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#dbe7f7"/><text x="300" y="165" font-size="40" text-anchor="middle" fill="#1a4f9c">그림 1-1</text></svg>')}" style="width: 300.00px; height: 150.00px;"></span></p>`;
for (let i = 0; i < 8; i++) P(para(6, i));
body += `<hr style="page-break-before:always;display:none;">`;
body += `<h1 class="c6" id="h.4"><span class="c4">2장 IDML 구조 이해하기</span></h1>`;
for (let i = 0; i < 6; i++) P(para(7, i + 1));
body += `<h2 class="c9"><span class="c4">2.1 스타일 상속</span></h2>`;
for (let i = 0; i < 10; i++) P(para(6, i + 3));
body += `<div><p class="c16"><a href="#ftnt_ref1" id="ftnt1">[1]</a><span class="c17">&nbsp;각주 내용입니다. 조판 미리보기는 근사치입니다.</span></p></div>`;
body += `<div><p class="c5"><a href="#cmnt_ref1" id="cmnt1">[a]</a><span class="c0">댓글(무시되어야 함)</span></p></div>`;

const html = `<html><head><meta content="text/html; charset=UTF-8" http-equiv="content-type"><style type="text/css">ol{margin:0;padding:0}.c0{color:#000000;font-weight:400;font-size:11pt;font-family:"Arial"}.c4{font-weight:400;font-size:20pt;font-family:"Arial"}.c7{font-weight:700;font-size:11pt;font-family:"Arial"}.c8{font-weight:400;font-size:10pt;font-family:"Consolas"}.c17{font-size:10pt}.c2{line-height:1.15;padding-top:0pt;padding-bottom:0pt}.c19{background-color:#ffffff;max-width:451.4pt;padding:72pt 72pt 72pt 72pt}.title{padding-top:0pt;font-size:26pt}</style><title>조판 테스트 원고</title></head><body class="c19 doc-content">${body}</body></html>`;
writeFileSync(join(here, 'sample-docs.html'), html);
console.log('wrote sample-docs.html', html.length);
