(function () {
  function setupThemeToggle() {
    var toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    var saved = null;
    try { saved = localStorage.getItem('rw-theme'); } catch (e) {}
    var prefersDark = false;
    var mediaQuery = null;
    try {
      if (window.matchMedia) {
        mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        prefersDark = mediaQuery.matches;
      }
    } catch (e) {}
    var useDark = saved ? saved === 'dark' : prefersDark;
    toggle.checked = useDark;
    document.body.classList.toggle('theme-dark', useDark);

    if (!saved && mediaQuery) {
      var syncWithSystem = function (event) {
        var next = event.matches;
        toggle.checked = next;
        document.body.classList.toggle('theme-dark', next);
        if (window.__rwPreview) {
          window.__rw.applyPreview(window.__rwPreview, 'local');
        }
      };
      try {
        if (mediaQuery.addEventListener) {
          mediaQuery.addEventListener('change', syncWithSystem);
        } else if (mediaQuery.addListener) {
          mediaQuery.addListener(syncWithSystem);
        }
      } catch (e) {}
    }

    toggle.addEventListener('change', function () {
      var enabled = toggle.checked;
      document.body.classList.toggle('theme-dark', enabled);
      try { localStorage.setItem('rw-theme', enabled ? 'dark' : 'light'); } catch (e) {}
      if (window.__rwPreview) {
        window.__rw.applyPreview(window.__rwPreview, 'local');
      }
    });
  }

  function setupCompactToggle() {
    var toggle = document.getElementById('compact-mode');
    if (!toggle) return;
    var saved = null;
    try { saved = localStorage.getItem('rw-compact'); } catch (e) {}
    if (saved === 'true') {
      toggle.checked = true;
      document.body.classList.add('compact-mode');
    }
    toggle.addEventListener('change', function () {
      document.body.classList.toggle('compact-mode', toggle.checked);
      try { localStorage.setItem('rw-compact', String(toggle.checked)); } catch (e) {}
    });
  }

  function setupCopyButtons() {
    var button = document.getElementById('copy-css-btn');
    if (!button || button.__rwBound) return;
    button.__rwBound = true;
    var originalLabel = button.textContent;

    function setLabel(text, tone) {
      button.textContent = text;
      button.classList.remove('is-success', 'is-error');
      if (tone) button.classList.add(tone);
      window.clearTimeout(button.__rwTimer);
      button.__rwTimer = window.setTimeout(function () {
        button.textContent = originalLabel;
        button.classList.remove('is-success', 'is-error');
      }, 1400);
    }

    function getCssText() {
      var output = document.getElementById('css-output');
      if (!output) return '';
      var pre = output.querySelector('pre');
      var text = pre ? pre.textContent : output.textContent;
      return (text || '').trim();
    }

    function copyText(text) {
      if (!text) return Promise.reject(new Error('empty'));
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
      return new Promise(function (resolve, reject) {
        try {
          var area = document.createElement('textarea');
          area.value = text;
          area.setAttribute('readonly', 'true');
          area.style.position = 'fixed';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.select();
          var ok = document.execCommand('copy');
          document.body.removeChild(area);
          if (ok) resolve();
          else reject(new Error('copy-failed'));
        } catch (err) {
          reject(err);
        }
      });
    }

    button.addEventListener('click', function () {
      var text = getCssText();
      copyText(text)
        .then(function () { setLabel('Copied', 'is-success'); })
        .catch(function () { setLabel('Copy failed', 'is-error'); });
    });
  }

  window.__rw = window.__rw || {};
  window.__rw.setupThemeToggle = setupThemeToggle;
  window.__rw.setupCompactToggle = setupCompactToggle;
  window.__rw.setupCopyButtons = setupCopyButtons;
})();
