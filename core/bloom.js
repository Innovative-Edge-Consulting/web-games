// /core/bloom.js
(function(global){
  // Minimal Murmur3 (x86_32)
  function murmur32(str, seed) {
    let h = seed | 0;
    const c1 = 0xcc9e2d51, c2 = 0x1b873593;
    const bytes = new TextEncoder().encode(str);
    const len = bytes.length;
    let i=0;
    while (i + 4 <= len) {
      let k = (bytes[i]) | (bytes[i+1]<<8) | (bytes[i+2]<<16) | (bytes[i+3]<<24);
      k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2);
      h ^= k; h = (h << 13) | (h >>> 19);
      h = (Math.imul(h, 5) + 0xe6546b64) | 0;
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

  function makeIndices(m, k, word){
    const w = word.toLowerCase();
    const h1 = murmur32(w, 0x9747b28c);
    const h2 = murmur32(w, 0x5bd1e995);
    const out = new Array(k);
    for (let i=0;i<k;i++){
      out[i] = (h1 + i*h2) % m;
    }
    return out;
  }

  class Bloom {
    constructor(bitbuf, m, k){
      this.bits = bitbuf; // Uint8Array
      this.m = m|0;
      this.k = k|0;
    }
    has(word){
      if (!/^[a-z]{4,7}$/.test(word)) return false;
      const idxs = makeIndices(this.m, this.k, word);
      for (let pos of idxs) {
        const byteIndex = pos >>> 3;
        const mask = 1 << (pos & 7);
        if ((this.bits[byteIndex] & mask) === 0) return false;
      }
      return true; // maybe
    }
  }

  async function loadBloom(binUrl, metaUrl){
    const [buf, meta] = await Promise.all([
      fetch(binUrl, { cache: 'force-cache' }).then(r=>r.arrayBuffer()),
      fetch(metaUrl, { cache: 'force-cache' }).then(r=>r.json())
    ]);
    return new Bloom(new Uint8Array(buf), meta.m, meta.k);
  }

  global.WordscendBloom = { loadBloom };
})(window);

