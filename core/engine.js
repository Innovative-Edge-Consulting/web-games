// /core/engine.js
(function (global) {
  const Engine = {
    // For now we’ll hardcode classic Wordle size; we’ll make this dynamic later.
    rows: 6,
    cols: 5,

    getConfig() {
      return { rows: this.rows, cols: this.cols };
    },

    // We'll add real logic later (submitGuess, validate, evaluate, storage, etc.)
  };

  global.WordscendEngine = Engine;
  console.log('[Wordscend] Engine ready:', Engine.getConfig());
})(window);

