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
  function dateMinus(ymd, n){
    const [y,m,d] = ymd.split('-').map(Number);
    const dt = new Date(y, m-1, d);
    dt.setDate(dt.getDate() - n);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth()+1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  function stripTrailingSlash(href) {
    return href.replace(/\/$/, '');
  }

  function deriveBaseUrl() {
    const override = window.WORDSCEND_BASE;
    if (override) {
      const resolved = new URL(override, document.baseURI);
      return stripTrailingSlash(resolved.href);
    }

    try {
      // document.baseURI already reflects the directory that served index.html
      return stripTrailingSlash(new URL('.', document.baseURI).href);
    } catch (_) {
      // Last-resort: fall back to the current location without the trailing file
      return stripTrailingSlash(new URL('.', location.href).href);
    }
  }

  /* ---------------- Config ---------------- */
  const BASE = deriveBaseUrl();

  function assetUrl(path) {
    const raw = String(path || '');
    if (raw.startsWith('//')) {
      return `${location.protocol}${raw}`;
    }
    try {
      return new URL(raw).toString();
    } catch (_) {
      const cleanPath = raw.replace(/^\/+/, '');
      const baseWithSlash = BASE.endsWith('/') ? BASE : `${BASE}/`;
      return new URL(cleanPath, baseWithSlash).toString();
    }
  }
  const ALLOWED_URL = 'https://raw.githubusercontent.com/dwyl/english-words/master/words.txt';
  const SCORE_TABLE = [100, 70, 50, 35, 25, 18];
  const LEVEL_LENGTHS = [4, 5, 6, 7];
  const STORE_KEY = 'wordscend_v3'; // bump version for streak mode change

  function defaultStore() {
    return {
      day: todayKey(),
      score: 0,
      levelIndex: 0,
      // Play-streak (days played), not completion-streak
      streak: { current: 0, best: 0, lastPlayDay: null, markedToday: false }
    };
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultStore();
      const parsed = JSON.parse(raw);

      // migrate from older schemas:
      if (!parsed.streak) parsed.streak = {};
      // if old field existed, map lastCompleteDay -> lastPlayDay (best effort)
      if (!parsed.streak.lastPlayDay && parsed.streak.lastCompleteDay) {
        parsed.streak.lastPlayDay = parsed.streak.lastCompleteDay;
      }
      parsed.streak.current = Number(parsed.streak.current || 0);
      parsed.streak.best    = Number(parsed.streak.best || 0);
      parsed.streak.lastPlayDay = parsed.streak.lastPlayDay || null;
      parsed.streak.markedToday = !!parsed.streak.markedToday;

      // day rollover: reset level & score each day; DO NOT touch streak counters here
      const today = todayKey();
      if (parsed.day !== today) {
        parsed.day = today;
        parsed.score = 0;
        parsed.levelIndex = 0;
        parsed.streak.markedToday = false; // new day, not marked yet
      }
      // legacy: remove levelLen if present
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

  function safeGet(key, fallback = null) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      console.warn('[Wordscend] localStorage.getItem failed for', key, err);
      return fallback;
    }
  }

  function saveStore(s){
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch (err) {
      console.warn('[Wordscend] Could not persist store:', err);
    }
  }

  // Mark the day as "played" the first time a VALID guess is submitted today
  function markPlayedToday(store) {
    const today = todayKey();
    const st = store.streak;
    if (st.markedToday) return false;            // already counted a play today
    if (st.lastPlayDay === today) {              // safety (shouldn’t happen if markedToday works)
      st.markedToday = true;
      saveStore(store);
      return true;
    }
    // increment streak if consecutive; else start at 1
    if (st.lastPlayDay === dateMinus(today, 1)) {
      st.current = (st.current || 0) + 1;
    } else {
      st.current = 1;
    }
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

  Promise.all([
    loadScript(assetUrl('core/engine.js?v=110')),
    loadScript(assetUrl('ui/dom-view.js?v=110')),
    loadScript(assetUrl('core/dictionary.js?v=110'))
  ])
  .then(async () => {
    const { allowedSet } = await window.WordscendDictionary.loadDWYL(ALLOWED_URL, {
      minLen: 4, maxLen: 7, answersBase: assetUrl('data')
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

    // Intro Card — once per user, or force via ?intro=1
    const introSeen = (safeGet('ws_intro_seen') === '1');
    if (qp.intro === '1' || !introSeen) {
      window.WordscendUI.showIntroCard();
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

        // Mark a "played" day only when a VALID guess (full row) was processed
        if (res && res.ok) {
          if (markPlayedToday(store)) {
            // refresh HUD streak immediately after first valid attempt today
            window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);
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
                // End of daily run → reset score/level for the next day’s play (streak persists)
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
  })
  .catch(err => {
    console.error('[Wordscend] Bootstrap failed:', err);
    root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:#fff;">Failed to load. Please refresh.</div>';
  });
})();
