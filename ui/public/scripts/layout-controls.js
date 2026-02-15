(function () {
  function getLayoutMode(grid) {
    if (!grid) return 'split';
    if (grid.classList.contains('layout-editor')) return 'editor';
    if (grid.classList.contains('layout-output')) return 'output';
    if (grid.classList.contains('layout-collapsed')) return 'collapsed';
    return 'split';
  }

  function syncScrollMode() {
    if (document.body.classList.contains('docs-page')) {
      document.body.classList.add('allow-scroll');
      return;
    }
    var grid = document.getElementById('studio-grid');
    if (!grid) {
      document.body.classList.add('allow-scroll');
      return;
    }
    var mode = getLayoutMode(grid);
    var isStacked = false;
    try {
      isStacked = window.matchMedia('(max-width: 1100px)').matches;
    } catch (e) {}
    var hasResize = document.body.classList.contains('pane-resized');
    var isResizing = document.body.classList.contains('pane-resizing');
    var allow = isStacked || hasResize || isResizing || mode !== 'split';
    document.body.classList.toggle('allow-scroll', allow);
  }

  function setupLayoutControls() {
    var grid = document.getElementById('studio-grid');
    if (!grid) return;
    var buttons = document.querySelectorAll('[data-layout]');
    if (!buttons.length) return;

    function setLayout(mode) {
      grid.classList.remove('layout-editor', 'layout-output');
      grid.classList.remove('layout-collapsed');
      if (mode === 'editor') grid.classList.add('layout-editor');
      if (mode === 'output') grid.classList.add('layout-output');
      if (mode === 'collapsed') grid.classList.add('layout-collapsed');
      buttons.forEach(function (btn) {
        btn.classList.toggle('is-active', btn.dataset.layout === mode);
      });
      try {
        localStorage.setItem('rw-layout', mode || 'split');
      } catch (e) {}
      syncScrollMode();
    }

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.dataset.layout || 'split';
        setLayout(mode);
      });
    });

    var saved = null;
    try {
      saved = localStorage.getItem('rw-layout');
    } catch (e) {}
    var defaultMode = 'split';
    try {
      if (!saved && window.matchMedia('(max-width: 1100px)').matches) {
        defaultMode = 'editor';
      }
    } catch (e) {}
    setLayout(saved || defaultMode);
    window.addEventListener('resize', syncScrollMode);
  }

  window.__rw = window.__rw || {};
  window.__rw.getLayoutMode = getLayoutMode;
  window.__rw.syncScrollMode = syncScrollMode;
  window.__rw.setupLayoutControls = setupLayoutControls;
})();
