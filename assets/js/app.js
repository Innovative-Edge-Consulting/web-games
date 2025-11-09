// /assets/js/app.js
(function () {
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.defer = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }
  async function loadAny(urls){
    let lastErr; for (const u of urls){ try{ await loadScript(u); return u; } catch(e){ lastErr=e; } }
    throw lastErr || new Error('All script candidates failed');
  }

  function qs() {
    const p = new URLSearchParams(location.search);
    return { level:p.get('level'), endcard:p.get('endcard'), score:p.get('score'), reset:p.get('reset'), intro:p.get('intro'), settings:p.get('settings') };
  }
  function todayKey(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function dateMinus(ymd,n){ const [y,m,d]=ymd.split('-').map(Number); const t=new Date(y,m-1,d); t.setDate(t.getDate()-n); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; }
  function monthKey(ymd){ const [y,m]=ymd.split('-'); return `${y}-${m}`; }
  function daysBetween(a,b){ const [ay,am,ad]=a.split('-').map(Number); const [by,bm,bd]=b.split('-').map(Number); const da=new Date(ay,am-1,ad); const db=new Date(by,bm-1,bd); return Math.round((db-da)/86400000); }

  const BASE = 'https://innovative-edge-consulting.github.io/web-games';
  const ALLOWED_URL = 'https://raw.githubusercontent.com/dwyl/english-words/master/words.txt';
  const SCORE_TABLE = [100, 70, 50, 35, 25, 18];
  const LEVEL_LENGTHS = [4,5,6,7];
  const STORE_KEY = 'wordscend_v3';

  function defaultStore(){
    return {
      day: todayKey(),
      score: 0,
      levelIndex: 0,
      streak: {
        current: 0, best: 0, lastPlayDay: null, markedToday: false,
        milestones:[3,7,14,30,50,100], lastMilestoneShown:0,
        available:0, earnedMonths:[], usedDays:[], toastDayShown:null
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
  function loadStore(){
    try{
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultStore();
      const s = JSON.parse(raw);
      s.streak = migrateStreak(s.streak);
      const today = todayKey();
      if (s.day !== today){ s.day=today; s.score=0; s.levelIndex=0; s.streak.markedToday=false; }
      if (s.levelLen && s.levelIndex==null){ const idx = Math.max(0, LEVEL_LENGTHS.indexOf(s.levelLen)); s.levelIndex=(idx===-1)?0:idx; delete s.levelLen; }
      if (!Number.isInteger(s.levelIndex)) s.levelIndex=0;
      if (typeof s.score!=='number') s.score=0;
      return s;
    }catch{ return defaultStore(); }
  }
  function saveStore(s){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(s)); }catch{} }

  function markPlayedToday(store){
    const today = todayKey();
    const st = store.streak = migrateStreak(store.streak);
    const last = st.lastPlayDay;

    if (st.markedToday && last === today) return { changed:false };

    let usedFreeze=false, earnedFreeze=false, newBest=false, milestone=null;

    if (last === today) {
      st.markedToday = true;
    } else if (last === dateMinus(today,1)) {
      st.current = (st.current||0) + 1;
    } else {
      if (last && daysBetween(last, today) === 2 && st.available > 0) {
        st.available = Math.max(0, st.available - 1);
        st.usedDays.push(today);
        usedFreeze = true;
        st.current = (st.current||0) + 1;
      } else {
        st.current = 1;
      }
    }

    if ((st.current||0) > (st.best||0)) { st.best = st.current; newBest = true; }

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

  function applyUrlOverrides(store){
    const q = qs();
    if (q.reset === '1'){ const fresh = defaultStore(); saveStore(fresh); return fresh; }
    const lvl = q.level ? parseInt(q.level,10) : NaN;
    if (!isNaN(lvl) && lvl>=1 && lvl<=4){ store.levelIndex = lvl-1; saveStore(store); }
    return store;
  }

  const root = document.getElementById('game') || document.body;
  root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:var(--text);opacity:.85;">Loading word list…</div>';

  const store = applyUrlOverrides(loadStore());

  // Silence any third-party AdSense consumers if present
  if (!window.adsbygoogle) { window.adsbygoogle = []; }

  // Live score hook
  window.WordscendApp_addScore = function(delta){
    try{
      const d = Number(delta||0); if (!isFinite(d) || d===0) return;
      store.score = Math.max(0, (store.score||0) + d);
      saveStore(store);
      if (window.WordscendUI) window.WordscendUI.setHUD(`Level ${store.levelIndex+1}/4`, store.score, store.streak.current);
    }catch{}
  };

  (async () => {
    // Load engine → UI → dictionary (order matters)
    await loadAny([`${BASE}/core/engine.js?v=cb2`, `/core/engine.js?v=cb2`]);
    await loadAny([`${BASE}/ui/dom-view.js?v=cb2`, `/ui/dom-view.js?v=cb2`]);
    await loadAny([`${BASE}/core/dictionary.js?v=cb2`, `/core/dictionary.js?v=cb2`]);

    let allowedSet;
    try{
      const out = await window.WordscendDictionary.loadDWYL(ALLOWED_URL, { minLen:4, maxLen:7 });
      allowedSet = out.allowedSet;
    }catch{
      const fallback = ['TREE','CAMP','WATER','STONE','LIGHT','BRAVE','FAMILY','MARKET','GARDEN','PLANET'];
      allowedSet = new Set(fallback);
      window.WordscendDictionary._allowedSet = allowedSet;
    }

    const q = qs();
    if (q.endcard === '1'){ mountBlankStage(); window.WordscendUI.showEndCard(store.score, store.streak.current, store.streak.best); return; }

    await startLevel(store.levelIndex);
    if (q.intro === '1') window.WordscendUI.showRulesModal();
    if (q.settings === '1') window.WordscendUI.showSettingsModal();

    async function startLevel(idx){
      const levelLen = LEVEL_LENGTHS[idx];
      const curated = window.WordscendDictionary.answersOfLength(levelLen);
      const list = curated && curated.length ? curated : Array.from(window.WordscendDictionary.allowedSet).filter(w => w.length===levelLen);
      const answer = window.WordscendDictionary.pickToday(list);

      window.WordscendEngine.setAllowed(window.WordscendDictionary.allowedSet);
      window.WordscendEngine.setAnswer(answer);
      const cfg = window.WordscendEngine.init({ rows:6, cols: levelLen });

      if (!window.WordscendUI) throw new Error('UI not loaded');
      window.WordscendUI.mount(root, cfg);
      window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);

      const origSubmit = window.WordscendEngine.submitRow.bind(window.WordscendEngine);
      window.WordscendEngine.submitRow = function(){
        const res = origSubmit();

        if (res && res.ok){
          const stInfo = markPlayedToday(store);
          if (stInfo && stInfo.changed){
            window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);
            if (stInfo.showToast){
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

        if (res && res.ok && res.done){
          if (res.win){
            const attempt = res.attempt ?? 6;
            const gained = SCORE_TABLE[Math.min(Math.max(attempt,1),6)-1] || 0;
            store.score += gained; saveStore(store);
            window.WordscendUI.setHUD(`Level ${idx+1}/4`, store.score, store.streak.current);
            window.WordscendUI.showBubble('+'+gained+' pts');

            const isLast = (idx === LEVEL_LENGTHS.length-1);
            setTimeout(() => {
              if (isLast){
                window.WordscendUI.showEndCard(store.score, store.streak.current, store.streak.best);
                store.day = todayKey(); store.score = 0; store.levelIndex = 0; saveStore(store);
              } else {
                store.levelIndex = idx + 1; saveStore(store); startLevel(store.levelIndex);
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
