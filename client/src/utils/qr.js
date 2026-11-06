// Tiny QR code encoder (byte mode, error correction level M, versions 1-10 = up to 213 bytes).
// Enough for profile links. Returns a square matrix of booleans (true = dark module).

// version -> [ecc codewords per block, [[block count, data codewords per block], ...]]
const BLOCKS = {
  1: [10, [[1, 16]]],
  2: [16, [[1, 28]]],
  3: [26, [[1, 44]]],
  4: [18, [[2, 32]]],
  5: [24, [[2, 43]]],
  6: [16, [[4, 27]]],
  7: [18, [[4, 31]]],
  8: [22, [[2, 38], [2, 39]]],
  9: [22, [[3, 36], [2, 37]]],
  10: [26, [[4, 43], [1, 44]]]
};

const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
};

// ---------- Reed-Solomon over GF(256) ----------
const EXP = new Array(512);
const LOG = new Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

const generator = (degree) => {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
};

const rsRemainder = (data, degree) => {
  const gen = generator(degree);
  const result = new Array(degree).fill(0);
  data.forEach((byte) => {
    const factor = byte ^ result.shift();
    result.push(0);
    for (let i = 0; i < degree; i++) result[i] ^= gfMul(gen[i + 1], factor);
  });
  return result;
};

// ---------- bit helpers ----------
const utf8 = (text) => Array.from(new TextEncoder().encode(text));

const dataCapacity = (version) => BLOCKS[version][1].reduce((sum, [count, size]) => sum + count * size, 0);

const pickVersion = (byteLength) => {
  for (let v = 1; v <= 10; v++) {
    const countBits = v < 10 ? 8 : 16;
    if (4 + countBits + byteLength * 8 <= dataCapacity(v) * 8) return v;
  }
  throw new Error('QR text is too long');
};

const buildCodewords = (bytes, version) => {
  const bits = [];
  const push = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };

  push(0b0100, 4);                       // byte mode
  push(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((b) => push(b, 8));

  const capacityBits = dataCapacity(version) * 8;
  push(0, Math.min(4, capacityBits - bits.length)); // terminator
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);

  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  }

  // split into blocks, add error correction, interleave
  const [eccLen, groups] = BLOCKS[version];
  const blocks = [];
  let offset = 0;
  groups.forEach(([count, size]) => {
    for (let i = 0; i < count; i++) {
      const chunk = data.slice(offset, offset + size);
      offset += size;
      blocks.push({ data: chunk, ecc: rsRemainder(chunk, eccLen) });
    }
  });

  const out = [];
  const longest = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < longest; i++) blocks.forEach((b) => { if (i < b.data.length) out.push(b.data[i]); });
  for (let i = 0; i < eccLen; i++) blocks.forEach((b) => out.push(b.ecc[i]));
  return out;
};

// ---------- matrix ----------
const bchBits = (value, poly, valueBits, totalBits) => {
  let rem = value << (totalBits - valueBits);
  for (let i = totalBits - 1; i >= totalBits - valueBits; i--) {
    if ((rem >>> i) & 1) rem ^= poly << (i - (totalBits - valueBits));
  }
  return (value << (totalBits - valueBits)) | rem;
};

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0
];

const penalty = (m) => {
  const n = m.length;
  let score = 0;

  const runs = (get) => {
    for (let i = 0; i < n; i++) {
      let run = 1;
      for (let j = 1; j < n; j++) {
        if (get(i, j) === get(i, j - 1)) run++;
        else { if (run >= 5) score += run - 2; run = 1; }
      }
      if (run >= 5) score += run - 2;
    }
  };
  runs((r, c) => m[r][c]);
  runs((r, c) => m[c][r]);

  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }

  const pattern = [true, false, true, true, true, false, true];
  const finderLike = (line, i) => {
    if (!pattern.every((v, k) => line[i + k] === v)) return false;
    const before = [0, 1, 2, 3].every((k) => i - 4 + k >= 0 && line[i - 4 + k] === false);
    const after = [0, 1, 2, 3].every((k) => i + 7 + k < n && line[i + 7 + k] === false);
    return before || after;
  };
  for (let i = 0; i < n; i++) {
    const row = m[i];
    const col = m.map((r) => r[i]);
    for (let j = 0; j + 7 <= n; j++) {
      if (finderLike(row, j)) score += 40;
      if (finderLike(col, j)) score += 40;
    }
  }

  const dark = m.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return score;
};

export function makeQR(text) {
  const bytes = utf8(text);
  const version = pickVersion(bytes.length);
  const size = version * 4 + 17;
  const codewords = buildCodewords(bytes, version);

  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r, c, dark) => { modules[r][c] = dark; reserved[r][c] = true; };

  // finder patterns + separators
  const finder = (top, left) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        const ring = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        set(r, c, ring !== 2 && ring !== 4);
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  // timing patterns
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // alignment patterns
  const pos = ALIGN[version];
  pos.forEach((cy, a) => pos.forEach((cx, b) => {
    const onFinder = (a === 0 && b === 0) || (a === 0 && b === pos.length - 1) || (a === pos.length - 1 && b === 0);
    if (onFinder) return;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) set(cy + dr, cx + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }));

  // reserve format areas (filled in later) and the fixed dark module
  for (let i = 0; i < 9; i++) { reserved[8][i] = true; reserved[i][8] = true; }
  for (let i = 0; i < 8; i++) { reserved[8][size - 1 - i] = true; reserved[size - 1 - i][8] = true; }
  set(size - 8, 8, true);

  // version info (versions 7+)
  if (version >= 7) {
    const info = bchBits(version, 0x1f25, 6, 18);
    for (let i = 0; i < 18; i++) {
      const bit = ((info >>> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      set(a, b, bit);
      set(b, a, bit);
    }
  }

  // place data bits in the zig-zag order
  const bits = [];
  codewords.forEach((cw) => { for (let i = 7; i >= 0; i--) bits.push(((cw >>> i) & 1) === 1); });

  const place = (mask) => {
    const m = modules.map((row) => row.slice());
    let k = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (let step = 0; step < size; step++) {
        const r = upward ? size - 1 - step : step;
        for (let dc = 0; dc < 2; dc++) {
          const c = col - dc;
          if (reserved[r][c]) continue;
          const bit = k < bits.length ? bits[k] : false;
          k++;
          m[r][c] = bit !== MASKS[mask](r, c);
        }
      }
      upward = !upward;
    }
    return m;
  };

  const writeFormat = (m, mask) => {
    const data = (0b00 << 3) | mask; // level M = 00
    const info = bchBits(data, 0x537, 5, 15) ^ 0x5412;
    const bit = (i) => ((info >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
    m[7][8] = bit(6);
    m[8][8] = bit(7);
    m[8][7] = bit(8);
    for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i++) m[8][size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) m[size - 15 + i][8] = bit(i);
    m[size - 8][8] = true;
  };

  let best = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = place(mask);
    writeFormat(m, mask);
    const score = penalty(m);
    if (score < bestScore) { bestScore = score; best = m; }
  }
  return best;
}
