// /ui/dom-view.js
(function (global) {
  const KB_ROWS = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['Enter','Z','X','C','V','B','N','M','Back']
  ];

  const UI = {
    mount(rootEl, config) {
      if (!rootEl) { console.warn('[Wordscend] No mount element provided.'); return; }
      this.root = rootEl;
      this.config = config;

      // Build structure
      this.root.innerHTML = `
        <div class="ws-hud">
          <div class="ws-tag" id="ws-level">Level: -</div>
          <div class="ws-tag" id="ws-score">Score: 0</div>
        </div>

        <div class="ws-stage">
          <div class="ws-bubble" id="ws-bubble"></div>
          <div class="ws-grid" aria-label="Game grid"></div>
        </div>

        <div class="ws-kb" aria-label="On-screen keyboard"></div>
      `;

      this.levelEl = this.root.querySelector('#ws-level');
      this.scoreEl = this.root.querySelector('#ws-score');
      this.stageEl = this.root.querySelector('.ws-stage');
      this.gridEl  = this.root.querySelector('.ws-grid');
      this.kbEl    = this.root.querySelector('.ws-kb');
      this.bubble  = this.root.querySelector('#ws-bubble');

      this.renderGrid();
      this.renderKeyboard();
      this.bindKeyboard();

      console.log('[Wordscend] UI mounted:', config.rows, 'rows ×', config.cols);
    },

    setHUD(levelText, score){
      if (this.levelEl) this.levelEl.textContent = levelText;
      if (this.scoreEl) this.scoreEl.textContent = `Score: ${score}`;
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

      // Click handling (one listener on the container)
      this.kbEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.ws-kb-key');
        if (!btn) return;
        this.handleInput(btn.dataset.key);
      }, { passive: true });
    },

    /* ---------- Input ---------- */
    bindKeyboard() {
      if (this._bound) return;
      this._bound = true;

      window.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
        this.handleInput(e.key);
      });
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
      rowEl.classList.remove('shake');
      void rowEl.offsetWidth;
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
    }
  };

  global.WordscendUI = UI;
})(window);
