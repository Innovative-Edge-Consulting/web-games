// /core/dictionary.js
(function (global) {
  const Dict = {
    allowedSet: null,
    answers: null,

    /**
     * Load allowed words from DWYL raw text and (optionally) answers.txt from your repo.
     * @param {string} dwylUrl   - https://raw.githubusercontent.com/dwyl/english-words/master/words.txt
     * @param {object} opts      - { minLen:4, maxLen:7, answersBase:'/data' }
     */
    async loadDWYL(dwylUrl, opts = {}) {
      const minLen = opts.minLen ?? 4;
      const maxLen = opts.maxLen ?? 7;
      const answersBase = opts.answersBase; // e.g., `${BASE}/data`

      function filterLinesToAZRange(text) {
        const set = new Set();
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          let w = lines[i].trim();
          if (!w) continue;
          w = w.toUpperCase();
          if (w.length < minLen || w.length > maxLen) continue;
          if (!/^[A-Z]+$/.test(w)) continue;
          set.add(w);
        }
        return set;
      }

      // 1) Load DWYL words
      let allowedSet = null;
      try {
        const res = await fetch(dwylUrl, { cache: 'no-store' });
        if (res.ok) {
          const text = await res.text();
          allowedSet = filterLinesToAZRange(text);
        }
      } catch (e) {
        console.warn('[Wordscend] Failed to fetch DWYL words:', e);
      }

      // Fallback tiny set if needed
      if (!allowedSet || allowedSet.size === 0) {
        allowedSet = new Set(['ABOUT','OTHER','WHICH','CRANE','ROUTE','ALERT','TRAIN','PLANT','SHEEP','BRAVE','POINT','CLEAN','WATER','LIGHT']);
      }
      this.allowedSet = allowedSet;

      // 2) Load answers.txt (optional)
      let answers = null;
      if (answersBase) {
        try {
          const res = await fetch(`${answersBase}/answers.txt`, { cache: 'no-store' });
          if (res.ok) {
            const txt = await res.text();
            answers = txt.split(/\r?\n/).map(s => s.trim().toUpperCase()).filter(Boolean);
          }
        } catch (e) {
          console.warn('[Wordscend] Could not load answers.txt; will derive from allowed.', e);
        }
      }

      // 3) Derive answers if not provided: pick 5-letter subset from allowed
      if (!answers || answers.length === 0) {
        answers = Array.from(this.allowedSet).filter(w => w.length === 5);
      }

      this.answers = answers;
      return { allowedSet: this.allowedSet, answers: this.answers };
    },

    pickToday(list) {
      const now = new Date();
      const epoch = new Date('2025-01-01T00:00:00Z');
      const dayIndex = Math.floor((now - epoch) / 86400000);
      return list[dayIndex % list.length];
    }
  };

  global.WordscendDictionary = Dict;
  console.log('[Wordscend] Dictionary loader ready (DWYL).');
})(window);
