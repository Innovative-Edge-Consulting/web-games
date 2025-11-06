// /ui/dom-view.js
(function (global) {
  const UI = {
    mount(rootEl, config) {
      if (!rootEl) {
        console.warn('[Wordscend] No mount element provided.');
        return;
      }
      rootEl.innerHTML = '';

      const grid = document.createElement('div');
      grid.className = 'ws-grid';

      for (let r = 0; r < config.rows; r++) {
        const row = document.createElement('div');
        row.className = 'ws-row';
        for (let c = 0; c < config.cols; c++) {
          const tile = document.createElement('div');
          tile.className = 'ws-tile';
          tile.setAttribute('data-row', r);
          tile.setAttribute('data-col', c);
          row.appendChild(tile);
        }
        grid.appendChild(row);
      }

      rootEl.appendChild(grid);
      console.log('[Wordscend] Grid rendered:', config.rows, 'rows ×', config.cols, 'cols');
    }
  };

  global.WordscendUI = UI;
})(window);

