// /assets/js/app.js
(function () {
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

  const BASE = 'https://innovative-edge-consulting.github.io/web-games';
  const ALLOWED_URL = 'https://raw.githubusercontent.com/dwyl/english-words/master/words.txt';

  // Scoring per attempt (6 guesses)
  const SCORE_TABLE = [100, 70, 50, 35, 25, 18]; // fail = 0

  // Simple session in localStorage
  const STORE_KEY = 'wordscend_v1';
  function loadStore(){
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { score:0, levelLen:5 }; }
    catch { return { score:0, levelLen:5 }; }
  }
  function saveStore(s){ localStorage.setItem(STORE_KEY, JSON.stringify(s)); }

  const store = loadStore();

  // UI bootstrap
  const root = document.getElementById('game') || document.body;
  root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:#fff;opacity:.8;">Loading word list…</div>';

  Promise.all([
    loadScript(`${BASE}/core/engine.js?v=40`),
    loadScript(`${BASE}/ui/dom-view.js?v=40`),
    loadScript(`${BASE}/core/dictionary.js?v=40`)
  ])
  .then(async () => {
    // Load DWYL allowed + optional curated answers
    const { allowedSet } = await window.WordscendDictionary.loadDWYL(ALLOWED_URL, {
      minLen: 4, maxLen: 7, answersBase: `${BASE}/data`
    });

    // Prepare first level
    await startLevel(store.levelLen);

    console.log('[Wordscend] Session ready', store);

    async function startLevel(levelLen){
      // Pick today's word for this length
      const pool = window.WordscendDictionary.answersOfLength(levelLen);
      // fallback safety
      const list = (pool && pool.length) ? pool : Array.from(allowedSet).filter(w => w.length === levelLen);
      const answer = window.WordscendDictionary.pickToday(list);

      // Configure engine
      window.WordscendEngine.setAllowed(allowedSet);
      window.WordscendEngine.setAnswer(answer);
      const cfg = window.WordscendEngine.init({ rows:6, cols: levelLen });

      // Mount UI
      window.WordscendUI.mount(root, cfg);
      window.WordscendUI.setHUD(`Level: ${levelLen}-Letter`, store.score);

      // Hook into Enter handling outcome by wrapping submitRow (tiny patch)
      const origSubmit = window.WordscendEngine.submitRow.bind(window.WordscendEngine);
      window.WordscendEngine.submitRow = function(){
        const res = origSubmit();
        if (res && res.ok && res.done) {
          // Score calculation
          let gained = 0;
          if (res.win) {
            const attempt = res.attempt ?? 6;
            gained = SCORE_TABLE[Math.min(Math.max(attempt,1),6) - 1] || 0;
          }
          store.score += gained;

          // Bubble summary
          const msg = res.win
            ? `+${gained} pts • ${levelLen}-letter`
            : `0 pts • ${levelLen}-letter`;
          window.WordscendUI.showBubble(res.win ? `Nice! ${msg}` : `Out of tries. ${msg}`);

          // Progression: 4 → 5 → 6 → 7 → 4 …
          store.levelLen = nextLen(levelLen);
          saveStore(store);

          // After flip finishes and bubble shows, move to next level
          const delay = 1200; // allow bubble and flip to finish
          setTimeout(() => {
            startLevel(store.levelLen);
          }, delay);
        }
        return res;
      };
    }

    function nextLen(len){
      if (len === 4) return 5;
      if (len === 5) return 6;
      if (len === 6) return 7;
      return 4;
    }
  })
  .catch(err => {
    console.error('[Wordscend] Bootstrap failed:', err);
    root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:#fff;">Failed to load. Please refresh.</div>';
  });
})();
