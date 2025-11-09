// /assets/js/app.js — Wordscend (Bloom + Streaks + Live Scoring + Theme)
(function () {
  /* ---------- Pre-apply Theme ---------- */
  (function initThemeEarly(){
    try{
      const pref = localStorage.getItem('ws_theme') || 'dark';
      const apply = (p) => {
        const el = document.documentElement;
        if (p === 'auto') {
          const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          el.setAttribute('data-theme', dark ? 'dark' : 'light');
        } else {
          el.setAttribute('data-theme', p);
        }
      };
      apply(pref);
      if (pref === 'auto') {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const cb = () => apply('auto');
        mq.addEventListener?.('change', cb);
        window.__ws_theme_mql = mq;
        window.__ws_theme_cb  = cb;
      }
    }catch{}
  })();

  /* ---------- Utilities ---------- */
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
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function dateMinus(ymd, n){
    const [y,m,d] = ymd.split('-').map(Number);
    const dt = new Date(y, m-1, d);
    dt.setDate(dt.getDate() - n);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  }

  /* ---------- Config ---------- */
  const BASE = 'https://innovative-edge-consulting.github.io/web-games';
  const ALLOWED_URL = 'https://raw.githubusercontent.com/dwyl/english-words/master/words.txt';
  const SCORE_TABLE = [100, 70, 50, 35, 25, 18];
  const LEVEL_LENGTHS = [4, 5, 6, 7];
  const STORE_KEY = 'wordscend_v3';

  function defaultStore() {
    return {
      day: todayKey(),
      score: 0,
      levelIndex: 0,
      streak: { current: 0, best: 0, lastPlayDay: null, markedToday: false }
    };
  }
  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultStore();
      const s = JSON.parse(raw);
      const t = todayKey();
      if (s.day !== t) { s.day=t; s.score=0; s.levelIndex=0; s.streak.markedToday=false; }
      return s;
    } catch { return defaultStore(); }
  }
  function saveStore(s){ localStorage.setItem(STORE_KEY, JSON.stringify(s)); }

  function markPlayedToday(store){
    const today = todayKey(), st = store.streak;
    if (st.markedToday) return false;
    if (st.lastPlayDay === today){ st.markedToday=true; saveStore(store); return true; }
    if (st.lastPlayDay === dateMinus(today,1)) st.current=(st.current||0)+1; else st.current=1;
    if (st.current>st.best) st.best=st.current;
    st.lastPlayDay=today; st.markedToday=true; saveStore(store); return true;
  }

  const root = document.getElementById('game') || document.body;
  root.innerHTML = '<div style="margin:24px 0;font:600 14px system-ui;color:var(--text);opacity:.8;">Loading word list…</div>';

  const store = loadStore();

  window.WordscendApp_addScore = (d)=>{
    store.score=Math.max(0,(store.score||0)+(d||0)); saveStore(store);
    window.WordscendUI?.setHUD(`Level ${store.levelIndex+1}/4`,store.score,store.streak.current);
  };

  /* ---------- Load Modules ---------- */
  Promise.all([
    loadScript(`${BASE}/core/bloom.js`),
    loadScript(`${BASE}/core/engine.js`),
    loadScript(`${BASE}/ui/dom-view.js`),
    loadScript(`${BASE}/core/dictionary.js`)
  ])
  .then(async()=>{
    const bloom = await WordscendBloom.loadBloom(`${BASE}/data/bloom-4to7-v1.bin`,`${BASE}/data/bloom-4to7-v1.json`);
    const allowedAdapter={has:(w)=>bloom.has(String(w||'').toLowerCase())};
    const {allowedSet}=await WordscendDictionary.loadDWYL(ALLOWED_URL,{minLen:4,maxLen:7});
    const qp=getParams();
    if(qp.endcard==='1'){WordscendUI.mount(root,{rows:6,cols:5});WordscendUI.showEndCard(store.score,store.streak.current,store.streak.best);return;}
    startLevel(store.levelIndex);
    if(qp.intro==='1')WordscendUI.showRulesModal();
    if(qp.settings==='1')WordscendUI.showSettingsModal();

    async function startLevel(idx){
      const len=LEVEL_LENGTHS[idx]; WordscendEngine.setAllowed(allowedAdapter);
      const list=Array.from(allowedSet).filter(w=>w.length===len);
      const ans=WordscendDictionary.pickToday(list);
      WordscendEngine.setAnswer(ans);
      const cfg=WordscendEngine.init({rows:6,cols:len});
      WordscendUI.mount(root,cfg);
      WordscendUI.setHUD(`Level ${idx+1}/4`,store.score,store.streak.current);

      const orig=WordscendEngine.submitRow.bind(WordscendEngine);
      WordscendEngine.submitRow=function(){
        const res=orig();
        if(res?.ok&&markPlayedToday(store))
          WordscendUI.setHUD(`Level ${idx+1}/4`,store.score,store.streak.current);
        if(res?.ok&&res.done){
          if(res.win){
            const gain=SCORE_TABLE[(res.attempt||6)-1]||0; store.score+=gain; saveStore(store);
            WordscendUI.setHUD(`Level ${idx+1}/4`,store.score,store.streak.current);
            WordscendUI.showBubble(`+${gain} pts`);
            const last=(idx===LEVEL_LENGTHS.length-1);
            setTimeout(()=>{
              if(last){WordscendUI.showEndCard(store.score,store.streak.current,store.streak.best);
                store.day=todayKey();store.score=0;store.levelIndex=0;saveStore(store);}
              else{store.levelIndex=idx+1;saveStore(store);startLevel(store.levelIndex);}
            },1200);
          }else{WordscendUI.showBubble('Out of tries. Try again');setTimeout(()=>startLevel(idx),1200);}
        }
        return res;
      };
    }
  })
  .catch(err=>{
    console.error('[Wordscend] load failed',err);
    root.innerHTML='<div style="margin:24px;font:600 14px system-ui;color:var(--text);">Load failed. Refresh.</div>';
  });
})();
