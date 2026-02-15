(function () {
  function setupPaneResizers() {
    var handles = document.querySelectorAll('[data-pane-resizer]');
    if (!handles.length) return;
    var resetButton = document.getElementById('reset-panes');

    function isStackedViewport() {
      try {
        return window.matchMedia('(max-width: 1100px)').matches;
      } catch (e) {}
      return false;
    }

    function readPxVar(name, fallback) {
      try {
        var value = getComputedStyle(document.documentElement).getPropertyValue(name);
        var parsed = parseInt(value, 10);
        if (Number.isFinite(parsed)) return parsed;
      } catch (e) {}
      return fallback;
    }

    var minHeight = readPxVar('--pane-min-height', 520);
    var maxHeight = readPxVar('--pane-max-height', 2200);

    function clampHeight(value) {
      return Math.max(minHeight, Math.min(maxHeight, value));
    }

    function clearHeights() {
      document.querySelectorAll('.editor-pane, .preview-pane').forEach(function (pane) {
        pane.style.height = '';
      });
      document.body.classList.remove('pane-resized');
      try {
        localStorage.removeItem('rw-editor-height');
        localStorage.removeItem('rw-preview-height');
      } catch (e) {}
      window.__rw.syncScrollMode();
    }

    function clearInlineHeights() {
      document.querySelectorAll('.editor-pane, .preview-pane').forEach(function (pane) {
        pane.style.height = '';
      });
      document.body.classList.remove('pane-resized', 'pane-resizing');
    }

    function applyStoredHeight(pane, key) {
      if (isStackedViewport()) return;
      var saved = null;
      try { saved = localStorage.getItem(key); } catch (e) {}
      var next = parseInt(saved, 10);
      if (!Number.isFinite(next)) return;
      pane.style.height = clampHeight(next) + 'px';
      document.body.classList.add('pane-resized');
    }

    handles.forEach(function (handle) {
      if (handle.__rwBound) return;
      handle.__rwBound = true;
      var pane = handle.closest('.editor-pane, .preview-pane');
      if (!pane) return;
      var key = pane.classList.contains('editor-pane')
        ? 'rw-editor-height'
        : 'rw-preview-height';

      handle.addEventListener('pointerdown', function (event) {
        if (isStackedViewport()) return;
        event.preventDefault();
        var paneTop = pane.getBoundingClientRect().top + window.scrollY;
        var lastClientY = event.clientY;
        var dragging = true;
        var raf = null;
        handle.setPointerCapture(event.pointerId);
        document.body.classList.add('pane-resizing', 'pane-resized');
        window.__rw.syncScrollMode();

        function applyHeight() {
          var desired = clampHeight(lastClientY + window.scrollY - paneTop);
          pane.style.height = desired + 'px';
        }

        function onMove(moveEvent) {
          if (!dragging) return;
          lastClientY = moveEvent.clientY;
          applyHeight();
          document.body.classList.add('pane-resized');
          window.__rw.syncScrollMode();
        }

        function autoScroll() {
          if (!dragging) return;
          var edge = 64;
          var scrollDelta = 0;
          if (lastClientY > window.innerHeight - edge) scrollDelta = 10;
          else if (lastClientY < edge) scrollDelta = -10;
          if (scrollDelta) {
            window.scrollBy(0, scrollDelta);
            applyHeight();
            document.body.classList.add('pane-resized');
            window.__rw.syncScrollMode();
          }
          raf = window.requestAnimationFrame(autoScroll);
        }

        function finish() {
          if (!dragging) return;
          dragging = false;
          if (raf) window.cancelAnimationFrame(raf);
          document.body.classList.remove('pane-resizing');
          try {
            var finalHeight = pane.getBoundingClientRect().height;
            localStorage.setItem(key, Math.round(finalHeight));
          } catch (e) {}
          window.__rw.syncScrollMode();
        }

        handle.addEventListener('pointermove', onMove);
        applyHeight();
        raf = window.requestAnimationFrame(autoScroll);
        handle.addEventListener('pointerup', function () {
          handle.removeEventListener('pointermove', onMove);
          finish();
        }, { once: true });
        handle.addEventListener('pointercancel', function () {
          handle.removeEventListener('pointermove', onMove);
          finish();
        }, { once: true });
      });
    });

    function syncPaneSizingMode() {
      if (isStackedViewport()) {
        clearInlineHeights();
        window.__rw.syncScrollMode();
        return;
      }
      handles.forEach(function (handle) {
        var pane = handle.closest('.editor-pane, .preview-pane');
        if (!pane) return;
        var key = pane.classList.contains('editor-pane')
          ? 'rw-editor-height'
          : 'rw-preview-height';
        applyStoredHeight(pane, key);
      });
      window.__rw.syncScrollMode();
    }

    if (resetButton && !resetButton.__rwBound) {
      resetButton.__rwBound = true;
      resetButton.addEventListener('click', clearHeights);
    }

    window.addEventListener('resize', syncPaneSizingMode);
    syncPaneSizingMode();
  }

  window.__rw = window.__rw || {};
  window.__rw.setupPaneResizers = setupPaneResizers;
})();
