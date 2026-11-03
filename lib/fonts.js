// 글꼴 파일 불러오기: 이름 테이블을 읽어 IDML이 쓰는 이름(현지화 이름 포함)으로 등록한다.
// 파일은 IndexedDB에 보관해 다음에 다시 올리지 않아도 된다.
(function (g) {
  'use strict';

  const DB = 'preTypeset-fonts', STORE = 'fonts';

  // ---------- OpenType 이름 테이블 ----------
  function tag(dv, o) { return String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3)); }

  function readFontInfo(buffer) {
    const dv = new DataView(buffer);
    let base = 0;
    if (tag(dv, 0) === 'ttcf') base = dv.getUint32(12); // 컬렉션은 첫 글꼴만
    const numTables = dv.getUint16(base + 4);
    const tables = {};
    for (let i = 0; i < numTables; i++) {
      const r = base + 12 + i * 16;
      tables[tag(dv, r)] = { off: dv.getUint32(r + 8), len: dv.getUint32(r + 12) };
    }
    const info = { family: new Set(), sub: new Set(), full: new Set(), weight: 400, italic: false };
    const nt = tables.name;
    if (nt) {
      const count = dv.getUint16(nt.off + 2);
      const strOff = nt.off + dv.getUint16(nt.off + 4);
      const by = {};
      for (let i = 0; i < count; i++) {
        const r = nt.off + 6 + i * 12;
        const pid = dv.getUint16(r), eid = dv.getUint16(r + 2), nid = dv.getUint16(r + 6);
        const len = dv.getUint16(r + 8), off = dv.getUint16(r + 10);
        if (![1, 2, 4, 16, 17].includes(nid)) continue;
        let s = '';
        if (pid === 3 || pid === 0) {
          for (let k = 0; k + 1 < len; k += 2) s += String.fromCharCode(dv.getUint16(strOff + off + k));
        } else if (pid === 1 && eid === 0) {
          for (let k = 0; k < len; k++) s += String.fromCharCode(dv.getUint8(strOff + off + k));
        } else continue;
        s = s.replace(/\0/g, '').trim();
        if (!s) continue;
        (by[nid] = by[nid] || new Set()).add(s);
      }
      const fam = by[16] || by[1] || new Set();
      const sub = by[17] || by[2] || new Set();
      fam.forEach(v => info.family.add(v));
      if (by[1]) by[1].forEach(v => info.family.add(v));
      sub.forEach(v => info.sub.add(v));
      if (by[4]) by[4].forEach(v => info.full.add(v));
    }
    const os2 = tables['OS/2'];
    if (os2) {
      info.weight = dv.getUint16(os2.off + 4) || 400;
      info.italic = (dv.getUint16(os2.off + 62) & 1) === 1;
    }
    return {
      family: Array.from(info.family), sub: Array.from(info.sub), full: Array.from(info.full),
      weight: info.weight, italic: info.italic
    };
  }

  // ---------- IndexedDB ----------
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function tx(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const st = t.objectStore(STORE);
      let out;
      Promise.resolve(fn(st)).then(v => { out = v; });
      t.oncomplete = () => { db.close(); resolve(out); };
      t.onerror = () => { db.close(); reject(t.error); };
    });
  }
  const reqP = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

  async function listStored() {
    try { return await tx('readonly', st => reqP(st.getAll())); } catch (e) { return []; }
  }

  // ---------- 등록 ----------
  const registered = new Map(); // id → [FontFace]
  const registeredNames = new Set();

  function namesOf(rec) {
    const names = new Set(rec.family);
    for (const f of rec.family) for (const s of rec.sub) if (!/^regular$/i.test(s)) names.add(f + ' ' + s);
    for (const f of rec.full) names.add(f);
    return names;
  }

  // InDesign은 같은 글꼴의 TTF/OTF가 겹치면 이름 뒤에 "OTF", "(OTF)"를 붙인다
  const bare = n => String(n || '').replace(/\s*\(?OTF\)?\s*$/i, '').trim();

  async function register(rec, buffer, aliases) {
    const key = rec.id + '|' + (aliases || []).join(',');
    if (registered.has(key)) return 0;
    const faces = [];
    const style = rec.italic ? 'italic' : 'normal';
    for (const a of aliases || []) {
      if (rec.family.includes(a)) continue;
      faces.push(new FontFace(a, buffer, { weight: String(rec.weight), style }));
      for (const sub of rec.sub) if (!/^regular$/i.test(sub)) faces.push(new FontFace(a + ' ' + sub, buffer, { weight: '1 1000', style }));
    }
    for (const f of rec.family) {
      // 패밀리 이름: 실제 굵기로 등록 (font-weight로 고름)
      faces.push(new FontFace(f, buffer, { weight: String(rec.weight), style }));
    }
    for (const n of namesOf(rec)) {
      if (rec.family.includes(n)) continue;
      // "패밀리 스타일" 이름: 어떤 굵기로 요청해도 이 글꼴 (가짜 굵게 방지)
      faces.push(new FontFace(n, buffer, { weight: '1 1000', style }));
    }
    const ok = [];
    for (const face of faces) {
      try { await face.load(); document.fonts.add(face); ok.push(face); registeredNames.add(face.family.replace(/^"|"$/g, '')); } catch (e) { /* 손상된 글꼴 */ }
    }
    registered.set(key, ok);
    return ok.length;
  }

  // 원하는 패밀리 이름 중 이 글꼴과 (OTF 꼬리를 떼면) 같은 것 → 그 이름으로도 등록
  function aliasesFor(rec, want) {
    const names = namesOf(rec);
    return [...want].filter(w => !names.has(w) && rec.family.some(f => bare(f) === bare(w)));
  }

  function matches(rec, want) {
    const names = namesOf(rec);
    for (const w of want) if (names.has(w) || [...names].some(n => bare(n) === bare(w))) return true;
    return false;
  }

  // 템플릿이 쓰는 패밀리만 저장소에서 꺼내 등록
  async function ensure(families) {
    const want = new Set(families.filter(Boolean));
    if (!want.size) return [];
    const recs = await listStored();
    const hit = [];
    for (const rec of recs) {
      if (!matches(rec, want)) continue;
      await register(rec, await rec.blob.arrayBuffer(), aliasesFor(rec, want));
      hit.push(rec);
    }
    return hit;
  }

  // 파일 목록 저장 (+ 바로 등록)
  async function importFiles(files, wanted) {
    const want = new Set((wanted || []).filter(Boolean));
    const added = [];
    for (const file of files) {
      if (!/\.(otf|ttf|ttc|woff2?)$/i.test(file.name)) continue;
      const buffer = await file.arrayBuffer();
      let info;
      try { info = /\.woff2?$/i.test(file.name) ? null : readFontInfo(buffer); } catch (e) { info = null; }
      if (!info || !info.family.length) continue;
      const rec = Object.assign(info, { id: file.name + ':' + file.size, file: file.name, size: file.size });
      await tx('readwrite', st => reqP(st.put(Object.assign({}, rec, { blob: new Blob([buffer]) }))));
      if (!want.size || matches(rec, want)) await register(rec, buffer, aliasesFor(rec, want));
      added.push(rec);
    }
    return added;
  }

  async function clearStored() {
    await tx('readwrite', st => reqP(st.clear()));
  }

  g.PTFonts = { readFontInfo, importFiles, ensure, listStored, clearStored, isRegistered: n => registeredNames.has(n), namesOf };
})(globalThis);
