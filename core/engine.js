// /core/engine.js
(function (global) {
  const STATE = {
    rows: 6, cols: 5,
    board: [], rowMarks: [], cursor: { row:0, col:0 },
    done:false, win:false, answer:'APPLE',
    allowed:new Set(), keyStatus:{}
  };

  function init(cfg){
    STATE.rows = cfg.rows || 6;
    STATE.cols = cfg.cols || 5;
    STATE.board = Array.from({ length: STATE.rows }, () => Array(STATE.cols).fill(''));
    STATE.rowMarks = Array.from({ length: STATE.rows }, () => Array(STATE.cols).fill(null));
    STATE.cursor = { row:0, col:0 };
    STATE.done = false; STATE.win = false; STATE.keyStatus = {};
    return { rows: STATE.rows, cols: STATE.cols };
  }

  function setAnswer(word){ STATE.answer = (word || '').toUpperCase(); }
  function setAllowed(set){ STATE.allowed = set || new Set(); }

  function getBoard(){ return STATE.board.map(r => r.slice()); }
  function getRowMarks(){ return STATE.rowMarks.map(r => r.slice()); }
  function getCursor(){ return { row: STATE.cursor.row, col: STATE.cursor.col }; }
  function isDone(){ return STATE.done; }
  function getKeyStatus(){ return { ...STATE.keyStatus }; }

  function addLetter(ch){
    if (STATE.done) return false;
    ch = (ch || '').toUpperCase();
    if (!/^[A-Z]$/.test(ch)) return false;
    const { row, col } = STATE.cursor;
    if (col >= STATE.cols) return false;
    STATE.board[row][col] = ch;
    STATE.cursor.col = Math.min(STATE.cols, col + 1);
    return true;
  }

  function backspace(){
    if (STATE.done) return false;
    const { row, col } = STATE.cursor;
    if (col === 0) return false;
    STATE.cursor.col = col - 1;
    STATE.board[row][STATE.cursor.col] = '';
    return true;
  }

  function evaluateRow(guess){
    const ans = STATE.answer.split('');
    const g = guess.slice();
    const counts = {};
    ans.forEach(ch => { counts[ch] = (counts[ch] || 0) + 1; });

    const marks = Array(STATE.cols).fill('absent');

    for (let i=0;i<STATE.cols;i++){
      if (g[i] === ans[i]){ marks[i] = 'correct'; counts[g[i]] -= 1; }
    }
    for (let i=0;i<STATE.cols;i++){
      if (marks[i] === 'correct') continue;
      const ch = g[i];
      if (counts[ch] > 0){ marks[i] = 'present'; counts[ch] -= 1; }
    }
    return marks;
  }

  function updateKeyStatus(guess, marks){
    for (let i=0;i<guess.length;i++){
      const ch = guess[i], mark = marks[i], cur = STATE.keyStatus[ch];
      if (mark === 'correct'){ STATE.keyStatus[ch] = 'correct'; }
      else if (mark === 'present'){ if (cur !== 'correct') STATE.keyStatus[ch] = 'present'; }
      else { if (!cur) STATE.keyStatus[ch] = 'absent'; }
    }
  }

  function submitRow(){
    if (STATE.done) return { ok:false, reason:'done' };

    const row = STATE.cursor.row;
    if (STATE.cursor.col < STATE.cols) return { ok:false, reason:'incomplete', attempt: row+1 };

    const guess = STATE.board[row].join('');
    if (!STATE.allowed.has(guess)) return { ok:false, reason:'invalid', attempt: row+1 };

    const marks = evaluateRow(STATE.board[row]);
    STATE.rowMarks[row] = marks.slice();
    updateKeyStatus(STATE.board[row], marks);

    const win = marks.every(m => m === 'correct');
    let done = false;
    if (win){ STATE.done = true; STATE.win = true; done = true; }
    else if (row === STATE.rows - 1){ STATE.done = true; STATE.win = false; done = true; }
    else { STATE.cursor = { row: row + 1, col: 0 }; }

    return { ok:true, attempt: row+1, done, win, marks: marks.slice() };
  }

  global.WordscendEngine = { init, setAnswer, setAllowed, getBoard, getRowMarks, getCursor, isDone, addLetter, backspace, submitRow, getKeyStatus };
})(window);
