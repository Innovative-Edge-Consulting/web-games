// /core/dictionary.js
(function (global) {
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
        set.add(w);
      }
      this._allowedSet = set;
      return { allowedSet: this._allowedSet };
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
