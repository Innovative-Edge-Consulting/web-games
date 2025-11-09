// /core/dictionary.js
(function (global) {
  const BAN_ABBREVS = new Set([
    'fifa','nato','nasa','asap','diy','eta','faq','hdmi','jpeg','pdf','usb',
    'html','css','json','kpi','roi','oauth','yaml','xml','api','ipsec','oauth'
  ]);

  function looksEnglish(word) {
    if (typeof word !== 'string' || !word) return false;
    const lower = word.toLowerCase();
    if (!/^[a-z]{4,7}$/.test(lower)) return false;
    if (BAN_ABBREVS.has(lower)) return false;
    return true;
  }

  const Dict = {
    _allowedSet: new Set(),
    _answers: {
      4: [], 5: [], 6: [], 7: [] // optional curated pools (empty by default)
    },

    async loadDWYL(url, opts = {}) {
      const minLen = opts.minLen ?? 4;
      const maxLen = opts.maxLen ?? 7;

      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load word list');
      const text = await res.text();

      const set = new Set();
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const w = (lines[i] || '').trim().toUpperCase();
        if (!w) continue;
        if (w.length < minLen || w.length > maxLen) continue;
        if (!/^[A-Z]+$/.test(w)) continue;
        if (!looksEnglish(w)) continue;
        set.add(w);
      }
      this._allowedSet = set;
      return { allowedSet: this._allowedSet };
    },

    looksEnglish,

    isAllowedGuess(word) {
      if (!looksEnglish(word)) return false;
      return this._allowedSet.has((word || '').toUpperCase());
    },

    answersOfLength(len) {
      const list = this._answers[len] || [];
      return list.length ? list.slice() : null;
    },

    pickToday(list) {
      if (!list || !list.length) return 'WORD';
      const d = new Date();
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const key = `${y}-${m}-${day}`;

      // simple hash
      let h = 2166136261;
      for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = (h * 16777619) >>> 0;
      }
      const idx = h % list.length;
      return list[idx];
    },

    get allowedSet(){ return this._allowedSet; }
  };

  global.WordscendDictionary = Dict;
})(window);
