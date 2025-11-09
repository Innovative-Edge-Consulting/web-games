// /tools/build-bloom.js
// Usage: node tools/build-bloom.js
const fs = require('fs');
const path = require('path');
const https = require('https');

const DWYL_URL = 'https://raw.githubusercontent.com/dwyl/english-words/master/words.txt';
const OUT_DIR  = path.join(__dirname, '..', 'data');
const OUT_BIN  = path.join(OUT_DIR, 'bloom-4to7-v1.bin');
const OUT_META = path.join(OUT_DIR, 'bloom-4to7-v1.json');

// Reject obvious abbreviations/acronyms (lowercase)
const BAN = new Set([
  'fifa','nato','nasa','asap','diy','eta','faq','hdmi','jpeg','pdf','usb','html','css','json',
  'yaml','xml','api','ipsec','oauth','dpi','dpi','ssid','jpeg','mpeg','mpeg2','mpeg4','kpi','roi'
]);

// Simple helpers
function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error('HTTP '+res.statusCode));
      let data=''; res.setEncoding('utf8');
      res.on('data', d => data += d);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// MurmurHash3 (x86_32) minimal
function murmur32(str, seed) {
  let h = seed | 0;
  const c1 = 0xcc9e2d51, c2 = 0x1b873593;
  const bytes = Buffer.from(str, 'utf8');
  const len = bytes.length;
  const b32 = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i=0;
  while (i + 4 <= len) {
    let k = b32.getInt32(i, true);
    k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2);
    h ^= k; h = (h << 13) | (h >>> 19);
    h = Math.imul(h, 5) + 0xe6546b64|0;
    i += 4;
  }
  let k1 = 0;
  switch (len & 3) {
    case 3: k1 ^= bytes[i+2] << 16;
    case 2: k1 ^= bytes[i+1] << 8;
    case 1: k1 ^= bytes[i];
            k1 = Math.imul(k1, c1); k1 = (k1 << 15) | (k1 >>> 17); k1 = Math.imul(k1, c2); h ^= k1;
  }
  h ^= len;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Double-hashing indices
function indices(word, m, k) {
  const h1 = murmur32(word, 0x9747b28c);
  const h2 = murmur32(word, 0x5bd1e995);
  const out = new Array(k);
  for (let i=0;i<k;i++) {
    out[i] = (h1 + i*h2) % m;
  }
  return out;
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Downloading DWYL words…');
  const txt = await fetchText(DWYL_URL);

  console.log('Filtering…');
  const words = txt.split(/\r?\n/).map(s=>s.trim().toLowerCase())
    .filter(w => /^[a-z]{4,7}$/.test(w) && !BAN.has(w));

  const n = words.length;             // ~150k typical
  const p = 0.001;                    // target false positive rate (0.1%)
  const m = Math.ceil(-(n * Math.log(p)) / (Math.log(2)**2));  // bits
  const k = Math.max(1, Math.round((m / n) * Math.log(2)));    // hashes

  console.log(`Building Bloom: n=${n}, m=${m} bits (~${(m/8/1024).toFixed(1)} KB), k=${k}`);

  const bitArr = Buffer.alloc(Math.ceil(m/8), 0);

  function setBit(pos){
    const byteIndex = pos >>> 3;
    const mask = 1 << (pos & 7);
    bitArr[byteIndex] |= mask;
  }

  for (const w of words) {
    for (const pos of indices(w, m, k)) setBit(pos);
  }

  fs.writeFileSync(OUT_BIN, bitArr);
  fs.writeFileSync(OUT_META, JSON.stringify({ m, k, n, p, source: 'DWYL filtered 4–7 a–z, BAN list applied' }, null, 2));

  console.log('Done:', OUT_BIN, OUT_META);
})().catch(err => { console.error(err); process.exit(1); });

