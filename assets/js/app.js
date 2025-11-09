// /assets/js/app.js
(function () {
  // Prevent accidental double-boot if included twice
  if (window.__wordscendBooted) { console.warn('[Wordscend] already booted'); return; }
  window.__wordscendBooted = true;

  /* ---------------- Utilities ---------------- */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  function getParams() {
    const p = new URLSearchParams(location.search);
    return {
      level: p.get('level'),
      endcard: p.get('endcard'),
      score: p.get('score'),
      reset: p.get('reset'),
      intro: p.get('intro'),
      settings: p.get('settings')
    };
  }

  // Toronto-anchored date key so the daily stays consistent
  function todayKey(){
    try{
      const d = new Date();
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone:'America/Toronto',
        year:'numeric', month:'2-digit', day:'2-digit'
      }).formatToParts(d);
      const y = parts.find(p=>p.type==='year').value;
      const m = parts.find(p=>p.type==='month').value;
      const da= parts.find(p=>p.type==='day').value;
      return `${y}-${m}-${da}`;
    }catch{
      const d = new Date();
      const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0');
      return `${y}-${m}-${da}`;
    }
  }
  function dateMinus(ymd, n){
    const [y,m,d] = ymd.split('-').map(Number);
    const dt = new Date(y, m-1, d);
    dt.setDate(dt.getDate() - n);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth()+1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  /* ---------------- Config ---------------- */
  const BASE = 'https://innovative-edge-consulting.github.io/web-games';
  const ALLOWED_URL = 'https://raw.githubusercontent.com/dwyl/english-words/master/words.txt';
  const SCORE_TABLE = [100, 70, 50, 35, 25, 18]; // per-level bonus
  const STORE_KEY = 'wordscend_v3';

  function defaultStore() {
    return {
      day: todayKey(),
      score: 0,
      levelIndex: 0,
      streak: { current: 0, best: 0, lastPlayDay: null, markedToday: false }
    };
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultStore();
      const parsed = JSON.parse(raw);

      if (!parsed.streak) parsed.streak = {};
      parsed.streak.current = Number(parsed.streak.current || 0);
      parsed.streak.best    = Number(parsed.streak.best || 0);
      parsed.streak.lastPlayDay = parsed.streak.lastPlayDay || null;
      parsed.streak.markedToday = !!parsed.streak.markedToday;

      const today = todayKey();
      if (parsed.day !== today) {
        parsed.day = today;
        parsed.score = 0;
        parsed.levelIndex = 0;
        parsed.streak.markedToday = false;
      }
      // Legacy migration: convert levelLen to levelIndex (if present)
      if (parsed.levelLen != null && parsed.levelIndex == null) {
        const lengths = [4,5,6,7];
        const i2 = lengths.indexOf(parsed.levelLen);
        parsed.levelIndex = (i2 === -1 ? 0 : i2);
        delete parsed.levelLen;
      }
      parsed.levelIndex = Number.isInteger(parsed.levelIndex) ? parsed.levelIndex : 0;
      parsed.score = typeof parsed.score === 'number' ? parsed.score : 0;

      return parsed;
    } catch {
      return defaultStore();
    }
  }

  function saveStore(s){ localStorage.setItem(STORE_KEY, JSON.stringify(s)); }

  // Mark "played today" on first valid guess processed
  function markPlayedToday(store) {
    const today = todayKey();
    const st = store.streak;
    if (st.markedToday) return false;
    if (st.lastPlayDay === today) { st.markedToday = true; saveStore(store); return true; }
    if (st.lastPlayDay === dateMinus(today, 1)) st.current = (st.current || 0) + 1;
    else st.current = 1;
    if ((st.current || 0) > (st.best || 0)) st.best = st.current;
    st.lastPlayDay = today;
    st.markedToday = true;
    saveStore(store);
    return true;
  }

  function applyUrlOverrides(store) {
    const q = getParams();
    if (q.reset === '1') {
      const fresh = defaultStore();
      saveStore(fresh);
      return fresh;
    }
    const lvl = q.level ? parseInt(q.level, 10) : NaN;
    if (!isNaN(lvl) && lvl >= 1 && lvl <= 4) {
      store.levelIndex = lvl - 1;
      saveStore(store);
    }
    return store;
  }

  /* ---------------- Bootstrap ---------------- */
  const root = document.getElementById('game') || document.body;
  root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:#fff;opacity:.8;">Loading word list…</div>';

  const store0 = loadStore();
  const store = applyUrlOverrides(store0);

  // Global live-score hook used by UI chips
  window.WordscendApp_addScore = function(delta){
    try {
      const d = Number(delta || 0);
      if (!isFinite(d) || d === 0) return;
      store.score = Math.max(0, (store.score || 0) + d);
      saveStore(store);
      // Refresh HUD immediately
      if (window.WordscendUI) {
        window.WordscendUI.setHUD(`Level ${store.levelIndex+1}/4`, store.score, store.streak.current);
      }
    } catch {}
  };

  Promise.all([
    loadScript(`${BASE}/core/engine.js?v=header-1`),
    loadScript(`${BASE}/ui/dom-view.js?v=header-1`),
    loadScript(`${BASE}/core/dictionary.js?v=header-1`)
  ])
  .then(async () => {
    // One source of truth for level lengths (from engine)
    const LEVEL_LENGTHS = (window.WordscendEngine.getLevelLengths && window.WordscendEngine.getLevelLengths()) || [4,5,6,7];

    const { allowedSet } = await window.WordscendDictionary.loadDWYL(ALLOWED_URL, {
      minLen: 4, maxLen: 7
    });

    const qp = getParams();

    // QA: end card preview
    if (qp.endcard === '1') {
      const fakeScore = qp.score ? Math.max(0, parseInt(qp.score, 10) || 0) : store.score;
      mountBlankStage();
      window.WordscendUI.showEndCard(fakeScore, store.streak.current, store.streak.best);
      return;
    }

    // Start the requested/current level
    await startLevel(store.levelIndex);

    // On-demand modals for QA:
    if (qp.intro === '1') window.WordscendUI.showRulesModal();
    if (qp.settings === '1') window.WordscendUI.showSettingsModal();

    /* ------------ functions ------------ */
    async function startLevel(idx){
      const levelLen = LEVEL_LENGTHS[idx];

      const curated = window.WordscendDictionary.answersOfLength(levelLen);
      const list = curated && curated.length
        ? curated
        : Array.from(allowedSet).filter(w => w.length === levelLen);

      const answer = window.WordscendDictionary.pickToday(list);

      window.WordscendEngine.setAllowed(allowedSet);
      window.WordscendEngine.setAnswer(answer);
      const cfg = window.WordscendEngine.init({ rows:6, cols: levelLen });

      window.WordscendUI.mount(root, cfg);
      window.WordscendUI.setHUD(`Level ${idx+1}/4 — ${levelLen}-letter`, store.score, store.streak.current);

      const origSubmit = window.WordscendEngine.submitRow.bind(window.WordscendEngine);
      window.WordscendEngine.submitRow = function(){
        const res = origSubmit();

        // Count "played" on any valid processed row
        if (res && res.ok) {
          if (markPlayedToday(store)) {
            window.WordscendUI.setHUD(`Level ${idx+1}/4 — ${levelLen}-letter`, store.score, store.streak.current);
          }
        }

        if (res && res.ok && res.done) {
          if (res.win) {
            const attempt = res.attempt ?? 6;
            const gained = SCORE_TABLE[Math.min(Math.max(attempt,1),6) - 1] || 0;

            // Add per-level bonus on top of live chip points
            store.score += gained;
            saveStore(store);

            window.WordscendUI.setHUD(`Level ${idx+1}/4 — ${levelLen}-letter`, store.score, store.streak.current);
            window.WordscendUI.showBubble(`+${gained} pts`);

            const isLast = (idx === LEVEL_LENGTHS.length - 1);
            setTimeout(() => {
              if (isLast) {
                window.WordscendUI.showEndCard(store.score, store.streak.current, store.streak.best);
                // Reset score/level for next day’s run (streak persists)
                store.day = todayKey();
                store.score = 0;
                store.levelIndex = 0;
                saveStore(store);
              } else {
                store.levelIndex = idx + 1;
                saveStore(store);
                startLevel(store.levelIndex);
              }
            }, 1200);

          } else {
            // Fail: retry same level
            window.WordscendUI.showBubble('Out of tries. Try again');
            saveStore(store);
            setTimeout(() => startLevel(idx), 1200);
          }
        }
        return res;
      };
    }

    function mountBlankStage(){
      window.WordscendUI.mount(root, { rows:6, cols:5 });
      window.WordscendUI.setHUD(`Level 4/4 — 7-letter`, store.score, store.streak.current);
    }
  })
  .catch(err => {
    console.error('[Wordscend] Bootstrap failed:', err);
    root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:#fff;">Failed to load. Please refresh.</div>';
  });
})();
