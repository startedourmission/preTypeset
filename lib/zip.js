// 최소 ZIP 리더 (stored / deflate). IDML 패키지 읽기용.
(function (g) {
  'use strict';

  async function inflateRaw(u8) {
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function readZip(buffer) {
    const u8 = new Uint8Array(buffer);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ZIP 형식이 아닙니다.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = new Map();
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP 중앙 디렉터리가 손상되었습니다.');
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      const lName = dv.getUint16(localOff + 26, true);
      const lExtra = dv.getUint16(localOff + 28, true);
      const start = localOff + 30 + lName + lExtra;
      files.set(name, { method, data: u8.subarray(start, start + csize) });
    }
    return {
      names: Array.from(files.keys()),
      has(name) { return files.has(name); },
      async bytes(name) {
        const f = files.get(name);
        if (!f) return null;
        if (f.method === 0) return f.data;
        if (f.method === 8) return inflateRaw(f.data);
        throw new Error('지원하지 않는 압축 방식: ' + f.method);
      },
      async text(name) {
        const b = await this.bytes(name);
        if (!b) return null;
        const t = new TextDecoder().decode(b);
        return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
      }
    };
  }

  g.PTZip = { readZip };
})(globalThis);
