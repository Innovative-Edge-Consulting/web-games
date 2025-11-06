// /assets/js/app.js
(function () {
  // 1) Optional status test (keeps your previous visual check working)
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = '✅ JS connected!';

  // 2) Utility: load another JS file dynamically
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

  // 3) Where to load dependencies from (your GitHub Pages base)
  const BASE = 'https://innovative-edge-consulting.github.io/web-games';

  // 4) Load core engine + UI, then mount into #game
  Promise.all([
    loadScript(`${BASE}/core/engine.js?v=2`),
    loadScript(`${BASE}/ui/dom-view.js?v=2`)
  ])
    .then(() => {
      const root = document.getElementById('game') || document.body;
      const cfg = window.WordscendEngine.getConfig();
      window.WordscendUI.mount(root, cfg);
      console.log('[Wordscend] app.js initialized');
    })
    .catch(err => {
      console.error('[Wordscend] Dependency load failed:', err);
    });
})();
