// /assets/js/app.js
(function () {
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
  async function loadAny(urls){
    let lastErr;
    for (const u of urls){
      try { await loadScript(u); return u; } catch(e){ lastErr = e; }
    }
    throw lastErr || new Error('All candidates failed');
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
  function monthKey(ymd){ const [y,m] = ymd.split('-'); return `${y}-${m}`; }
  function daysBetween(a,b){
    const [ay,am,ad]=a.split('-').map(Number);
    const [by,bm,bd]=b.split('-').map(Number);
    const da=new Date(ay,am-1,ad), db=new Date(by,bm-1,bd);
    return Math.round((db-da)/86400000);
  }

  /* ---------------- Config ---------------- */
  const BASE = 'https://innovative-edge-consulting.github.io/wordhive';
  const ANSWERS_URL = `${BASE}/data/answers.json`;
  // Local allowed-word list (one word per line) hosted in this repo
  const ALLOWED_URL = `${BASE}/data/allowed.txt?v=1`;
  const SCORE_TABLE = [100, 70, 50, 35, 25, 18]; // per-level bonus
  const LEVEL_LENGTHS = [4, 5, 6, 7];
  const STORE_KEY = 'wordscend_v3';
  const HINT_PENALTY = 10;

  function defaultStore() {
    return {
      day: todayKey(),
      score: 0,
      levelIndex: 0,
      streak: {
        current: 0, best: 0, lastPlayDay: null, markedToday: false,
        milestones:[3,7,14,30,50,100], lastMilestoneShown:0,
        available:0, earnedMonths:[], usedDays:[], toastDayShown:null,
        // NEW: hint bank earned via streak
        hintsAvailable: 0,
        hintEarnedDays: [] // y-m-d dates when a hint was granted (to avoid double-earn on reload)
      },
      progress: {} // { [len]: { day, state } }
    };
  }
  function migrateStreak(st){
    if (!st) st = {};
    st.current = Number(st.current || 0);
    st.best = Number(st.best || 0);
    st.lastPlayDay = st.lastPlayDay || null;
    st.markedToday = !!st.markedToday;
    if (!Array.isArray(st.milestones)) st.milestones = [3,7,14,30,50,100];
    st.lastMilestoneShown = Number(st.lastMilestoneShown || 0);
    st.available = Number(st.available || 0);
    if (!Array.isArray(st.earnedMonths)) st.earnedMonths = [];
    if (!Array.isArray(st.usedDays)) st.usedDays = [];
    st.toastDayShown = st.toastDayShown || null;
    // NEW (hint bank)
    st.hintsAvailable = Number(st.hintsAvailable || 0);
    if (!Array.isArray(st.hintEarnedDays)) st.hintEarnedDays = [];
    return st;
  }
  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultStore();
      const parsed = JSON.parse(raw);

      parsed.streak = migrateStreak(parsed.streak);
      if (!parsed.progress || typeof parsed.progress !== 'object') parsed.progress = {};

      const today = todayKey();
      if (parsed.day !== today) {
        parsed.day = today;
        parsed.score = 0;
        parsed.levelIndex = 0;
        parsed.streak.markedToday = false;
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
  function saveStore(s){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(s)); }catch{} }

  // Mark "played today" on first valid guess processed
  function markPlayedToday(store) {
    const today = todayKey();
    const st = store.streak = migrateStreak(store.streak);
    const last = st.lastPlayDay;

    if (st.markedToday && last === today) return { changed:false };

    let usedFreeze=false, earnedFreeze=false, newBest=false, milestone=null;
    let earnedHint=false; // NEW

    if (last === today) {
      st.markedToday = true;
    } else if (last === dateMinus(today, 1)) {
      st.current = (st.current || 0) + 1;
    } else {
      if (last && daysBetween(last, today) === 2 && st.available > 0) {
        st.available = Math.max(0, st.available - 1);
        st.usedDays.push(today);
        usedFreeze = true;
        st.current = (st.current || 0) + 1;
      } else {
        st.current = 1;
      }
    }

    if ((st.current || 0) > (st.best || 0)) { st.best = st.current; newBest = true; }

    // Freeze earn rule (unchanged): earn 1 per month after reaching day 7 of that month
    if (st.current >= 7) {
      const mk = monthKey(today);
      if (!st.earnedMonths.includes(mk)) { st.earnedMonths.push(mk); st.available += 1; earnedFreeze = true; }
    }

    // NEW: Hint earn rule – earn 1 hint each time the current streak hits a multiple of 5
    // (5,10,15,20,...) — tweakable later.
    if (st.current > 0 && st.current % 5 === 0) {
      if (!st.hintEarnedDays.includes(today)) {
        st.hintsAvailable += 1;
        st.hintEarnedDays.push(today);
        earnedHint = true;
      }
    }

    // Milestones (for celebration copy)
    for (const m of st.milestones){ if (st.current >= m && st.lastMilestoneShown < m) milestone = m; }
    if (milestone) st.lastMilestoneShown = milestone;

    st.lastPlayDay = today; st.markedToday = true;
    const showToast = st.toastDayShown !== today; if (showToast) st.toastDayShown = today;

    saveStore(store);
    return { changed:true, usedFreeze, earnedFreeze, newBest, milestone, showToast, earnedHint };
  }

  // Per-day+level hint limiter key (still 1 hint max per level per day)
  function hintUsedKeyForLen(len){
    return `ws_hint_used_${todayKey()}_${len}`;
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
  root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:var(--text);opacity:.85;">Loading…</div>';

  const store = applyUrlOverrides(loadStore());

  // Global live-score hook used by UI chips
  window.WordscendApp_addScore = function(delta){
    try {
      const d = Number(delta || 0);
      if (!isFinite(d) || d === 0) return;
      // Allow negative score (requested)
      store.score = (store.score || 0) + d;
      saveStore(store);
      if (window.WordscendUI) {
        window.WordscendUI.setHUD(`Level ${store.levelIndex+1}/4`, store.score, store.streak.current, store.streak.hintsAvailable);
      }
    } catch {}
  };

  // Save progress hook on any UI/engine change
  window.WordscendApp_onStateChange = function(){
    try{
      if (!window.WordscendEngine || !window.WordscendEngine.snapshot) return;
      const snap = window.WordscendEngine.snapshot();
      const len = LEVEL_LENGTHS[store.levelIndex];
      store.progress[len] = { day: store.day, state: snap };
      saveStore(store);
    }catch{}
  };

  (async () => {
    // --- keep BASE as the wordhive repo ---

    // Helpers to build robust relative fallbacks
    function here(path) {
      const base = location.pathname.replace(/\/[^/]*$/, '/'); // directory of current page
      return base + path.replace(/^\//,'');
    }

    // Load order matters — try repo URL first, then relative-to-page
    await loadAny([
      `${BASE}/core/engine.js?v=state1`,
      `core/engine.js?v=state1`,
      here('core/engine.js?v=state1')
    ]);

    await loadAny([
      `${BASE}/ui/dom-view.js?v=state1`,
      `ui/dom-view.js?v=state1`,
      here('ui/dom-view.js?v=state1')
    ]);

    await loadAny([
      `${BASE}/core/dictionary.js?v=state1`,
      `core/dictionary.js?v=state1`,
      here('core/dictionary.js?v=state1')
    ]);

    // Load curated lists (answers + allowed)
    await window.WordscendDictionary.loadCustom(ANSWERS_URL, ALLOWED_URL, { minLen: 4, maxLen: 7 });

    const qp = getParams();

    // QA: end card preview
    if (qp.endcard === '1') {
      mountBlankStage();
      window.WordscendUI.showEndCard(store.score, store.streak.current, store.streak.best, {});
      return;
    }

    // Start the requested/current level (with restore)
    await startLevel(store.levelIndex);

    if (qp.intro === '1') window.WordscendUI.showRulesModal();
    if (qp.settings === '1') window.WordscendUI.showSettingsModal();

    /* ------------ functions ------------ */
    function clearProgressForLen(len){
      if (store.progress && store.progress[len]) {
        delete store.progress[len];
        saveStore(store);
      }
    }

    function canUseHintForLen(len){
      // Must have banked hints AND not used a hint for this level today
      const k = hintUsedKeyForLen(len);
      const usedForLevel = localStorage.getItem(k) === '1';
      return !usedForLevel && (store.streak.hintsAvailable > 0);
    }

    function useHintForLen(len){
      const k = hintUsedKeyForLen(len);
      localStorage.setItem(k, '1');
      store.streak.hintsAvailable = Math.max(0, (store.streak.hintsAvailable || 0) - 1);
      saveStore(store);
      // Refresh HUD so “💡 Hints” decrements immediately
      window.WordscendUI.setHUD(`Level ${store.levelIndex+1}/4`, store.score, store.streak.current, store.streak.hintsAvailable);
    }

    async function startLevel(idx){
      const levelLen = LEVEL_LENGTHS[idx];

      const curated = window.WordscendDictionary.answersOfLength(levelLen);
      const list = curated && curated.length ? curated : [];
      const answer = window.WordscendDictionary.pickToday(list);

      // Initialize engine
      window.WordscendEngine.setAllowed(window.WordscendDictionary.allowedSet);
      window.WordscendEngine.setAnswer(answer);
      window.WordscendEngine.init({ rows:6, cols: levelLen });

      // Restore progress if same day & same level length
      const restorePack = store.progress[levelLen];
      if (restorePack && restorePack.day === store.day && restorePack.state && window.WordscendEngine.hydrate) {
        try{ window.WordscendEngine.hydrate(restorePack.state, { rows:6, cols:levelLen }); }
        catch{ clearProgressForLen(levelLen); }
      }

      // Mount AFTER potential hydrate so UI renders current state
      window.WordscendUI.mount(root, { rows:6, cols: levelLen });

      // Provide UI with answer meta so it can show hints/defs
      const meta = window.WordscendDictionary.getMeta(answer);
      window.WordscendUI.setAnswerMeta?.(answer, meta);

      // NEW: pass hintsAvailable to HUD
      window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current, store.streak.hintsAvailable);

      // Hook Hint UX:
      // 1) UI asks if user wants to spend a hint (confirm dialog lives in UI)
      // 2) If confirmed, app checks bank/per-level limit, consumes, then subtracts points
      window.WordscendUI.onHintCheck?.(() => canUseHintForLen(levelLen));
      window.WordscendUI.onHintConsume?.(() => {
        useHintForLen(levelLen);
        // Deduct points even if it sends score negative (as requested)
        window.WordscendApp_addScore(-HINT_PENALTY);
      });

      const origSubmit = window.WordscendEngine.submitRow.bind(window.WordscendEngine);
      window.WordscendEngine.submitRow = function(){
        const res = origSubmit();

        // Count "played" on any valid processed row
        if (res && res.ok) {
          const stInfo = markPlayedToday(store);
          if (stInfo && stInfo.changed){
            window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current, store.streak.hintsAvailable);
            if (stInfo.showToast){
              window.WordscendUI.showStreakToast?.(store.streak.current, {
                usedFreeze: stInfo.usedFreeze,
                earnedFreeze: stInfo.earnedFreeze,
                milestone: stInfo.milestone,
                newBest: stInfo.newBest,
                freezesAvail: store.streak.available,
                earnedHint: stInfo.earnedHint,
                hintsAvail: store.streak.hintsAvailable
              });
            }
          }
        }

        // Persist snapshot after submit processing
        window.WordscendApp_onStateChange?.();

        if (res && res.ok && res.done) {
          if (res.win) {
            const attempt = res.attempt ?? 6;
            const gained = SCORE_TABLE[Math.min(Math.max(attempt,1),6) - 1] || 0;

            // Add per-level bonus on top of live chip points
            store.score += gained;
            saveStore(store);

            window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current, store.streak.hintsAvailable);
            window.WordscendUI.showBubble(`+${gained} pts`);

            const isLast = (idx === LEVEL_LENGTHS.length - 1);
            setTimeout(() => {
              // Clear progress for the level we just finished
              clearProgressForLen(levelLen);

              if (isLast) {
                // pass meta so end-card can offer definition
                const metaNow = window.WordscendDictionary.getMeta(answer);
                window.WordscendUI.showEndCard(store.score, store.streak.current, store.streak.best, {
                  answer, meta: metaNow
                });

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
            // Fail: retry same level — clear progress so new grid starts clean
            window.WordscendUI.showBubble('Out of tries. Try again');
            clearProgressForLen(levelLen);
            saveStore(store);
            setTimeout(() => startLevel(idx), 1200);
          }
        }
        return res;
      };
    }

    function mountBlankStage(){
      window.WordscendUI.mount(root, { rows:6, cols:5 });
      window.WordscendUI.setHUD(`Level ${store.levelIndex+1}/4`, store.score, store.streak.current, store.streak.hintsAvailable);
    }

    // Persist on unload as a safety
    window.addEventListener('beforeunload', () => {
      try{ window.WordscendApp_onStateChange && window.WordscendApp_onStateChange(); }catch{}
    });

  })().catch(err => {
    console.error('[Wordscend] Bootstrap failed:', err);
    root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:var(--text);">Failed to load. Please refresh.</div>';
  });
})();
