// /core/dictionary.js
(function (global) {
  const Dictionary = {
    _answersByLen: new Map(),   // len -> string[]
    _allowedSet: new Set(),     // all allowed guesses (UPPERCASE)
    _metaByWord: new Map(),     // WORD -> { hint?, def? }

    async loadCustom(answersUrl, allowedUrl, opts = { minLen:4, maxLen:7 }) {
      const minLen = opts.minLen ?? 4;
      const maxLen = opts.maxLen ?? 7;

      const answersJson = await fetch(answersUrl).then(r => {
        if (!r.ok) throw new Error('answers.json fetch failed');
        return r.json();
      });

      let allowedJson = null;
      try {
        const r = await fetch(allowedUrl);
        if (!r.ok) throw new Error('allowed.json fetch failed');
        allowedJson = await r.json();
      } catch {
        // Optional; we’ll fall back to answers if missing
        allowedJson = {};
      }

      // Helpers
      const normWord = (w) => (w || '').toUpperCase().trim();
      const isAlpha  = (w) => /^[A-Z]+$/.test(w);
      const isClean  = (w) => isAlpha(w) && w.length >= minLen && w.length <= maxLen && !/^([A-Z])\1+$/.test(w);

      // Normalize entries that can be string or object { w, hint?, def? }
      const normalizeEntry = (entry) => {
        if (typeof entry === 'string') {
          const w = normWord(entry);
          return w && isClean(w) ? { w } : null;
        }
        if (entry && typeof entry === 'object' && typeof entry.w === 'string') {
          const w = normWord(entry.w);
          if (!isClean(w)) return null;
          const rec = { w };
          if (entry.hint) rec.hint = String(entry.hint);
          if (entry.def)  rec.def  = String(entry.def);
          return rec;
        }
        return null;
      };

      this._answersByLen.clear();
      this._metaByWord = new Map();

      // Build answers by length & meta map
      for (let L = minLen; L <= maxLen; L++) {
        const key = String(L);
        const rawArr = Array.isArray(answersJson[key]) ? answersJson[key] : [];
        const cleanedObjs = rawArr.map(normalizeEntry).filter(Boolean);
        const wordsOnly = Array.from(new Set(cleanedObjs.map(o => o.w)));
        this._answersByLen.set(L, wordsOnly);

        // capture meta for any word that has it
        for (const o of cleanedObjs) {
          if (o.hint || o.def) {
            this._metaByWord.set(o.w, { hint: o.hint, def: o.def });
          }
        }
      }

      // Build allowed set (fallback to answers, extracting .w when needed)
      const allowedAll = [];
      for (let L = minLen; L <= maxLen; L++) {
        const key = String(L);
        const src = Array.isArray(allowedJson[key]) ? allowedJson[key] : (answersJson[key] || []);
        // Safely extract words whether src entries are strings or { w, ... } objects
        const words = src
          .map(e => (typeof e === 'string' ? e : (e && typeof e.w === 'string' ? e.w : null)))
          .filter(Boolean);
        const cleaned = words.map(normWord).filter(isClean);
        allowedAll.push(...cleaned);
      }
      this._allowedSet = new Set(allowedAll);

      // Ensure all answers are allowed
      for (const list of this._answersByLen.values()) {
        for (const w of list) this._allowedSet.add(w);
      }

      return { answersByLen: this._answersByLen, allowedSet: this._allowedSet };
    },

    answersOfLength(len) { return this._answersByLen.get(len) || []; },
    get allowedSet() { return this._allowedSet; },
    getMeta(word) { return this._metaByWord.get((word || '').toUpperCase()) || null; },

    // Deterministic pick by date + length (stable daily answer)
    pickToday(list, seedStr) {
      if (!list || !list.length) return 'APPLE';
      const seed = (seedStr || this._todayKey()) + ':' + list[0].length;
      let h = 5381; // djb2-ish
      for (let i = 0; i < seed.length; i++) h = ((h << 5) + h) + seed.charCodeAt(i);
      const idx = Math.abs(h) % list.length;
      return list[idx];
    },

    _todayKey() {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${da}`;
    }
  };

  global.WordscendDictionary = Dictionary;
})(window);
