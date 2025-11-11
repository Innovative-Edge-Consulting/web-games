// /assets/js/app.js
(function () {
  /* ---------------- Monetization (feature-flagged) ---------------- */
  // Flip this to true when your domain is approved in AdSense and you’re ready to show ads.
  const ENABLE_ADSENSE = false;
  const ADSENSE_CLIENT_ID = 'ca-pub-XXXXXXXXXXXXXXX'; // <-- replace when enabling

  let _adsCssInjected = false;

  function injectAdsCSS() {
    if (_adsCssInjected) return;
    _adsCssInjected = true;
    const css = `
      .ws-ad{display:block;width:100%}
      .ws-ad-top{max-width:728px;margin:8px auto 0;min-height:90px}
      .ws-ad-endcard{max-width:300px;margin:12px auto;min-height:250px}
      @media (max-width:430px){
        .ws-ad-top{min-height:60px}
        .ws-ad-endcard{min-height:250px}
      }
    `;
    const style = document.createElement('style');
    style.setAttribute('data-ws-ads-css','1');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function loadAdSense(clientId){
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[data-ws-adsense]')) return resolve();
      const s = document.createElement('script');
      s.async = true;
      s.setAttribute('data-ws-adsense','1');
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
      s.crossOrigin = "anonymous";
      s.onload = resolve;
      s.onerror = () => reject(new Error('AdSense failed to load'));
      document.head.appendChild(s);
    });
  }

  function injectResponsiveAd(container){
    // Safe no-op if ads disabled or not ready
    if (!ENABLE_ADSENSE || !container) return;
    if (!window.adsbygoogle) return; // not yet loaded
    container.innerHTML = '';
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-format','auto');
    ins.setAttribute('data-full-width-responsive','true');
    // Optional: once you create slots in AdSense UI, wire them:
    // ins.setAttribute('data-ad-slot','##########');
    container.appendChild(ins);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
  }

  async function Wordscend_enableAds(){
    if (!ENABLE_ADSENSE) return;
    try {
      injectAdsCSS();
      await loadAdSense(ADSENSE_CLIENT_ID);
      window.adsbygoogle = window.adsbygoogle || [];
    } catch(e){
      console.warn('[ads]', e.message);
    }
  }

  function Wordscend_mountTopAd(root){
    if (!ENABLE_ADSENSE) return;
    try{
      const topbar = root.querySelector('.ws-topbar');
      if (!topbar) return;
      let ad = root.querySelector('.ws-ad-top');
      if (!ad){
        ad = document.createElement('div');
        ad.className = 'ws-ad ws-ad-top';
        topbar.insertAdjacentElement('afterend', ad);
      }
      injectResponsiveAd(ad);
    }catch{}
  }

  function Wordscend_patchEndcardForAd(){
    if (!ENABLE_ADSENSE || !window.WordscendUI || !window.WordscendUI.showEndCard) return;
    if (window.WordscendUI._adpatched) return;
    const orig = window.WordscendUI.showEndCard.bind(window.WordscendUI);
    window.WordscendUI.showEndCard = function(score, cur, best){
      orig(score, cur, best);
      try{
        let host = document.querySelector('.ws-endcard .card');
        if (!host) return;
        let ad = host.querySelector('.ws-ad-endcard');
        if (!ad){
          ad = document.createElement('div');
          ad.className = 'ws-ad ws-ad-endcard';
          // place ad just after button row for good viewability
          const btnRow = host.querySelector('.row:last-of-type');
          if (btnRow) btnRow.insertAdjacentElement('afterend', ad);
          else host.appendChild(ad);
        }
        injectResponsiveAd(ad);
      }catch{}
    };
    window.WordscendUI._adpatched = true;
  }

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
        current: 0, best: 0, lastPlayDay: null, markedToday: false,
        milestones:[3,7,14,30,50,100], lastMilestoneShown:0,
        available:0, earnedMonths:[], usedDays:[], toastDayShown:null
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

    if (st.current >= 7) {
      const mk = monthKey(today);
      if (!st.earnedMonths.includes(mk)) { st.earnedMonths.push(mk); st.available += 1; earnedFreeze = true; }
    }

    for (const m of st.milestones){ if (st.current >= m && st.lastMilestoneShown < m) milestone = m; }
    if (milestone) st.lastMilestoneShown = milestone;

    st.lastPlayDay = today; st.markedToday = true;
    const showToast = st.toastDayShown !== today; if (showToast) st.toastDayShown = today;

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

  const store = applyUrlOverrides(loadStore());

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
    // load order matters
    await loadAny([`${BASE}/core/engine.js?v=state1`, `/core/engine.js?v=state1`]);
    await loadAny([`${BASE}/ui/dom-view.js?v=state1`, `/ui/dom-view.js?v=state1`]);
    // If you still serve dictionary.js, keep this next line; if you removed it earlier, delete this line.
    await loadAny([`${BASE}/core/dictionary.js?v=state1`, `/core/dictionary.js?v=state1`]).catch(()=>{});

    // If using WordscendDictionary (when dictionary.js is present):
    let allowedSet = null;
    if (window.WordscendDictionary && window.WordscendDictionary.loadDWYL){
      const pack = await window.WordscendDictionary.loadDWYL(ALLOWED_URL, { minLen: 4, maxLen: 7 }).catch(()=>{
        const fallback = ['TREE','CAMP','WATER','STONE','LIGHT','BRAVE','FAMILY','MARKET','GARDEN','PLANET'];
        window.WordscendDictionary._allowedSet = new Set(fallback);
        return { allowedSet: window.WordscendDictionary._allowedSet };
      });
      allowedSet = pack && pack.allowedSet ? pack.allowedSet : null;
    }

    const qp = getParams();

    // QA: end card preview
    if (qp.endcard === '1') {
      mountBlankStage();
      await Wordscend_enableAds();
      Wordscend_patchEndcardForAd();
      if (ENABLE_ADSENSE) {
        const endcardHost = document.querySelector('.ws-endcard .card');
        if (endcardHost) {
          let ph = document.createElement('div');
          ph.className = 'ws-ad ws-ad-endcard';
          endcardHost.appendChild(ph);
          injectResponsiveAd(ph);
        }
      }
      return;
    }

    // Start the requested/current level (with restore)
    await startLevel(store.levelIndex);

    // On-demand modals for QA:
    if (qp.intro === '1') window.WordscendUI.showRulesModal();
    if (qp.settings === '1') window.WordscendUI.showSettingsModal();

    /* ------------ functions ------------ */
    function clearProgressForLen(len){
      if (store.progress && store.progress[len]) {
        delete store.progress[len];
        saveStore(store);
      }
    }

    async function startLevel(idx){
      const levelLen = LEVEL_LENGTHS[idx];

      // If you have curated answers via WordscendDictionary
      let curated = null, list = null, answer = 'APPLE'; // default safety
      if (window.WordscendDictionary){
        curated = window.WordscendDictionary.answersOfLength(levelLen);
        list = curated && curated.length
          ? curated
          : (allowedSet ? Array.from(allowedSet).filter(w => w.length === levelLen) : []);
        answer = window.WordscendDictionary.pickToday(list);
        window.WordscendEngine.setAllowed(window.WordscendDictionary.allowedSet || new Set(list));
      } else {
        // Fallback: allow any list you may have wired elsewhere
        window.WordscendEngine.setAllowed(new Set(list || []));
      }

      window.WordscendEngine.setAnswer(answer);
      const cfg = window.WordscendEngine.init({ rows:6, cols: levelLen });

      // ---- Restore progress if same day & same level length ----
      const restorePack = store.progress[levelLen];
      if (restorePack && restorePack.day === store.day && restorePack.state && window.WordscendEngine.hydrate) {
        try{
          window.WordscendEngine.hydrate(restorePack.state, { rows:6, cols:levelLen });
        }catch(e){
          // If hydrate fails due to mismatch, clear stale
          clearProgressForLen(levelLen);
        }
      }

      // Mount AFTER potential hydrate so UI renders current state
      window.WordscendUI.mount(root, { rows:6, cols: levelLen });
      window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);

      // Ads: enable loader once, mount a top banner, and patch endcard
      await Wordscend_enableAds();
      Wordscend_mountTopAd(root);
      Wordscend_patchEndcardForAd();

      const origSubmit = window.WordscendEngine.submitRow.bind(window.WordscendEngine);
      window.WordscendEngine.submitRow = function(){
        const res = origSubmit();

        // Count "played" on any valid processed row
        if (res && res.ok) {
          const stInfo = markPlayedToday(store);
          if (stInfo && stInfo.changed){
            window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);
            if (stInfo.showToast && window.WordscendUI.showStreakToast){
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

        // Persist snapshot after submit processing
        window.WordscendApp_onStateChange?.();

        if (res && res.ok && res.done) {
          if (res.win) {
            const attempt = res.attempt ?? 6;
            const gained = SCORE_TABLE[Math.min(Math.max(attempt,1),6) - 1] || 0;

            // Add per-level bonus on top of live chip points
            store.score += gained;
            saveStore(store);

            window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);
            window.WordscendUI.showBubble?.(`+${gained} pts`);

            const isLast = (idx === LEVEL_LENGTHS.length - 1);
            setTimeout(() => {
              // Clear progress for the level we just finished
              clearProgressForLen(levelLen);

              if (isLast) {
                window.WordscendUI.showEndCard(store.score, store.streak.current, store.streak.best);
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
            window.WordscendUI.showBubble?.('Out of tries. Try again');
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
      window.WordscendUI.setHUD(`Level ${store.levelIndex+1}/4`, store.score, store.streak.current);
    }

    window.addEventListener('beforeunload', () => {
      try{ window.WordscendApp_onStateChange && window.WordscendApp_onStateChange(); }catch{}
    });

  })().catch(err => {
    console.error('[Wordscend] Bootstrap failed:', err);
    root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:var(--text);">Failed to load. Please refresh.</div>';
  });
})();
