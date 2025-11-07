// /core/dictionary.js
(function (global) {
  const Dict = {
    allowedSet: null,
    answers: null,

    async loadDWYL(dwylUrl, opts = {}) {
      const minLen = opts.minLen ?? 4;
      const maxLen = opts.maxLen ?? 7;
      const answersBase = opts.answersBase;

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

      // Allowed from DWYL
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
      if (!allowedSet || allowedSet.size === 0) {
        const fallbackWords = [
          // 4 letters
          'GAME','WORD','PLAY','LAMP','MIST','STAR','WIND','HARP',
          // 5 letters
          'ABOUT','OTHER','WHICH','CRANE','ROUTE','ALERT','TRAIN','PLANT','SHEEP','BRAVE','POINT','CLEAN','WATER','LIGHT',
          // 6 letters
          'BRIDGE','PLANET','GARDEN','FRIEND','MARKET','STREAM','THRIVE','CUSTOM',
          // 7 letters
          'BALANCE','CAPTURE','JOURNEY','MOUNTAIN','HARVEST','PHOENIX','LIBRARY','NETWORK'
        ];
        allowedSet = new Set(fallbackWords);
      }
      this.allowedSet = allowedSet;

      // Optional curated answers
      let answers = null;
      if (answersBase) {
        try {
          const res = await fetch(`${answersBase}/answers.txt`, { cache: 'no-store' });
          if (res.ok) {
            const txt = await res.text();
            answers = txt.split(/\r?\n/).map(s => s.trim().toUpperCase()).filter(Boolean);
          }
        } catch (e) {
          console.warn('[Wordscend] Could not load answers.txt; deriving from allowed.', e);
        }
      }
      if (!answers || answers.length === 0) {
        answers = Array.from(this.allowedSet).filter(w => w.length === 5);
      }
      this.answers = answers;

      return { allowedSet: this.allowedSet, answers: this.answers };
    },

    answersOfLength(len){
      const curated = (this.answers || []).filter(w => w.length === len);
      if (curated.length > 0) return curated;
      // derive from allowed set
      return Array.from(this.allowedSet || []).filter(w => w.length === len);
    },

    pickToday(list) {
      const now = new Date();
      const epoch = new Date('2025-01-01T00:00:00Z');
      if (!list || list.length === 0) return undefined;
      const dayIndex = Math.floor((now - epoch) / 86400000);
      const idx = ((dayIndex % list.length) + list.length) % list.length;
      return list[idx];
    }
  };

  global.WordscendDictionary = Dict;
  console.log('[Wordscend] Dictionary loader ready (DWYL).');
})(window);
