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
      try { await loadScript(u); return u; }
      catch(e){ lastErr = e; }
    }
    throw lastErr || new Error('All script candidates failed');
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
  function daysBetween(a,b){
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
        milestones: [3,7,14,30,50,100],
        lastMilestoneShown: 0,
        available: 0,
        earnedMonths: [],
        usedDays: [],
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

  // Mark "played today" + handle freeze & milestones.
  function markPlayedToday(store) {
    const today = todayKey();
    const st = store.streak = migrateStreak(store.streak);
    const last = st.lastPlayDay;

    if (st.markedToday && last === today) {
      return { changed:false };
    }

    let usedFreeze = false;
    let earnedFreeze = false;
    let newBest = false;
    let milestone = null;

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

    if ((st.current || 0) > (st.best || 0)) {
      st.best = st.current;
      newBest = true;
    }

    if (st.current >= 7) {
      const mk = monthKey(today);
      if (!st.earnedMonths.includes(mk)) {
        st.earnedMonths.push(mk);
        st.available += 1;
        earnedFreeze = true;
      }
    }

    for (const m of st.milestones) {
      if (st.current >= m && st.lastMilestoneShown < m) {
        milestone = m;
      }
    }
    if (milestone) st.lastMilestoneShown = milestone;

    st.lastPlayDay = today;
    st.markedToday = true;

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

  // Optional: if some theme/page is still adding AdSense, this stops errors touching our code.
  if (!window.adsbygoogle) { window.adsbygoogle = []; }
  // (If you still see a 403 network error, it’s from the remote script tag itself, not this app.)

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

  (async () => {
    // Load core/ui/dict from GitHub Pages OR fallback to local paths
    const loaded = [];
    loaded.push(await loadAny([`${BASE}/core/engine.js?v=cb1`, `/core/engine.js?v=cb1`]));
    loaded.push(await loadAny([`${BASE}/ui/dom-view.js?v=cb1`, `/ui/dom-view.js?v=cb1`]));
    loaded.push(await loadAny([`${BASE}/core/dictionary.js?v=cb1`, `/core/dictionary.js?v=cb1`]));
    // console.info('[Wordscend] Loaded scripts:', loaded);

    // Load dictionary
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

    if (qp.endcard === '1') {
      mountBlankStage();
      window.WordscendUI.showEndCard(store.score, store.streak.current, store.streak.best);
      return;
    }

    await startLevel(store.levelIndex);

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

      window.WordscendUI.mount(root, cfg);
      window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);

      const origSubmit = window.WordscendEngine.submitRow.bind(window.WordscendEngine);
      window.WordscendEngine.submitRow = function(){
        const res = origSubmit();

        if (res && res.ok) {
          const stInfo = markPlayedToday(store);
          if (stInfo && stInfo.changed) {
            window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);
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

            store.score += gained;
            saveStore(store);

            window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);
            window.WordscendUI.showBubble(`+${gained} pts`);

            const isLast = (idx === LEVEL_LENGTHS.length - 1);
            setTimeout(() => {
              if (isLast) {
                window.WordscendUI.showEndCard(store.score, store.streak.current, store.streak.best);
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
  })().catch(err => {
    console.error('[Wordscend] Bootstrap failed:', err);
    root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:var(--text);">Failed to load. Please refresh.</div>';
  });
})();
