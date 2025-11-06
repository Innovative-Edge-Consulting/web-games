// /core/engine.js
(function (global) {
  function createEmptyBoard(rows, cols) {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
  }

  function evaluateGuess(guess, answer) {
    const res = Array(guess.length).fill('absent');
    const a = answer.split('');
    const g = guess.split('');
    const counts = {};
    for (const ch of a) counts[ch] = (counts[ch] || 0) + 1;

    // correct
    for (let i = 0; i < g.length; i++) {
      if (g[i] === a[i]) {
        res[i] = 'correct';
        counts[g[i]] -= 1;
      }
    }
    // present
    for (let i = 0; i < g.length; i++) {
      if (res[i] === 'correct') continue;
      const ch = g[i];
      if (counts[ch] > 0) {
        res[i] = 'present';
        counts[ch] -= 1;
      }
    }
    return res;
  }

  const KEY_RANK = { absent: 0, present: 1, correct: 2 };

  const Engine = {
    rows: 6,
    cols: 5,
    allowed: null,     // Set by dictionary loader
    answer: 'CRANE',   // Will be overwritten by dictionary picker

    init(cfg) {
      if (cfg && cfg.cols) this.cols = cfg.cols;
      if (cfg && cfg.rows) this.rows = cfg.rows;

      this.board = createEmptyBoard(this.rows, this.cols);
      this.currentRow = 0;
      this.currentCol = 0;

      this.rowMarks = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
      this.keyStatus = {}; // { A: 'absent'|'present'|'correct' }
      this.done = false;
      this.win = false;

      return this.getConfig();
    },

    setAllowed(list){ this.allowed = Array.isArray(list) ? list : null; },
    setAnswer(word){ if (word && word.length === this.cols) this.answer = word.toUpperCase(); },

    getConfig(){ return { rows:this.rows, cols:this.cols }; },
    getBoard(){ return this.board; },
    getCursor(){ return { row:this.currentRow, col:this.currentCol }; },
    getRowMarks(){ return this.rowMarks; },
    getKeyStatus(){ return this.keyStatus; },
    isDone(){ return this.done; },
    didWin(){ return this.win; },

    canType(){ return !this.done && this.currentRow < this.rows; },

    addLetter(ch){
      if (!this.canType()) return false;
      if (this.currentCol >= this.cols) return false;
      if (!/^[A-Za-z]$/.test(ch)) return false;
      this.board[this.currentRow][this.currentCol] = ch.toUpperCase();
      this.currentCol += 1;
      return true;
    },

    backspace(){
      if (!this.canType()) return false;
      if (this.currentCol === 0) return false;
      this.currentCol -= 1;
      this.board[this.currentRow][this.currentCol] = '';
      return true;
    },

    rowComplete(){
      return this.board[this.currentRow].every((c) => c && c.length === 1);
    },

    isAllowedWord(word){
      if (!this.allowed) return true; // if not loaded yet, allow (dev fallback)
      return this.allowed.includes(word.toUpperCase());
    },

    submitRow(){
      if (this.done) return { ok:false, reason:'done' };
      if (!this.rowComplete()) return { ok:false, reason:'incomplete' };

      const guess = this.board[this.currentRow].join('').toUpperCase();

      // validate against dictionary
      if (!this.isAllowedWord(guess)) {
        return { ok:false, reason:'invalid' };
      }

      const marks = evaluateGuess(guess, this.answer);
      this.rowMarks[this.currentRow] = marks.slice();

      // keyboard precedence
      for (let i = 0; i < guess.length; i++) {
        const ch = guess[i];
        const m = marks[i];
        const prev = this.keyStatus[ch] ?? 'absent';
        if (KEY_RANK[m] > KEY_RANK[prev]) this.keyStatus[ch] = m;
        else if (!(ch in this.keyStatus)) this.keyStatus[ch] = m;
      }

      if (guess === this.answer) {
        this.done = true; this.win = true;
        return { ok:true, guess, marks, win:true, done:true };
      }

      this.currentRow += 1;
      this.currentCol = 0;

      if (this.currentRow >= this.rows) {
        this.done = true; this.win = false;
        return { ok:true, guess, marks, win:false, done:true };
      }
      return { ok:true, guess, marks, win:false, done:false };
    }
  };

  global.WordscendEngine = Engine;
  console.log('[Wordscend] Engine loaded (awaiting init + dictionary).');
})(window);
