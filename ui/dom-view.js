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

      // containers
      this.root.innerHTML = `
        <div class="ws-grid" aria-label="Game grid"></div>
        <div class="ws-kb" aria-label="On-screen keyboard"></div>
        <div class="ws-msg" role="status" aria-live="polite"></div>
      `;

      this.gridEl = this.root.querySelector('.ws-grid');
      this.kbEl = this.root.querySelector('.ws-kb');
      this.msgEl = this.root.querySelector('.ws-msg');

      this.renderGrid();
      this.renderKeyboard();
      this.bindKeyboard();

      console.log('[Wordscend] Grid rendered:', config.rows, 'rows ×', config.cols);
    },

    // ----- Rendering -----
    renderGrid() {
      const board = global.WordscendEngine.getBoard();
      const marks = global.WordscendEngine.getRowMarks();
      const cursor = global.WordscendEngine.getCursor();

      // Build grid fresh
      this.gridEl.innerHTML = '';
      for (let r = 0; r < board.length; r++) {
        const rowEl = document.createElement('div');
        rowEl.className = 'ws-row';
        const row = board[r];

        for (let c = 0; c < row.length; c++) {
          const tile = document.createElement('div');
          tile.className = 'ws-tile';
          const ch = row[c] || '';
          tile.textContent = ch;

          // state coloring (after submit)
          const mark = marks[r]?.[c];
          if (mark) tile.classList.add('state-' + mark);

          if (ch) tile.classList.add('filled');
          if (r === cursor.row && c === cursor.col && !global.WordscendEngine.isDone()) {
            tile.classList.add('active');
          }

          tile.setAttribute('data-row', r);
          tile.setAttribute('data-col', c);
          rowEl.appendChild(tile);
        }

        // lock prior rows
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
          btn.setAttribute('type', 'button');

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

          // color state from engine
          const s = status[btn.dataset.key];
          if (s) btn.classList.add('k-' + s);

          rowEl.appendChild(btn);
        });

        this.kbEl.appendChild(rowEl);
      });

      // click handling
      this.kbEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.ws-kb-key');
        if (!btn) return;
        this.handleInput(btn.dataset.key);
      }, { passive: true });
    },

    // ----- Input handling -----
    bindKeyboard() {
      if (this._bound) return;
      this._bound = true;

      window.addEventListener('keydown', (e) => {
        // ignore if an input/textarea is focused
        const tag = (e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
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
          this.toast('Not enough letters');
          return;
        }
        // re-render grid & keyboard with new marks/states
        this.renderGrid();
        this.renderKeyboard();

        if (res.done) {
          if (res.win) this.toast('Nice! You got it.');
          else this.toast('Out of tries. Answer soon…'); // later we’ll reveal answer
        }
        return;
      }
    },

    // ----- UI affordances -----
    shakeCurrentRow() {
      const cursor = global.WordscendEngine.getCursor();
      const rows = this.gridEl.querySelectorAll('.ws-row');
      const rowEl = rows[cursor.row];
      if (!rowEl) return;
      rowEl.classList.remove('shake');
      void rowEl.offsetWidth; // restart animation
      rowEl.classList.add('shake');
      setTimeout(() => rowEl.classList.remove('shake'), 400);
    },

    toast(msg) {
      if (!this.msgEl) return;
      this.msgEl.textContent = msg;
      this.msgEl.classList.add('show');
      clearTimeout(this._msgT);
      this._msgT = setTimeout(() => this.msgEl.classList.remove('show'), 1400);
    }
  };

  global.WordscendUI = UI;
})(window);
