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
    getPref: function () {
      return localStorage.getItem('ws_theme') || 'dark';
    },
    setPref: function (v) {
      try { localStorage.setItem('ws_theme', v); } catch(e) {}
    },
    systemIsDark: function () {
      this.media = this.media || window.matchMedia('(prefers-color-scheme: dark)');
      return this.media.matches;
    },
    apply: function (pref) {
      this.current = pref;
      var el = document.documentElement;
      if (pref === 'auto') {
        el.setAttribute('data-theme', this.systemIsDark() ? 'dark' : 'light');
        this.listenSystem();
      } else {
        el.setAttribute('data-theme', pref);
        this.unlistenSystem();
      }
    },
    listenSystem: function () {
      this.media = this.media || window.matchMedia('(prefers-color-scheme: dark)');
      if (!this._bound) {
        var self = this;
        this._bound = function (e) {
          if (self.current === 'auto') {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
          }
        };
        if (this.media.addEventListener) {
          this.media.addEventListener('change', this._bound);
        }
      }
    },
    unlistenSystem: function () {
      if (this.media && this._bound && this.media.removeEventListener) {
        this.media.removeEventListener('change', this._bound);
      }
      this._bound = null;
    }
  };

  /* ---------- Tiny sound ---------- */
  const AudioFX = {
    _ctx: null,
    _armed: false,
    _enabled: function () {
      return (localStorage.getItem('ws_sound') !== '0');
    },
    _ensure: function () {
      if (!this._ctx) {
        try { this._ctx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e) {}
      }
      return this._ctx;
    },
    _resumeIfNeeded: function () {
      var ctx = this._ctx;
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(function () {});
      }
    },
    armAutoResumeOnce: function () {
      if (this._armed) return;
      this._armed = true;
      var self = this;
      function resume() {
        if (self._ctx) self._resumeIfNeeded();
      }
      window.addEventListener('pointerdown', resume, { passive: true });
      window.addEventListener('keydown', resume);
    },
    ding: function () {
      if (!this._enabled()) return;
      var ctx = this._ensure();
      if (!ctx) return;
      this._resumeIfNeeded();
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(ctx.destination);
      var now = ctx.currentTime;
      o.start(now);
      g.gain.setValueAtTime(0.10, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      o.stop(now + 0.2);
    },
    chime: function () {
      if (!this._enabled()) return;
      var ctx = this._ensure();
      if (!ctx) return;
      this._resumeIfNeeded();
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = 660;
      g.gain.value = 0.06;
      o.connect(g);
      g.connect(ctx.destination);
      var t = ctx.currentTime;
      o.start(t);
      g.gain.setValueAtTime(0.07, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.stop(t + 0.28);
    }
  };
  AudioFX.armAutoResumeOnce();

  const UI = {
    root: null,
    config: null,
    levelEl: null,
    scoreEl: null,
    hintsEl: null,
    streakEl: null,
    stageEl: null,
    gridEl: null,
    kbEl: null,
    bubble: null,
    helperBeeEl: null,
    helperBubbleEl: null,
    helperTextEl: null,
    _keyBound: false,
    _kbClickBound: false,
    _bT: null,
    _answerMeta: null,
    onHintCheck: null,
    onHintConsume: null,

    mount: function (rootEl, config) {
      if (!rootEl) return;
      this.root = rootEl;
      this.config = config || { rows: 6, cols: 5 };

      var colCount = Number(this.config && this.config.cols) || 5;
      try {
        document.documentElement.style.setProperty('--ws-cols', colCount);
      } catch (e) {}
      try {
        this.root.style.setProperty('--ws-cols', colCount);
      } catch (e2) {}

      Theme.apply(Theme.getPref());

      if (!document.querySelector('.ws-page-bg')) {
        var bg = document.createElement('div');
        bg.className = 'ws-page-bg';
        document.body.appendChild(bg);
      }

      this.root.innerHTML = ''
        + '<div class="ws-topbar">'
        + '  <div class="ws-topbar-inner">'
        + '    <div class="ws-brand" role="banner" aria-label="WordHive">'
        + '      <span class="ws-brand-block ws-brand-block-w">W</span>'
        + '      <span class="ws-brand-text">ord</span>'
        + '      <span class="ws-brand-block ws-brand-block-h">H</span>'
        + '      <span class="ws-brand-text">ive</span>'
        + '    </div>'
        + '    <div class="ws-actions">'
        + '      <button class="icon-btn" id="ws-info" type="button" title="How to play" aria-label="How to play">'
        + '        <svg viewBox="0 0 24 24" fill="none">'
        + '          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"></circle>'
        + '          <path d="M12 8.5h.01M11 11.5h1v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>'
        + '        </svg>'
        + '      </button>'
        + '      <button class="icon-btn" id="ws-settings" type="button" title="Settings" aria-label="Settings">'
        + '        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">'
        + '          <path'
        + '            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.89 3.31.876 2.42 2.42a1.724 1.724 0 0 0 1.065 2.572c1.757.426 1.757 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.89 1.543-.876 3.31-2.42 2.42a1.724 1.724 0 0 0-2.572 1.065c-.426 1.757-2.924 1.757-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.89-3.31-.876-2.42-2.42a1.724 1.724 0 0 0-1.065-2.572c-1.757-.426-1.757-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.89-1.543.876-3.31 2.42-2.42c.996.574 2.273.097 2.573-1.065Z"'
        + '            stroke="currentColor"'
        + '            stroke-width="1.5"'
        + '            stroke-linecap="round"'
        + '            stroke-linejoin="round"'
        + '          ></path>'
        + '          <path'
        + '            d="M15 12a3 3 0 1 1-6 0a3 3 0 0 1 6 0Z"'
        + '            stroke="currentColor"'
        + '            stroke-width="1.5"'
        + '            stroke-linecap="round"'
        + '            stroke-linejoin="round"'
        + '          ></path>'
        + '        </svg>'
        + '      </button>'
        + '    </div>'
        + '  </div>'
        + '</div>'

        + '<div class="ws-hud">'
        + '  <div class="ws-tag" id="ws-level">Level: -</div>'
        + '  <div class="ws-hud-right">'
        + '    <div class="ws-tag" id="ws-score">Score: 0</div>'
        + '    <div class="ws-tag" id="ws-hints" title="Hint bank">💡 Hints 0</div>'
        + '    <div class="ws-tag" id="ws-streak" title="Daily play streak">🔥 Streak 0</div>'
        + '  </div>'
        + '</div>'

        + '<div class="ws-stage">'
        + '  <div class="ws-bubble" id="ws-bubble"></div>'
        + '  <div class="ws-grid" aria-label="Game grid"></div>'
        + '  <div class="ws-helper" id="ws-helper">'
        + '    <button class="ws-helper-bee" id="ws-helper-bee" type="button" aria-label="Use a hint">🐝</button>'
        + '    <div class="ws-helper-bubble" id="ws-helper-bubble">'
        + '      <strong>Hint Bee</strong>'
        + '      <span class="ws-helper-text" id="ws-helper-text">No hints available yet. Keep your streak going to earn hints.</span>'
        + '    </div>'
        + '  </div>'
        + '</div>'

        + '<div class="ws-kb" aria-label="On-screen keyboard"></div>';

      // Cache refs
      this.levelEl = this.root.querySelector('#ws-level');
      this.scoreEl = this.root.querySelector('#ws-score');
      this.hintsEl = this.root.querySelector('#ws-hints');
      this.streakEl = this.root.querySelector('#ws-streak');
      this.stageEl = this.root.querySelector('.ws-stage');
      this.gridEl = this.root.querySelector('.ws-grid');
      this.kbEl = this.root.querySelector('.ws-kb');
      this.bubble = this.root.querySelector('#ws-bubble');

      this.helperBeeEl = this.root.querySelector('#ws-helper-bee');
      this.helperBubbleEl = this.root.querySelector('#ws-helper-bubble');
      this.helperTextEl = this.root.querySelector('#ws-helper-text');

      this.bindHudTips();
      this.bindHeader();
      this.bindKeyboard();
      this.bindKbClicks();
      this.bindHelper();

      this.renderGrid();
      this.renderKeyboard();
    },

    setHUD: function (levelText, score, streak, hintsAvail) {
      if (this.levelEl) this.levelEl.textContent = levelText;
      if (this.scoreEl) this.scoreEl.textContent = 'Score: ' + score;
      var h = (typeof hintsAvail === 'number') ? hintsAvail : 0;
      if (this.hintsEl) this.hintsEl.textContent = '💡 Hints ' + h;
      if (this.streakEl) this.streakEl.textContent = '🔥 Streak ' + (streak || 0);

      // Update Bee helper text + state
      if (this.helperTextEl) {
        if (h > 0) {
          this.helperTextEl.textContent =
            'You have ' + h + ' hint' + (h > 1 ? 's' : '') + '. Click the bee to use one.';
        } else {
          this.helperTextEl.textContent =
            'No hints available yet. Keep your streak going to earn hints.';
        }
      }
      if (this.helperBeeEl) {
        if (h > 0) {
          this.helperBeeEl.classList.remove('ws-helper-disabled');
        } else {
          this.helperBeeEl.classList.add('ws-helper-disabled');
        }
      }
    },

    bindHudTips: function () {
      var self = this;
      if (this.streakEl) {
        this.streakEl.addEventListener('click', function () {
          var msg = 'Keep your streak by playing every day. You can also earn a freeze at day 7 of a month (auto-used on a 1-day gap).';
          self.showAnchoredTip(self.streakEl, 'Streak info', msg);
        }, { passive: true });
      }

      if (this.hintsEl) {
        this.hintsEl.addEventListener('click', function () {
          var msg = 'Earn 1 hint every 5-day streak milestone. Hints are banked, but you can use at most 1 per level each day.';
          self.showAnchoredTip(self.hintsEl, 'Hint bank', msg);
        }, { passive: true });
      }
    },

    bindHeader: function () {
      var self = this;
      var info = this.root.querySelector('#ws-info');
      var settings = this.root.querySelector('#ws-settings');
      if (info) {
        info.addEventListener('click', function () {
          self.showRulesModal();
        }, { passive: true });
      }
      if (settings) {
        settings.addEventListener('click', function () {
          self.showSettingsModal();
        }, { passive: true });
      }
    },

    bindHelper: function () {
      var self = this;
      if (!this.helperBeeEl) return;
      this.helperBeeEl.addEventListener('click', function () {
        self.requestHintFlow();
      });
    },

    renderGrid: function () {
      var board = global.WordscendEngine.getBoard();
      var marks = global.WordscendEngine.getRowMarks();
      var cursor = global.WordscendEngine.getCursor();

      this.gridEl.innerHTML = '';

      for (var r = 0; r < board.length; r++) {
        var rowEl = document.createElement('div');
        rowEl.className = 'ws-row';
        var row = board[r];

        rowEl.style.gridTemplateColumns = 'repeat(' + row.length + ', var(--tileSize))';

        for (var c = 0; c < row.length; c++) {
          var tile = document.createElement('div');
          tile.className = 'ws-tile';
          var ch = row[c] || '';
          tile.textContent = ch;

          var mark = marks[r] && marks[r][c];
          if (mark) tile.classList.add('state-' + mark);

          if (ch) tile.classList.add('filled');
          if (r === cursor.row && c === cursor.col && !global.WordscendEngine.isDone()) {
            tile.classList.add('active');
          }
          tile.dataset.row = String(r);
          tile.dataset.col = String(c);
          rowEl.appendChild(tile);
        }

        if (r < cursor.row) rowEl.classList.add('ws-locked');
        this.gridEl.appendChild(rowEl);
      }
    },

    renderKeyboard: function () {
      var status = global.WordscendEngine.getKeyStatus();
      this.kbEl.innerHTML = '';

      var isMobile = (window.matchMedia && window.matchMedia('(max-width: 430px)').matches);

      for (var i = 0; i < KB_ROWS.length; i++) {
        var row = KB_ROWS[i];
        var rowEl = document.createElement('div');
        rowEl.className = 'ws-kb-row';

        for (var j = 0; j < row.length; j++) {
          var key = row[j];
          var btn = document.createElement('button');
          btn.className = 'ws-kb-key';
          btn.type = 'button';
          btn.tabIndex = 0;

          if (key === 'Enter') {
            btn.classList.add('ws-kb-enter');
            btn.dataset.key = 'Enter';
            if (isMobile) {
              btn.textContent = '⏎';
              btn.setAttribute('aria-label', 'Enter');
              btn.title = 'Enter';
            } else {
              btn.textContent = 'Enter';
            }
          } else if (key === 'Back') {
            btn.classList.add('ws-kb-back');
            btn.textContent = '⌫';
            btn.dataset.key = 'Backspace';
          } else {
            btn.textContent = key;
            btn.dataset.key = key;
          }

          var s = status[btn.dataset.key];
          if (s) btn.classList.add('k-' + s);

          rowEl.appendChild(btn);
        }

        this.kbEl.appendChild(rowEl);
      }
    },

    bindKeyboard: function () {
      if (this._keyBound) return;
      this._keyBound = true;
      var self = this;

      window.addEventListener('keydown', function (e) {
        var tag = (e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;

        if (e.key === 'Escape') {
          var m = document.querySelector('.ws-modal');
          if (m) m.remove();
          var ec = document.querySelector('.ws-endcard');
          if (ec) ec.remove();
          var st = document.querySelector('.ws-streak-toast');
          if (st) st.remove();
          var tip = document.querySelector('.ws-streak-tip');
          if (tip) tip.remove();
          return;
        }

        self.handleInput(e.key);
      });
    },

    bindKbClicks: function () {
      if (this._kbClickBound || !this.kbEl) return;
      this._kbClickBound = true;
      var self = this;

      this.kbEl.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('.ws-kb-key');
        if (!btn) return;
        e.preventDefault();
        self.handleInput(btn.dataset.key);
      });
    },

    handleInput: function (key) {
      if (/^[A-Za-z]$/.test(key)) {
        if (global.WordscendEngine.addLetter(key)) {
          this.renderGrid();
          if (global.WordscendApp_onStateChange) {
            global.WordscendApp_onStateChange({ type: 'letter' });
          }
        }
        return;
      }
      if (key === 'Backspace') {
        if (global.WordscendEngine.backspace()) {
          this.renderGrid();
          if (global.WordscendApp_onStateChange) {
            global.WordscendApp_onStateChange({ type: 'backspace' });
          }
        }
        return;
      }
      if (key === 'Enter') {
        var cur = global.WordscendEngine.getCursor();
        if (cur.col === 0) {
          this.showBubble('Type a word first');
          return;
        }

        var res = global.WordscendEngine.submitRow();
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

        this.flipRevealRow(res.attempt - 1, res.marks);
        this.renderKeyboard();

        if (res.done) {
          var delay = 420 + (this.config.cols - 1) * 80;
          var self = this;
          setTimeout(function () { self.renderGrid(); }, delay);
        }
        if (res.ok && global.WordscendApp_onStateChange) {
          global.WordscendApp_onStateChange({ type: 'submit', result: res });
        }
      }
    },

    /* ---------- Hint UX ---------- */
    setAnswerMeta: function (answer, meta) {
      this._answerMeta = { answer: answer, meta: meta };
    },

    requestHintFlow: function () {
      var canUse = false;
      if (typeof this.onHintCheck === 'function') {
        canUse = !!this.onHintCheck();
      }
      if (!canUse) {
        this.showBubble('No hint available for this level');
        return;
      }
      var self = this;
      this.showConfirm(
        'Reveal a hint?',
        'You will lose 10 points to reveal a hint. Continue?',
        function (ok) {
          if (!ok) return;
          try {
            if (typeof self.onHintConsume === 'function') self.onHintConsume();
          } catch (e) {}
          var meta = (self._answerMeta && self._answerMeta.meta) || {};
          var hintText = meta && meta.hint ? String(meta.hint) : 'No hint available for this word.';
          self.showHintToast(hintText);
        }
      );
    },

    showHintToast: function (text) {
      var old = document.querySelector('.ws-streak-toast');
      if (old) old.remove();

      var t = document.createElement('div');
      t.className = 'ws-streak-toast show';
      t.innerHTML = '<strong>Hint</strong><span class="sub">' + text + '</span>';

      var row = document.createElement('div');
      row.style.marginTop = '8px';
      row.className = 'row';

      var close = document.createElement('button');
      close.className = 'ws-btn';
      close.textContent = 'Close';
      close.addEventListener('click', function () {
        t.remove();
      }, { passive: true });

      row.appendChild(close);
      t.appendChild(row);
      document.body.appendChild(t);
    },

    showConfirm: function (title, message, cb) {
      var existing = document.querySelector('.ws-modal');
      if (existing) existing.remove();
      var wrap = document.createElement('div');
      wrap.className = 'ws-modal';
      wrap.innerHTML =
        '<div class="card" role="dialog" aria-label="' + title + '">'
        + '<h3>' + title + '</h3>'
        + '<p>' + message + '</p>'
        + '<div class="row">'
        + '  <button class="ws-btn primary" data-action="ok">Yes</button>'
        + '  <button class="ws-btn" data-action="cancel">Cancel</button>'
        + '</div>'
        + '</div>';
      document.body.appendChild(wrap);

      function handler(e) {
        var btn = e.target && e.target.closest && e.target.closest('button[data-action]');
        if (!btn) {
          if (e.target === wrap) {
            if (cb) cb(false);
            wrap.remove();
          }
          return;
        }
        var act = btn.dataset.action;
        if (act === 'ok') {
          if (cb) cb(true);
          wrap.remove();
        } else if (act === 'cancel') {
          if (cb) cb(false);
          wrap.remove();
        }
      }
      wrap.addEventListener('click', handler, { passive: true });

      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          if (cb) cb(false);
          wrap.remove();
        }
      }, { once: true });
    },

    showAnchoredTip: function (anchorEl, title, text) {
      var old = document.querySelector('.ws-streak-tip');
      if (old) old.remove();
      if (!anchorEl) return;
      var r = anchorEl.getBoundingClientRect();
      var tip = document.createElement('div');
      tip.className = 'ws-streak-tip';
      tip.innerHTML =
        '<strong>' + title + '</strong>'
        + '<div class="sub" style="margin-top:6px;">' + text + '</div>';
      tip.style.position = 'fixed';
      tip.style.left = r.left + 'px';
      tip.style.top = (r.bottom + 8) + 'px';
      document.body.appendChild(tip);
      requestAnimationFrame(function () {
        tip.classList.add('show');
      });
      function close() {
        tip.remove();
        window.removeEventListener('click', away, true);
      }
      function away(e) {
        if (!tip.contains(e.target)) close();
      }
      window.addEventListener('click', away, true);
    },

    flipRevealRow: function (rowIndex, marks) {
      var rows = this.gridEl.querySelectorAll('.ws-row');
      var rowEl = rows[rowIndex];
      if (!rowEl) return;

      var tiles = Array.prototype.slice.call(rowEl.querySelectorAll('.ws-tile'));
      var self = this;
      tiles.forEach(function (tile, i) {
        var delay = i * 80;
        tile.style.setProperty('--flip-delay', delay + 'ms');
        tile.classList.add('flip');

        setTimeout(function () {
          var mark = marks[i];
          if (mark) {
            tile.classList.remove('state-correct', 'state-present', 'state-absent');
            tile.classList.add('state-' + mark);
            if (mark === 'correct') {
              self.floatPointsFromTile(tile, +2, 'green');
              AudioFX.ding();
            } else if (mark === 'present') {
              self.floatPointsFromTile(tile, +1, 'yellow');
            }
          }
        }, delay + 210);
      });

      setTimeout(function () { self.renderGrid(); }, 420 + (tiles.length - 1) * 80);
    },

    shakeCurrentRow: function () {
      var cursor = global.WordscendEngine.getCursor();
      var rows = this.gridEl.querySelectorAll('.ws-row');
      var rowEl = rows[cursor.row];
      if (!rowEl) return;
      rowEl.classList.remove('shake');
      void rowEl.offsetWidth;
      rowEl.classList.add('shake');
      setTimeout(function () {
        rowEl.classList.remove('shake');
      }, 400);
    },

    showBubble: function (msg) {
      if (!this.bubble) return;
      this.bubble.textContent = msg;
      this.bubble.classList.add('show');
      var self = this;
      clearTimeout(this._bT);
      this._bT = setTimeout(function () {
        self.bubble.classList.remove('show');
      }, 1400);
    },

    floatPointsFromTile: function (tileEl, delta, color) {
      color = color || 'green';
      try {
        var scoreEl = this.scoreEl;
        if (!tileEl || !scoreEl) return;

        var tRect = tileEl.getBoundingClientRect();
        var sRect = scoreEl.getBoundingClientRect();

        var chip = document.createElement('div');
        chip.className = 'ws-fxfloat ' + (color === 'green' ? 'green' : 'yellow');
        chip.textContent = (delta > 0 ? '+' + delta : String(delta));
        chip.style.left = (tRect.left + tRect.width / 2) + 'px';
        chip.style.top = (tRect.top + tRect.height / 2) + 'px';
        chip.style.transform = 'translate(-50%, -50%) scale(1)';
        document.body.appendChild(chip);

        requestAnimationFrame(function () {
          var midX = (tRect.left + sRect.left) / 2;
          var midY = Math.min(tRect.top, sRect.top) - 40;
          chip.style.transitionTimingFunction = 'cubic-bezier(.22,.82,.25,1)';
          chip.style.left = midX + 'px';
          chip.style.top = midY + 'px';
          chip.style.transform = 'translate(-50%, -50%) scale(1.05)';

          setTimeout(function () {
            chip.style.left = (sRect.left + sRect.width / 2) + 'px';
            chip.style.top = (sRect.top + sRect.height / 2) + 'px';
            chip.style.transform = 'translate(-50%, -50%) scale(0.8)';
            chip.style.opacity = '0.0';
          }, 160);
        });

        setTimeout(function () {
          chip.remove();
          if (typeof window.WordscendApp_addScore === 'function') {
            window.WordscendApp_addScore(delta);
          }
          scoreEl.classList.remove('pulse');
          void scoreEl.offsetWidth;
          scoreEl.classList.add('pulse');
          setTimeout(function () {
            scoreEl.classList.remove('pulse');
          }, 260);
        }, 480);
      } catch (e) {}
    },

    showEndCard: function (score, streakCurrent, streakBest, extraMeta) {
      streakCurrent = streakCurrent || 0;
      streakBest = streakBest || 0;
      extraMeta = extraMeta || {};

      var old = document.querySelector('.ws-endcard');
      if (old) old.remove();

      var wrap = document.createElement('div');
      wrap.className = 'ws-endcard';

      var answer = extraMeta.answer || null;
      var def = extraMeta.meta && extraMeta.meta.def ? extraMeta.meta.def : null;

      var defHtml = '';
      if (answer) {
        var safeAns = String(answer).toUpperCase();
        if (def) {
          defHtml =
            '<div class="ws-answer-def">'
            + '<div class="ws-answer-word">' + safeAns + '</div>'
            + '<div class="ws-answer-def-text">' + def + '</div>'
            + '</div>';
        } else {
          defHtml =
            '<div class="ws-answer-def">'
            + '<div class="ws-answer-word">' + safeAns + '</div>'
            + '</div>';
        }
      }

      wrap.innerHTML =
        '<div class="card">'
        + '<h3>Daily WordHive Complete 🎉</h3>'
        + '<p>Your total score: <strong>' + score + '</strong></p>'
        + '<p>Streak: <strong>' + streakCurrent + '</strong> day(s) • Best: <strong>' + streakBest + '</strong></p>'
        + defHtml
        + '<div class="row">'
        + '  <button class="ws-btn primary" data-action="share">Share Score</button>'
        + '  <button class="ws-btn" data-action="copy">Copy Score</button>'
        + '  <button class="ws-btn" data-action="close">Close</button>'
        + '</div>'
        + '</div>';
      document.body.appendChild(wrap);

      var shareText = 'I just finished today\'s WordHive (4→7 letters) with '
        + score + ' points! Streak: ' + streakCurrent + ' (best ' + streakBest + ').';

      wrap.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('button[data-action]');
        if (!btn) return;
        var act = btn.dataset.action;
        if (act === 'close') {
          wrap.remove();
        } else if (act === 'copy') {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareText).then(function () {
              btn.textContent = 'Copied!';
            }).catch(function () {
              btn.textContent = 'Copy failed';
            });
          } else {
            btn.textContent = 'Copy not supported';
          }
        } else if (act === 'share') {
          if (navigator.share) {
            navigator.share({ text: shareText }).catch(function () {});
          } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareText).then(function () {
              btn.textContent = 'Copied!';
            }).catch(function () {
              btn.textContent = 'Share not supported';
            });
          } else {
            btn.textContent = 'Share not supported';
          }
        }
      }, { passive: true });

      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          wrap.remove();
        }
      }, { once: true });
    },

    showRulesModal: function () {
      var existing = document.querySelector('.ws-modal');
      if (existing) existing.remove();
      var wrap = document.createElement('div');
      wrap.className = 'ws-modal';

      var exampleRowHTML =
        '<div class="ws-row" style="display:grid;grid-template-columns:repeat(5,var(--tileSize));gap:8px;margin-top:8px;">'
        + '<div class="ws-tile filled state-correct">P</div>'
        + '<div class="ws-tile filled state-present">L</div>'
        + '<div class="ws-tile filled state-absent">A</div>'
        + '<div class="ws-tile filled state-absent">N</div>'
        + '<div class="ws-tile filled state-present">T</div>'
        + '</div>';

      wrap.innerHTML =
        '<div class="card" role="dialog" aria-label="How to play WordHive">'
        + '<h3>How to Play 🧩</h3>'
        + '<p>Climb through <strong>4 levels</strong> of daily WordHive puzzles — from 4-letter to 7-letter words. You have <strong>6 tries</strong> per level.</p>'
        + '<ul style="margin:6px 0 0 18px; color:var(--muted); line-height:1.5;">'
        + '  <li>Type or tap to guess a word of the current length.</li>'
        + '  <li>Tiles turn <strong>green</strong> (correct spot) or <strong>yellow</strong> (in word, wrong spot).</li>'
        + '  <li>Beat a level to advance to the next length.</li>'
        + '  <li>Keep your <strong>🔥 streak</strong> by playing each day.</li>'
        + '</ul>'
        + exampleRowHTML
        + '<div class="row" style="margin-top:10px;">'
        + '  <button class="ws-btn primary" data-action="close">Got it</button>'
        + '</div>'
        + '</div>';

      document.body.appendChild(wrap);
      wrap.addEventListener('click', function (e) {
        if (e.target.dataset && e.target.dataset.action === 'close') wrap.remove();
        if (e.target === wrap) wrap.remove();
      }, { passive: true });

      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') wrap.remove();
      }, { once: true });
    },

    showSettingsModal: function () {
      var existing = document.querySelector('.ws-modal');
      if (existing) existing.remove();
      var wrap = document.createElement('div');
      wrap.className = 'ws-modal';

      var sound = localStorage.getItem('ws_sound') !== '0';
      var themePref = localStorage.getItem('ws_theme') || 'dark';

      wrap.innerHTML =
        '<div class="card" role="dialog" aria-label="Settings">'
        + '<h3>Settings ⚙️</h3>'
        + '<div class="ws-form">'
        + '  <div class="ws-field">'
        + '    <label for="ws-theme">Theme</label>'
        + '    <select id="ws-theme">'
        + '      <option value="dark"' + (themePref === 'dark' ? ' selected' : '') + '>Dark</option>'
        + '      <option value="light"' + (themePref === 'light' ? ' selected' : '') + '>Light</option>'
        + '      <option value="auto"' + (themePref === 'auto' ? ' selected' : '') + '>Auto (system)</option>'
        + '    </select>'
        + '  </div>'
        + '  <div class="ws-field">'
        + '    <label for="ws-sound">Sound effects</label>'
        + '    <input id="ws-sound" type="checkbox"' + (sound ? ' checked' : '') + '/>'
        + '  </div>'
        + '</div>'
        + '<div class="row">'
        + '  <button class="ws-btn primary" data-action="save">Save</button>'
        + '  <button class="ws-btn" data-action="close">Close</button>'
        + '</div>'
        + '</div>';

      document.body.appendChild(wrap);

      wrap.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('button[data-action]');
        if (!btn) {
          if (e.target === wrap) wrap.remove();
          return;
        }
        var act = btn.dataset.action;
        if (act === 'save') {
          var theme = wrap.querySelector('#ws-theme').value;
          var s = wrap.querySelector('#ws-sound').checked;
          try {
            Theme.setPref(theme);
            Theme.apply(theme);
            localStorage.setItem('ws_sound', s ? '1' : '0');
          } catch (err) {}
          btn.textContent = 'Saved';
          setTimeout(function () { wrap.remove(); }, 420);
        } else if (act === 'close') {
          wrap.remove();
        }
      }, { passive: true });

      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') wrap.remove();
      }, { once: true });
    }
  };

  global.WordscendUI = UI;
})(window);
