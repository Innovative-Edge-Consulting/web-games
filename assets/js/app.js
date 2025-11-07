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
      intro: p.get('intro')
    };
  }

  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  }

  /* ---------------- Config ---------------- */
  const BASE = 'https://innovative-edge-consulting.github.io/web-games';
  const ALLOWED_URL = 'https://raw.githubusercontent.com/dwyl/english-words/master/words.txt';
  const SCORE_TABLE = [100, 70, 50, 35, 25, 18];
  const LEVEL_LENGTHS = [4, 5, 6, 7];
  const STORE_KEY = 'wordscend_v2';

  function defaultStore() {
    return {
      day: todayKey(),
      score: 0,
      levelIndex: 0,
      streak: { current: 0, best: 0, lastCompleteDay: null }
    };
  }
  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultStore();
      const parsed = JSON.parse(raw);
      if (parsed.levelLen && parsed.levelIndex == null) {
        const idx = Math.max(0, LEVEL_LENGTHS.indexOf(parsed.levelLen));
        parsed.levelIndex = (idx === -1) ? 0 : idx;
        delete parsed.levelLen;
      }
      parsed.levelIndex = Number.isInteger(parsed.levelIndex) ? parsed.levelIndex : 0;
      parsed.score = typeof parsed.score === 'number' ? parsed.score : 0;
      if (!parsed.streak) parsed.streak = { current: 0, best: 0, lastCompleteDay: null };

      const today = todayKey();
      if (parsed.day !== today) {
        parsed.day = today;
        parsed.score = 0;
        parsed.levelIndex = 0;
      }
      return parsed;
    } catch {
      return defaultStore();
    }
  }
  function saveStore(s){ localStorage.setItem(STORE_KEY, JSON.stringify(s)); }

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

  Promise.all([
    loadScript(`${BASE}/core/engine.js?v=100`),
    loadScript(`${BASE}/ui/dom-view.js?v=100`),
    loadScript(`${BASE}/core/dictionary.js?v=100`)
  ])
  .then(async () => {
    const { allowedSet } = await window.WordscendDictionary.loadDWYL(ALLOWED_URL, {
      minLen: 4, maxLen: 7, answersBase: `${BASE}/data`
    });

    const qp = getParams();

    // QA: end card preview
    if (qp.endcard === '1') {
      const fakeScore = qp.score ? Math.max(0, parseInt(qp.score, 10) || 0) : store.score;
      mountBlankStage();
      window.WordscendUI.showEndCard(fakeScore, store.streak.current, store.streak.best);
      return;
    }

    // Normal start
    await startLevel(store.levelIndex);

    // Intro Card — show once per user, or force via ?intro=1
    const introSeen = (localStorage.getItem('ws_intro_seen') === '1');
    if (qp.intro === '1' || !introSeen) {
      window.WordscendUI.showIntroCard();
      // if forced by ?intro=1, do not auto-set seen flag; user must click Play Now
      if (!introSeen && qp.intro !== '1') {
        // we set it only when they press Play Now; handled in UI.showIntroCard
      }
    }

    /* ------------ functions ------------ */
    async function startLevel(idx){
      const levelLen = LEVEL_LENGTHS[idx];
      const pool = window.WordscendDictionary.answersOfLength(levelLen);
      const list = (pool && pool.length) ? pool : Array.from(allowedSet).filter(w => w.length === levelLen);
      const answer = window.WordscendDictionary.pickToday(list);

      window.WordscendEngine.setAllowed(allowedSet);
      window.WordscendEngine.setAnswer(answer);
      const cfg = window.WordscendEngine.init({ rows:6, cols: levelLen });

      window.WordscendUI.mount(root, cfg);
      window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);

      const origSubmit = window.WordscendEngine.submitRow.bind(window.WordscendEngine);
      window.WordscendEngine.submitRow = function(){
        const res = origSubmit();

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
                // Streak update on full completion
                const today = todayKey();
                const last = store.streak.lastCompleteDay;
                if (last === dateMinus(today, 1)) {
                  store.streak.current = (store.streak.current || 0) + 1;
                } else if (last !== today) {
                  store.streak.current = 1;
                }
                if ((store.streak.current || 0) > (store.streak.best || 0)) {
                  store.streak.best = store.streak.current;
                }
                store.streak.lastCompleteDay = today;
                saveStore(store);

                window.WordscendUI.showEndCard(store.score, store.streak.current, store.streak.best);

                // Reset for next daily run (streak persists)
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
      window.WordscendUI.setHUD(`Level 4/4`, store.score, store.streak.current);
    }

    function dateMinus(ymd, n){
      // ymd is "YYYY-MM-DD" (todayKey)
      const [y,m,d] = ymd.split('-').map(Number);
      const dt = new Date(y, m-1, d);
      dt.setDate(dt.getDate() - n);
      const yy = dt.getFullYear();
      const mm = String(dt.getMonth()+1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    }
  })
  .catch(err => {
    console.error('[Wordscend] Bootstrap failed:', err);
    root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:#fff;">Failed to load. Please refresh.</div>';
  });
})();
