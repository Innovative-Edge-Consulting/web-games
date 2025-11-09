// /assets/js/app.js — Wordscend (Bloom + Streaks + Live Scoring + Theme)
/* =========================================================================
   This file boots the game, pre-applies theme (to avoid flash), wires the
   Bloom filter for offline guess validation, uses DWYL only to enumerate
   per-length answers, and preserves:
   - Daily streak tracking
   - Score HUD + live-chip increments + per-level bonus
   - URL QA params (?level, ?endcard, ?score, ?reset, ?intro, ?settings)
   - Rules / Settings modals
   ======================================================================= */
(function () {
  /* ---------- Pre-apply Theme to avoid flash ---------- */
  (function initThemeEarly(){
    try{
      const pref = localStorage.getItem('ws_theme') || 'dark';
      const apply = (p) => {
        const el = document.documentElement;
        if (p === 'auto') {
          const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          el.setAttribute('data-theme', dark ? 'dark' : 'light');
        } else {
          el.setAttribute('data-theme', p);
        }
      };
      apply(pref);
      if (pref === 'auto') {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const cb = () => apply('auto');
        mq.addEventListener?.('change', cb);
        window.__ws_theme_mql = mq;
        window.__ws_theme_cb  = cb;
      }
    }catch{}
  })();

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

  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
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
  const ALLOWED_URL = 'https://raw.githubusercontent.com/dwyl/english-words/master/words.txt'; // used only to enumerate answers by length
  const SCORE_TABLE = [100, 70, 50, 35, 25, 18]; // per-level bonus by attempt 1..6
  const LEVEL_LENGTHS = [4, 5, 6, 7];
  const STORE_KEY = 'wordscend_v3';

  function defaultStore() {
    return {
      day: todayKey(),
      score: 0,
      levelIndex: 0,
      streak: { current: 0, best: 0, lastPlayDay: null, markedToday: false },
      progress: {}
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

      if (!parsed.progress || typeof parsed.progress !== 'object') {
        parsed.progress = {};
      }

      const today = todayKey();
      if (parsed.day !== today) {
        parsed.day = today;
        parsed.score = 0;
        parsed.levelIndex = 0;
        parsed.streak.markedToday = false;
        parsed.progress = {};
      }
      if (parsed.levelLen && parsed.levelIndex == null) {
        const idx = Math.max(0, LEVEL_LENGTHS.indexOf(parsed.levelLen));
        parsed.levelIndex = (idx === -1) ? 0 : idx;
        delete parsed.levelLen;
      }
      parsed.levelIndex = Number.isInteger(parsed.levelIndex) ? parsed.levelIndex : 0;
      parsed.score = typeof parsed.score === 'number' ? parsed.score : 0;

      return parsed;
    } catch {
      return defaultStore();
    }
  }
  function saveStore(s){
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
      return true;
    } catch (err) {
      console.warn('[Wordscend] Failed to persist store:', err);
      return false;
    }
  }

  // Mark "played today" on first valid processed guess (for streak)
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

  /* ---------------- Bootstrap shell ---------------- */
  const root = document.getElementById('game') || document.body;
  root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:var(--text);opacity:.8;">Loading word list…</div>';

  const store0 = loadStore();
  const store = applyUrlOverrides(store0);

  // Global live-score hook used by UI chips
  window.WordscendApp_addScore = function(delta){
    try {
      const d = Number(delta || 0);
      if (!isFinite(d) || d === 0) return;
      store.score = Math.max(0, (store.score || 0) + d);
      saveStore(store);
      if (window.WordscendUI) {
        window.WordscendUI.setHUD(`Level ${store.levelIndex+1}/4`, store.score, store.streak.current);
      }
    } catch {}
  };

  /* ---------------- Load modules (Bloom first) ---------------- */
  Promise.all([
    loadScript(`${BASE}/core/bloom.js?v=1`),             // Bloom filter loader (validation)
    loadScript(`${BASE}/core/engine.js?v=header-1`),     // Game engine state
    loadScript(`${BASE}/ui/dom-view.js?v=header-2-theme`), // UI
    loadScript(`${BASE}/core/dictionary.js?v=header-1`)  // DWYL loader + pickToday
  ])
  .then(async () => {
    // 1) Load Bloom (validation for guesses)
    const bloom = await window.WordscendBloom.loadBloom(
      `${BASE}/data/bloom-4to7-v1.bin`,
      `${BASE}/data/bloom-4to7-v1.json`
    );
    // Adapter so engine can call .has(...)
    const allowedAdapter = { has: (w) => bloom.has(String(w||'').toLowerCase()) };

    // 2) Load DWYL once to enumerate answers by length (we still filter in dictionary.js)
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

    // On-demand modals for QA
    if (qp.intro === '1') window.WordscendUI.showRulesModal();
    if (qp.settings === '1') window.WordscendUI.showSettingsModal();

    /* ------------ functions ------------ */
    async function startLevel(idx){
      const levelLen = LEVEL_LENGTHS[idx];

      // Use Bloom adapter for guess validation
      window.WordscendEngine.setAllowed(allowedAdapter);

      // Build the per-length answer pool from DWYL once, then pick today's
      const list = Array.from(allowedSet).filter(w => w.length === levelLen);
      const todaysAnswer = window.WordscendDictionary.pickToday(list);

      const savedProgress = (store.progress && store.progress[idx]) || null;
      const savedAnswer = typeof savedProgress?.answer === 'string' ? savedProgress.answer.toUpperCase() : null;
      const answer = (savedAnswer && savedAnswer.length === levelLen) ? savedAnswer : todaysAnswer;

      window.WordscendEngine.setAnswer(answer);
      const cfg = window.WordscendEngine.init({ rows:6, cols: levelLen });

      let restored = false;
      if (savedProgress && savedAnswer === answer && typeof window.WordscendEngine.hydrateState === 'function') {
        restored = window.WordscendEngine.hydrateState(savedProgress);
        if (!restored) {
          delete store.progress[idx];
          saveStore(store);
        }
      } else if (savedProgress) {
        delete store.progress[idx];
        saveStore(store);
      }

      window.WordscendUI.mount(root, cfg);
      window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);

      if (restored) {
        window.WordscendUI.renderGrid();
        window.WordscendUI.renderKeyboard();
      }

      const persistState = () => {
        if (typeof window.WordscendEngine.serializeState !== 'function') return;
        if (!store.progress || typeof store.progress !== 'object') store.progress = {};
        store.progress[idx] = window.WordscendEngine.serializeState();
        saveStore(store);
      };

      const clearProgress = () => {
        if (store.progress && store.progress[idx]) {
          delete store.progress[idx];
          saveStore(store);
        }
      };

      persistState();

      window.WordscendApp_onStateChange = function(info = {}) {
        if (info && info.clearProgress) {
          clearProgress();
          return;
        }
        if (info && info.type === 'submit') return;
        persistState();
      };

      // Intercept submitRow to:
      // - persist state after every processed guess
      // - mark streak "played today" on any valid processed row
      // - award per-level bonus on win
      const origSubmit = window.WordscendEngine.submitRow.bind(window.WordscendEngine);
      window.WordscendEngine.submitRow = function(){
        const res = origSubmit();

        if (res && res.ok) {
          persistState();

          if (markPlayedToday(store)) {
            window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);
          }

          if (res.done) {
            if (res.win) {
              const attempt = res.attempt ?? 6;
              const gained  = SCORE_TABLE[Math.min(Math.max(attempt,1),6) - 1] || 0;

              // Add per-level bonus on top of live tile points
              store.score += gained;
              saveStore(store);

              window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);
              window.WordscendUI.showBubble(`+${gained} pts`);

              const isLast = (idx === LEVEL_LENGTHS.length - 1);
              setTimeout(() => {
                clearProgress();
                if (isLast) {
                  window.WordscendUI.showEndCard(store.score, store.streak.current, store.streak.best);
                  // Prepare for next daily (streak persists)
                  store.day = todayKey();
                  store.score = 0;
                  store.levelIndex = 0;
                  store.progress = {};
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
              setTimeout(() => {
                clearProgress();
                startLevel(idx);
              }, 1200);
            }
          }
        }
        return res;
      };
    }

    function mountBlankStage(){
      window.WordscendUI.mount(root, { rows:6, cols:5 });
      window.WordscendUI.setHUD(`Level 4/4`, store.score, store.streak.current);
      window.WordscendApp_onStateChange = null;
    }
  })
  .catch(err => {
    console.error('[Wordscend] Bootstrap failed:', err);
    root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:var(--text);">Failed to load. Please refresh.</div>';
  });
})();
