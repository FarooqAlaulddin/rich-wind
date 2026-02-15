(function () {
  function boot() {
    var meta = document.querySelector('meta[name="rw-core-origin"]');
    if (meta && meta.content) {
      window.__rwCoreOrigin = meta.content;
    }
    window.__rw.setupPreviewSync();
    window.__rw.setupLayoutControls();
    window.__rw.setupSplitter();
    window.__rw.setupPaneResizers();
    window.__rw.setupApiPanel();
    window.__rw.setupThemeToggle();
    window.__rw.setupCompactToggle();
    window.__rw.setupCopyButtons();

    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      var form = document.getElementById('compile-form');
      if (window.htmx) {
        window.htmx.process(document.body);
        if (form) {
          window.__rw.setupActionFeedback(form);
          window.__rw.setupAutoCompile(form);
        }
        clearInterval(timer);
      }
      if (tries > 60) clearInterval(timer);
    }, 50);
  }

  window.addEventListener('load', function () {
    setTimeout(boot, 0);
  });
})();
