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
  function monthKey(ymd){
    const [y,m] = ymd.split('-');
    return `${y}-${m}`;
  }
  function daysBetween(a,b){ // a,b: 'YYYY-MM-DD', return integer difference b - a
    const [ay,am,ad] = a.split('-').map(Number);
    const [by,bm,bd] = b.split('-').map(Number);
    const da = new Date(ay,am-1,ad);
    const db = new Date(by,bm-1,bd);
    return Math.round((db - da)/(24*3600*1000));
  }

  /* ---------------- Config ---------------- */
  const BASE = 'https://innovative-edge-consulting.github.io/web-games';
  const ALLOWED_URL = 'https://raw.githubusercontent.com/dwyl/english-words/master/words.txt';
  const SCORE_TABLE = [100, 70, 50, 35, 25, 18]; // per-level bonus
  const LEVEL_LENGTHS = [4, 5, 6, 7];
  const STORE_KEY = 'wordscend_v3';

  function defaultStore() {
    return {
      day: todayKey(),
      score: 0,
      levelIndex: 0,
      streak: {
        current: 0,
        best: 0,
        lastPlayDay: null,
        markedToday: false,

        // NEW: streak UX metadata
        milestones: [3,7,14,30,50,100],
        lastMilestoneShown: 0,

        // NEW: freeze system
        // available: number of unused freezes
        // earnedMonths: list of 'YYYY-MM' months where 1 freeze was earned
        // usedDays: dates 'YYYY-MM-DD' when a freeze was consumed
        available: 0,
        earnedMonths: [],
        usedDays: [],

        // NEW: toast control
        toastDayShown: null
      }
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
    return st;
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultStore();
      const parsed = JSON.parse(raw);

      parsed.streak = migrateStreak(parsed.streak);

      const today = todayKey();
      if (parsed.day !== today) {
        // New calendar day: reset run (but keep streak progression logic at markPlayedToday)
        parsed.day = today;
        parsed.score = 0;
        parsed.levelIndex = 0;
        parsed.streak.markedToday = false;
        // don't reset toastDayShown yet; we'll use it to avoid double toasts if already shown
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

  // Mark "played today" + handle freeze & milestones.
  // Returns details to drive UI toasts.
  function markPlayedToday(store) {
    const today = todayKey();
    const st = store.streak = migrateStreak(store.streak);
    const last = st.lastPlayDay;

    // Already marked today?
    if (st.markedToday && last === today) {
      return { changed:false };
    }

    let usedFreeze = false;
    let earnedFreeze = false;
    let newBest = false;
    let milestone = null;

    // Determine how to progress current streak
    if (last === today) {
      // same day, not expected (handled above), but keep idempotent
      st.markedToday = true;
    } else if (last === dateMinus(today, 1)) {
      // consecutive
      st.current = (st.current || 0) + 1;
    } else {
      // gap of 1 day? (missed exactly one day)
      if (last && daysBetween(last, today) === 2 && st.available > 0) {
        // consume one freeze
        st.available = Math.max(0, st.available - 1);
        st.usedDays.push(today);
        usedFreeze = true;
        // continue the streak as if consecutive
        st.current = (st.current || 0) + 1;
      } else {
        // too long a gap or no freeze: reset
        st.current = 1;
      }
    }

    // Update best
    if ((st.current || 0) > (st.best || 0)) {
      st.best = st.current;
      newBest = true;
    }

    // Earn monthly freeze at day 7 (first time per month)
    if (st.current >= 7) {
      const mk = monthKey(today);
      if (!st.earnedMonths.includes(mk)) {
        st.earnedMonths.push(mk);
        st.available += 1;
        earnedFreeze = true;
      }
    }

    // Milestone check (one-time per milestone value)
    for (const m of st.milestones) {
      if (st.current >= m && st.lastMilestoneShown < m) {
        milestone = m;
      }
    }
    if (milestone) st.lastMilestoneShown = milestone;

    // finalize day marking
    st.lastPlayDay = today;
    st.markedToday = true;

    // control toast (only once per day)
    const showToast = st.toastDayShown !== today;
    if (showToast) st.toastDayShown = today;

    saveStore(store);
    return { changed:true, usedFreeze, earnedFreeze, newBest, milestone, showToast };
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
  root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:var(--text);opacity:.85;">Loading word list…</div>';

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
    let allowedSet = null;
    try {
      const out = await window.WordscendDictionary.loadDWYL(ALLOWED_URL, { minLen: 4, maxLen: 7 });
      allowedSet = out.allowedSet;
    } catch (e) {
      console.warn('[Wordscend] Failed to fetch DWYL list, using fallback.', e);
      const fallback = ['TREE','CAMP','WATER','STONE','LIGHT','BRAVE','FAMILY','MARKET','GARDEN','PLANET'];
      const s = new Set();
      fallback.forEach(w => {
        const up = String(w).toUpperCase();
        if (up.length>=4 && up.length<=7) s.add(up);
      });
      allowedSet = s;
      window.WordscendDictionary._allowedSet = allowedSet;
    }

    const qp = getParams();

    // QA: end card preview
    if (qp.endcard === '1') {
      mountBlankStage();
      window.WordscendUI.showEndCard(store.score, store.streak.current, store.streak.best);
      return;
    }

    // Start the requested/current level
    await startLevel(store.levelIndex);

    // On-demand modals for QA:
    if (qp.intro === '1') window.WordscendUI.showRulesModal();
    if (qp.settings === '1') window.WordscendUI.showSettingsModal();

    /* ------------ functions ------------ */
    async function startLevel(idx){
      const LEVEL_LENGTHS = [4,5,6,7];
      const levelLen = LEVEL_LENGTHS[idx];

      const curated = window.WordscendDictionary.answersOfLength(levelLen);
      const list = curated && curated.length
        ? curated
        : Array.from(window.WordscendDictionary.allowedSet).filter(w => w.length === levelLen);

      const answer = window.WordscendDictionary.pickToday(list);

      window.WordscendEngine.setAllowed(window.WordscendDictionary.allowedSet);
      window.WordscendEngine.setAnswer(answer);
      const cfg = window.WordscendEngine.init({ rows:6, cols: levelLen });

      // Mount UI
      window.WordscendUI.mount(root, cfg);
      window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);

      // Wrap submit for streak + level chaining + score table
      const origSubmit = window.WordscendEngine.submitRow.bind(window.WordscendEngine);
      window.WordscendEngine.submitRow = function(){
        const res = origSubmit();

        // Count "played" on any valid processed row (first time only)
        if (res && res.ok) {
          const stInfo = markPlayedToday(store);
          if (stInfo && stInfo.changed) {
            window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);

            // Welcome/milestone/freeze toast
            if (stInfo.showToast) {
              window.WordscendUI.showStreakToast(store.streak.current, {
                usedFreeze: stInfo.usedFreeze,
                earnedFreeze: stInfo.earnedFreeze,
                milestone: stInfo.milestone,
                newBest: stInfo.newBest,
                freezesAvail: store.streak.available
              });
            }
          }
        }

        if (res && res.ok && res.done) {
          if (res.win) {
            const attempt = res.attempt ?? 6;
            const gained = SCORE_TABLE[Math.min(Math.max(attempt,1),6) - 1] || 0;

            // Add per-level bonus on top of live chip points
            store.score += gained;
            saveStore(store);

            window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);
            window.WordscendUI.showBubble(`+${gained} pts`);

            const isLast = (idx === LEVEL_LENGTHS.length - 1);
            setTimeout(() => {
              if (isLast) {
                window.WordscendUI.showEndCard(store.score, store.streak.current, store.streak.best);
                // Prepare for next day's run (do NOT reset on refresh)
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
      window.WordscendUI.setHUD(`Level ${store.levelIndex+1}/4`, store.score, store.streak.current);
    }
  })
  .catch(err => {
    console.error('[Wordscend] Bootstrap failed:', err);
    root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:var(--text);">Failed to load. Please refresh.</div>';
  });
})();
