(function () {
  function setupSplitter() {
    var grid = document.getElementById('studio-grid');
    var splitter = document.getElementById('splitter');
    if (!grid || !splitter) return;
    var dragging = false;
    var saved = null;
    try { saved = localStorage.getItem('rw-split'); } catch (e) {}
    if (saved) {
      grid.style.setProperty('--left-pane', saved + 'px');
    }

    splitter.addEventListener('pointerdown', function (event) {
      dragging = true;
      splitter.setPointerCapture(event.pointerId);
    });
    window.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      var rect = grid.getBoundingClientRect();
      var maxLeft = rect.width - 360 - 12;
      var next = Math.max(360, Math.min(maxLeft, event.clientX - rect.left));
      grid.style.setProperty('--left-pane', next + 'px');
    });
    window.addEventListener('pointerup', function () {
      if (!dragging) return;
      dragging = false;
      var value = grid.style.getPropertyValue('--left-pane');
      if (value) {
        try { localStorage.setItem('rw-split', parseInt(value, 10)); } catch (e) {}
      }
    });
  }

  window.__rw = window.__rw || {};
  window.__rw.setupSplitter = setupSplitter;
})();
