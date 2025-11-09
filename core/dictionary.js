// /core/dictionary.js
(function (global) {
  const Dict = {
    _allowedSet: new Set(),
    _answers: {
      4: [], 5: [], 6: [], 7: [] // optional curated pools (empty by default)
    },

    async loadDWYL(url, opts = {}) {
      const cacheKey = 'ws_dwyl_cache_v1';
      const cacheAgeMs = 7 * 24 * 60 * 60 * 1000;

      // Try localStorage cache first
      try{
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (cached && cached.text && (Date.now() - cached.t) < cacheAgeMs) {
          this._allowedSet = this._buildSet(cached.text, opts);
          return { allowedSet: this._allowedSet };
        }
      }catch{}

      // Network (allow browser/CDN cache)
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) throw new Error('Failed to load word list');
      const text = await res.text();

      try{ localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), text })); }catch{}
      this._allowedSet = this._buildSet(text, opts);
      return { allowedSet: this._allowedSet };
    },

    _buildSet(text, {minLen=4, maxLen=7} = {}){
      const set = new Set();
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const w = (lines[i] || '').trim().toUpperCase();
        if (!w) continue;
        if (w.length < minLen || w.length > maxLen) continue;
        if (!/^[A-Z]+$/.test(w)) continue;
        set.add(w);
      }
      return set;
    },

    answersOfLength(len) {
      const list = this._answers[len] || [];
      return list.length ? list.slice() : null;
    },

    pickToday(list) {
      if (!list || !list.length) return 'WORD';

      // Toronto-anchored date parts to keep daily deterministic across users
      let y=0,m=0,day=0;
      try{
        const d=new Date();
        const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
        y=+parts.find(p=>p.type==='year').value;
        m=+parts.find(p=>p.type==='month').value;
        day=+parts.find(p=>p.type==='day').value;
      }catch{
        const d=new Date(); y=d.getFullYear(); m=d.getMonth()+1; day=d.getDate();
      }
      const key = `${y}-${m}-${day}`;

      // simple hash (FNV-1a style)
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
