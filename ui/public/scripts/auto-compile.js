(function () {
  function setupAutoCompile(form) {
    var autoToggle = document.getElementById('auto-compile');
    var lastCore = '';
    var lastCustom = '';
    var debounceTimer = null;
    var inFlight = false;
    var pendingCore = null;
    var pendingCustom = null;

    function snapshotCore() {
      var data = new FormData(form);
      var keys = ['projectId', 'pageId', 'html', 'classes', 'bundle'];
      return keys.map(function (key) {
        return key + ':' + (data.get(key) || '');
      }).join('||');
    }

    function snapshotCustom() {
      var data = new FormData(form);
      return data.get('customCss') || '';
    }

    function schedule() {
      if (!autoToggle || !autoToggle.checked) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        var coreNext = snapshotCore();
        var customNext = snapshotCustom();
        if (coreNext !== lastCore) {
          if (inFlight) {
            pendingCore = coreNext;
            pendingCustom = customNext;
            return;
          }
          lastCore = coreNext;
          lastCustom = customNext;
          if (form.__rwSetIntent) form.__rwSetIntent('compile');
          try {
            window.htmx.trigger(form, 'submit');
          } catch (e) {}
          return;
        }
        if (customNext !== lastCustom) {
          if (inFlight) {
            pendingCustom = customNext;
            return;
          }
          lastCustom = customNext;
          window.__rw.applyPreviewFromForm();
        }
      }, 500);
    }

    form.addEventListener('input', function (event) {
      if (event.target && (event.target.matches('textarea') || event.target.matches('input'))) {
        schedule();
      }
    });
    form.addEventListener('change', schedule);
    form.addEventListener('submit', function () {
      lastCore = snapshotCore();
      lastCustom = snapshotCustom();
      if (form.__rwSetIntent) form.__rwSetIntent('compile', true);
    });
    form.addEventListener('htmx:beforeRequest', function () {
      inFlight = true;
      lastCore = snapshotCore();
      lastCustom = snapshotCustom();
    });
    form.addEventListener('htmx:afterRequest', function () {
      inFlight = false;
      if (pendingCore && pendingCore !== lastCore) {
        lastCore = pendingCore;
        if (pendingCustom !== null) {
          lastCustom = pendingCustom;
        }
        pendingCore = null;
        pendingCustom = null;
        try {
          window.htmx.trigger(form, 'submit');
        } catch (e) {}
        return;
      }
      if (pendingCustom !== null && pendingCustom !== lastCustom) {
        lastCustom = pendingCustom;
        pendingCustom = null;
        window.__rw.applyPreviewFromForm();
      }
    });
    if (autoToggle) {
      autoToggle.addEventListener('change', function () {
        if (autoToggle.checked) {
          schedule();
        }
      });
    }

    if (autoToggle && autoToggle.checked) {
      schedule();
    }
  }

  window.__rw = window.__rw || {};
  window.__rw.setupAutoCompile = setupAutoCompile;
})();
