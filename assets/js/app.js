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

  // Load engine + UI + dictionary, then init game AFTER dictionary is loaded
  Promise.all([
    loadScript(`${BASE}/core/engine.js?v=20`),
    loadScript(`${BASE}/ui/dom-view.js?v=20`),
    loadScript(`${BASE}/core/dictionary.js?v=20`)
  ])
  .then(async () => {
    // 1) Load allowed/answers
    const { allowed, answers } = await window.WordscendDictionary.loadLists(`${BASE}/data`);

    // 2) Initialize engine
    window.WordscendEngine.setAllowed(allowed);

    // 3) Pick today's answer deterministically
    const today = window.WordscendDictionary.pickToday(answers);
    window.WordscendEngine.setAnswer(today);

    // 4) Init board + mount UI
    const cfg  = window.WordscendEngine.init(); // rows/cols unchanged for now
    const root = document.getElementById('game') || document.body;
    window.WordscendUI.mount(root, cfg);

    console.log('[Wordscend] Initialized with answer of the day.');
  })
  .catch(err => console.error('[Wordscend] Bootstrap failed:', err));
})();
