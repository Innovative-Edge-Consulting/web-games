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

  // Light "loading" hint so users see progress on first boot
  const root = document.getElementById('game') || document.body;
  root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:#fff;opacity:.8;">Loading word list…</div>';

  Promise.all([
    loadScript(`${BASE}/core/engine.js?v=30`),
    loadScript(`${BASE}/ui/dom-view.js?v=30`),
    loadScript(`${BASE}/core/dictionary.js?v=30`)
  ])
  .then(async () => {
    // 1) Load DWYL list (4–7 letters) and optional answers.txt from /data
    const { allowedSet, answers } = await window.WordscendDictionary.loadDWYL(ALLOWED_URL, {
      minLen: 4,
      maxLen: 7,
      answersBase: `${BASE}/data` // keep if you want to manage curated answers; remove to rely solely on DWYL
    });

    // 2) Configure engine with allowed + pick today's answer
    window.WordscendEngine.setAllowed(allowedSet);
    const today = window.WordscendDictionary.pickToday(answers);

    // Ensure board width matches today’s answer length (usually 5)
    const cfg = { cols: today.length, rows: 6 };
    window.WordscendEngine.setAnswer(today);
    const finalCfg = window.WordscendEngine.init(cfg);

    // 3) Mount UI
    window.WordscendUI.mount(root, finalCfg);

    console.log('[Wordscend] Initialized with DWYL allowed list and word of the day:', today);
  })
  .catch(err => {
    console.error('[Wordscend] Bootstrap failed:', err);
    root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:#fff;">Failed to load. Please refresh.</div>';
  });
})();
