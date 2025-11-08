// /ui/dom-view.js
(function (global) {
  const KB_ROWS = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['Enter','Z','X','C','V','B','N','M','Back']
  ];

  /* ---------- Theme helpers ---------- */
  const Theme = {
    media: null,
    current: null,
    getPref() { return localStorage.getItem('ws_theme') || 'dark'; },
    setPref(v){ try{ localStorage.setItem('ws_theme', v); }catch{} },
    systemIsDark(){ 
      this.media = this.media || window.matchMedia('(prefers-color-scheme: dark)');
      return this.media.matches;
    },
    apply(pref) {
      this.current = pref;
      const el = document.documentElement;
      if (pref === 'auto') {
        el.setAttribute('data-theme', this.systemIsDark() ? 'dark':'light');
        this.listenSystem();
      } else {
        el.setAttribute('data-theme', pref);
        this.unlistenSystem();
      }
    },
    listenSystem(){
      this.media = this.media || window.matchMedia('(prefers-color-scheme: dark)');
      if (!this._bound){
        this._bound = (e)=> {
          if (this.current === 'auto') {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark':'light');
          }
        };
        this.media.addEventListener?.('change', this._bound);
      }
    },
    unlistenSystem(){
      if (this.media && this._bound){
        this.media.removeEventListener?.('change', this._bound);
      }
      this._bound = null;
    }
  };

  /* ---------- Tiny sound (green only) ---------- */
  const AudioFX = {
    _ctx: null,
    _enabled() { return (localStorage.getItem('ws_sound') !== '0'); },
    _ensure() {
      if (!this._ctx) {
        try { this._ctx = new (window.AudioContext||window.webkitAudioContext)(); }
        catch {}
      }
      return this._ctx;
    },
    _resumeIfNeeded() {
      const ctx = this._ctx;
      if (!ctx) return;
      if (ctx.state === 'suspended') { ctx.resume().catch(()=>{}); }
    },
    armAutoResumeOnce() {
      if (this._armed) return;
      this._armed = true;
      const resume = () => { if (this._ctx) this._resumeIfNeeded(); };
      window.addEventListener('pointerdown', resume, { passive:true });
      window.addEventListener('keydown', resume);
    },
    ding() {
      if (!this._enabled()) return;
      const ctx = this._ensure();
      if (!ctx) return;
      this._resumeIfNeeded();

      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880; // A5
      g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination);

      const now = ctx.currentTime;
      o.start(now);
      g.gain.setValueAtTime(0.10, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      o.stop(now + 0.2);
    }
  };
  AudioFX.armAutoResumeOnce();

  const UI = {
    mount(rootEl, config) {
      if (!rootEl) { console.warn('[Wordscend] No mount element provided.'); return; }
      this.root = rootEl;
      this.config = config;

      // Ensure theme is applied on mount too (app.js also pre-applies to avoid flash)
      Theme.apply(Theme.getPref());

      // Topbar (brand + actions) + HUD + Stage + Keyboard
      this.root.innerHTML = `
        <div class="ws-topbar">
          <div class="ws-topbar-inner">
            <div class="ws-brand" role="banner" aria-label="Wordscend">
              <span class="dot"></span> Wordscend
            </div>
            <div class="ws-actions">
              <button class="icon-btn" id="ws-info" type="button" title="How to play" aria-label="How to play">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M12 8.5h.01M11 11.5h1v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              </button>
              <button class="icon-btn" id="ws-settings" type="button" title="Settings" aria-label="Settings">
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="1.5"/><path d="M19 12a7 7 0 0 0-.09-1.09l2.02-1.57-2-3.46-2.43.98a7.03 7.03 0 0 0-1.88-1.09l-.31-2.6h-4l-.31-2.6c-.67.25-1.3.61-1.88 1.09l-2.43-.98-2 3.46 2.02 1.57c.06-.36.09-.72.09-1.09Z" stroke="currentColor" stroke-width="1.5"/></svg>
              </button>
            </div>
          </div>
        </div>

        <div class="ws-hud">
          <div class="ws-tag" id="ws-level">Level: -</div>
          <div class="ws-hud-right">
            <div class="ws-tag" id="ws-score">Score: 0</div>
            <div class="ws-tag" id="ws-streak" title="Daily play streak">🔥 Streak 0</div>
          </div>
        </div>

        <div class="ws-stage">
          <div class="ws-bubble" id="ws-bubble"></div>
          <div class="ws-grid" aria-label="Game grid"></div>
        </div>

        <div class="ws-kb" aria-label="On-screen keyboard"></div>
      `;

      // Cache refs
      this.levelEl = this.root.querySelector('#ws-level');
      this.scoreEl = this.root.querySelector('#ws-score');
      this.streakEl= this.root.querySelector('#ws-streak');
      this.stageEl = this.root.querySelector('.ws-stage');
      this.gridEl  = this.root.querySelector('.ws-grid');
      this.kbEl    = this.root.querySelector('.ws-kb');
      this.bubble  = this.root.querySelector('#ws-bubble');

      // Build grid + keyboard
      this.renderGrid();
      this.renderKeyboard();

      // Bind header actions
      this.bindHeader();

      // Bind physical keyboard ONCE per page
      this.bindKeyboard();

      // Re-bind on-screen keyboard EACH mount
      this._kbClickBound = false;
      this.bindKbClicks();

      console.log('[Wordscend] UI mounted:', config.rows, 'rows ×', config.cols);
    },

    setHUD(levelText, score, streak){
      if (this.levelEl)  this.levelEl.textContent  = levelText;
      if (this.scoreEl)  this.scoreEl.textContent  = `Score: ${score}`;
      if (this.streakEl) this.streakEl.textContent = `🔥 Streak ${streak ?? 0}`;
    },

    /* ---------- Header ---------- */
    bindHeader(){
      const info = this.root.querySelector('#ws-info');
      const settings = this.root.querySelector('#ws-settings');
      info.addEventListener('click', ()=> this.showRulesModal());
      settings.addEventListener('click', ()=> this.showSettingsModal());
    },

    /* ---------- Rendering ---------- */
    renderGrid() {
      const board  = global.WordscendEngine.getBoard();
      const marks  = global.WordscendEngine.getRowMarks();
      const cursor = global.WordscendEngine.getCursor();

      this.gridEl.innerHTML = '';

      for (let r = 0; r < board.length; r++) {
        const rowEl = document.createElement('div');
        rowEl.className = 'ws-row';
        const row = board[r];

        rowEl.style.gridTemplateColumns = `repeat(${row.length}, var(--tileSize))`;

        for (let c = 0; c < row.length; c++) {
          const tile = document.createElement('div');
          tile.className = 'ws-tile';
          const ch = row[c] || '';
          tile.textContent = ch;

          const mark = marks[r]?.[c];
          if (mark) tile.classList.add('state-' + mark);

          if (ch) tile.classList.add('filled');
          if (r === cursor.row && c === cursor.col && !global.WordscendEngine.isDone()) {
            tile.classList.add('active');
          }
          tile.dataset.row = r;
          tile.dataset.col = c;
          rowEl.appendChild(tile);
        }

        if (r < cursor.row) rowEl.classList.add('ws-locked');
        this.gridEl.appendChild(rowEl);
      }
    },

    renderKeyboard() {
      const status = global.WordscendEngine.getKeyStatus();
      this.kbEl.innerHTML = '';

      KB_ROWS.forEach(row => {
        const rowEl = document.createElement('div');
        rowEl.className = 'ws-kb-row';

        row.forEach(key => {
          const btn = document.createElement('button');
          btn.className = 'ws-kb-key';
          btn.type = 'button';
          btn.tabIndex = 0;

          if (key === 'Enter') {
            btn.classList.add('ws-kb-enter');
            btn.textContent = 'Enter';
            btn.dataset.key = 'Enter';
          } else if (key === 'Back') {
            btn.classList.add('ws-kb-back');
            btn.textContent = '⌫';
            btn.dataset.key = 'Backspace';
          } else {
            btn.textContent = key;
            btn.dataset.key = key;
          }

          const s = status[btn.dataset.key];
          if (s) btn.classList.add('k-' + s);

          rowEl.appendChild(btn);
        });

        this.kbEl.appendChild(rowEl);
      });
    },

    /* ---------- Input (physical keyboard) ---------- */
    bindKeyboard() {
      if (this._keyBound) return;
      this._keyBound = true;

      window.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;

        // Escape closes modals
        if (e.key === 'Escape') {
          document.querySelector('.ws-modal')?.remove();
          document.querySelector('.ws-endcard')?.remove();
          return;
        }

        this.handleInput(e.key);
      });
    },

    /* ---------- Input (on-screen keyboard) ---------- */
    bindKbClicks() {
      if (this._kbClickBound) return;
      this._kbClickBound = true;

      this.kbEl.addEventListener('pointerup', (e) => {
        const btn = e.target.closest('.ws-kb-key');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        this.handleInput(btn.dataset.key);
      }, { passive: false });
    },

    handleInput(key) {
      if (/^[A-Za-z]$/.test(key)) {
        if (global.WordscendEngine.addLetter(key)) this.renderGrid();
        return;
      }
      if (key === 'Backspace') {
        if (global.WordscendEngine.backspace()) this.renderGrid();
        return;
      }
      if (key === 'Enter') {
        const res = global.WordscendEngine.submitRow();
        if (!res.ok && res.reason === 'incomplete') {
          this.shakeCurrentRow();
          this.showBubble('Not enough letters');
          return;
        }
        if (!res.ok && res.reason === 'invalid') {
          this.shakeCurrentRow();
          this.showBubble('Not in word list');
          return;
        }

        // Flip animation on the submitted row
        this.flipRevealRow(res.attempt - 1, res.marks);

        // Update keyboard now; grid will re-render after flip
        this.renderKeyboard();

        if (res.done) {
          setTimeout(() => this.renderGrid(), 420 + (this.config.cols - 1) * 80);
        }
        return;
      }
    },

    /* ---------- Animations & Helpers ---------- */
    flipRevealRow(rowIndex, marks) {
      const rows = this.gridEl.querySelectorAll('.ws-row');
      const rowEl = rows[rowIndex];
      if (!rowEl) return;

      const tiles = Array.from(rowEl.querySelectorAll('.ws-tile'));
      tiles.forEach((tile, i) => {
        const delay = i * 80; // stagger
        tile.style.setProperty('--flip-delay', `${delay}ms`);
        tile.classList.add('flip');

        setTimeout(() => {
          const mark = marks[i];
          if (mark) {
            tile.classList.remove('state-correct','state-present','state-absent');
            tile.classList.add('state-' + mark);

            // Visual points & sound, then LIVE score increment on chip landing
            if (mark === 'correct') {
              this.floatPointsFromTile(tile, +2, 'green');
              AudioFX.ding();
            } else if (mark === 'present') {
              this.floatPointsFromTile(tile, +1, 'yellow');
            }
          }
        }, delay + 210);
      });

      setTimeout(() => this.renderGrid(), 420 + (tiles.length - 1) * 80);
    },

    shakeCurrentRow() {
      const cursor = global.WordscendEngine.getCursor();
      const rows = this.gridEl.querySelectorAll('.ws-row');
      const rowEl = rows[cursor.row];
      if (!rowEl) return;
      rowEl.classList.remove('shake'); void rowEl.offsetWidth;
      rowEl.classList.add('shake');
      setTimeout(() => rowEl.classList.remove('shake'), 400);
    },

    showBubble(msg) {
      if (!this.bubble) return;
      this.bubble.textContent = msg;
      this.bubble.classList.add('show');
      clearTimeout(this._bT);
      this._bT = setTimeout(() => this.bubble.classList.remove('show'), 1400);
    },

    /* Floating points chip */
    floatPointsFromTile(tileEl, delta, color='green'){
      try{
        const scoreEl = this.scoreEl;
        if (!tileEl || !scoreEl) return;

        const tRect = tileEl.getBoundingClientRect();
        const sRect = scoreEl.getBoundingClientRect();

        const chip = document.createElement('div');
        chip.className = `ws-fxfloat ${color==='green'?'green':'yellow'}`;
        chip.textContent = (delta > 0 ? `+${delta}` : `${delta}`);
        chip.style.left = `${tRect.left + tRect.width/2}px`;
        chip.style.top  = `${tRect.top  + tRect.height/2}px`;
        chip.style.transform = 'translate(-50%, -50%) scale(1)';
        document.body.appendChild(chip);

        requestAnimationFrame(()=>{
          const midX = (tRect.left + sRect.left)/2;
          const midY = Math.min(tRect.top, sRect.top) - 40;

          chip.style.transitionTimingFunction = 'cubic-bezier(.22,.82,.25,1)';
          chip.style.left = `${midX}px`;
          chip.style.top  = `${midY}px`;
          chip.style.transform = 'translate(-50%, -50%) scale(1.05)';

          setTimeout(()=>{
            chip.style.left = `${sRect.left + sRect.width/2}px`;
            chip.style.top  = `${sRect.top  + sRect.height/2}px`;
            chip.style.transform = 'translate(-50%, -50%) scale(0.8)';
            chip.style.opacity = '0.0';
          }, 160);
        });

        setTimeout(()=>{
          chip.remove();
          if (typeof window.WordscendApp_addScore === 'function') {
            window.WordscendApp_addScore(delta);
          }
          scoreEl.classList.remove('pulse'); void scoreEl.offsetWidth;
          scoreEl.classList.add('pulse');
          setTimeout(()=>scoreEl.classList.remove('pulse'), 260);
        }, 480);
      }catch{}
    },

    showEndCard(score, streakCurrent = 0, streakBest = 0) {
      const old = document.querySelector('.ws-endcard');
      if (old) old.remove();

      const wrap = document.createElement('div');
      wrap.className = 'ws-endcard';
      wrap.innerHTML = `
        <div class="card">
          <h3>Daily Wordscend Complete 🎉</h3>
          <p>Your total score: <strong>${score}</strong></p>
          <p>Streak: <strong>${streakCurrent}</strong> day(s) • Best: <strong>${streakBest}</strong></p>
          <div class="row">
            <button class="ws-btn primary" data-action="share">Share Score</button>
            <button class="ws-btn" data-action="copy">Copy Score</button>
            <button class="ws-btn" data-action="close">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(wrap);

      const shareText = `I just finished today's Wordscend (4→7 letters) with ${score} points! Streak: ${streakCurrent} (best ${streakBest}).`;
      wrap.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const act = btn.dataset.action;
        if (act === 'close') wrap.remove();
        if (act === 'copy') {
          try { await navigator.clipboard.writeText(shareText); btn.textContent = 'Copied!'; }
          catch { btn.textContent = 'Copy failed'; }
        }
        if (act === 'share') {
          if (navigator.share) {
            try { await navigator.share({ text: shareText }); } catch{}
          } else {
            try { await navigator.clipboard.writeText(shareText); btn.textContent = 'Copied!'; }
            catch { btn.textContent = 'Share not supported'; }
          }
        }
      }, { passive:true });
    },

    /* ---------- Modals ---------- */
    showRulesModal() {
      document.querySelector('.ws-modal')?.remove();
      const wrap = document.createElement('div');
      wrap.className = 'ws-modal';
      wrap.innerHTML = `
        <div class="card" role="dialog" aria-label="How to play Wordscend">
          <h3>How to Play 🧩</h3>
          <p>Climb through <strong>4 levels</strong> of daily word puzzles — from 4-letter to 7-letter words. You have <strong>6 tries</strong> per level.</p>
          <ul style="margin:6px 0 0 18px; color:var(--muted); line-height:1.5%;">
            <li>Type or tap to guess a word of the current length.</li>
            <li>Tiles turn <strong>green</strong> (correct spot) or <strong>yellow</strong> (in word, wrong spot).</li>
            <li>Beat a level to advance to the next length.</li>
            <li>Keep your <strong>🔥 streak</strong> by playing each day.</li>
          </ul>
          <div class="ws-mini-row" aria-hidden="true">
            <div class="ws-mini-tile correct">C</div>
            <div class="ws-mini-tile present">A</div>
            <div class="ws-mini-tile absent">T</div>
            <div class="ws-mini-tile absent">S</div>
            <div class="ws-mini-tile present">Y</div>
          </div>
          <div class="row">
            <button class="ws-btn primary" data-action="close">Got it</button>
          </div>
        </div>
      `;
      document.body.appendChild(wrap);
      wrap.addEventListener('click', (e)=>{
        if (e.target.dataset.action === 'close' || e.target === wrap) wrap.remove();
      }, { passive:true });
      window.addEventListener('keydown', (e)=>{ if (e.key==='Escape'){ wrap.remove(); }}, { once:true });
    },

    showSettingsModal() {
      document.querySelector('.ws-modal')?.remove();
      const wrap = document.createElement('div');
      wrap.className = 'ws-modal';

      const sound = localStorage.getItem('ws_sound') !== '0';
      const colorblind = localStorage.getItem('ws_colorblind') === '1';
      const themePref = (localStorage.getItem('ws_theme') || 'dark');

      wrap.innerHTML = `
        <div class="card" role="dialog" aria-label="Settings">
          <h3>Settings ⚙️</h3>
          <div class="ws-form">
            <div class="ws-field">
              <label for="ws-theme">Theme</label>
              <select id="ws-theme">
                <option value="dark"  ${themePref==='dark'?'selected':''}>Dark</option>
                <option value="light" ${themePref==='light'?'selected':''}>Light</option>
                <option value="auto"  ${themePref==='auto'?'selected':''}>Auto (system)</option>
              </select>
            </div>
            <div class="ws-field">
              <label for="ws-sound">Sound effects</label>
              <input id="ws-sound" type="checkbox" ${sound?'checked':''}/>
            </div>
            <div class="ws-field">
              <label for="ws-cb">Colorblind hints</label>
              <input id="ws-cb" type="checkbox" ${colorblind?'checked':''}/>
            </div>
          </div>
          <div class="row">
            <button class="ws-btn primary" data-action="save">Save</button>
            <button class="ws-btn" data-action="close">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(wrap);

      wrap.addEventListener('click', (e)=>{
        const btn = e.target.closest('button[data-action]');
        if (!btn) { if (e.target === wrap) wrap.remove(); return; }
        const act = btn.dataset.action;
        if (act === 'save'){
          const theme = wrap.querySelector('#ws-theme').value;
          const s = wrap.querySelector('#ws-sound').checked;
          const cb= wrap.querySelector('#ws-cb').checked;
          try {
            Theme.setPref(theme);
            Theme.apply(theme);
            localStorage.setItem('ws_sound', s ? '1':'0');
            localStorage.setItem('ws_colorblind', cb ? '1':'0');
          } catch {}
          btn.textContent='Saved';
          setTimeout(()=>wrap.remove(), 420);
        }
        if (act === 'close') wrap.remove();
      }, { passive:true });

      window.addEventListener('keydown', (e)=>{ if (e.key==='Escape'){ wrap.remove(); }}, { once:true });
    },
  };

  global.WordscendUI = UI;
})(window);
