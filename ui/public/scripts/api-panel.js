(function () {
  function setupApiPanel() {
    if (window.__rwApiPanelUpdate) return;
    function updatePre(id, value) {
      var node = document.getElementById(id);
      if (!node) return;
      node.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    }
    function updateStatus(id, status) {
      var node = document.getElementById(id);
      if (!node) return;
      var tone = status === 'error' ? 'is-error' : status === 'ok' ? 'is-ok' : '';
      node.classList.remove('is-ok', 'is-error');
      if (tone) node.classList.add(tone);
      node.textContent = status ? status.toUpperCase() : '\u2014';
    }
    function pulseCards(kind) {
      var cards = document.querySelectorAll('[data-api-kind="' + kind + '"]');
      cards.forEach(function (card) {
        card.classList.remove('is-updated');
        void card.offsetWidth;
        card.classList.add('is-updated');
        window.clearTimeout(card.__rwPulse);
        card.__rwPulse = window.setTimeout(function () {
          card.classList.remove('is-updated');
        }, 900);
      });
    }
    window.__rwApiPanelUpdate = function (kind, request, response, status) {
      var time = new Date().toLocaleTimeString();
      if (request && typeof request === 'object') {
        var origin = window.__rwCoreOrigin || window.location.origin;
        if (typeof request.url === 'string' && request.url.startsWith('/')) {
          request = Object.assign({}, request, { url: origin + request.url });
        }
      }
      updatePre('api-' + kind + '-request', request || '\u2014');
      updatePre('api-' + kind + '-response', response || '\u2014');
      updatePre('api-' + kind + '-time', time);
      updateStatus('api-' + kind + '-status', status || 'ok');
      pulseCards(kind);
    };

    document.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-api-action]');
      if (!btn) return;
      var targetId = btn.getAttribute('data-api-target');
      var action = btn.getAttribute('data-api-action');
      var node = targetId ? document.getElementById(targetId) : null;
      if (!node) return;

      if (action === 'expand') {
        return;
      }

      if (action === 'curl') {
        var json = node.dataset.json || '';
        var curl = node.dataset.curl || '';
        if (!curl) return;
        if (node.dataset.view === 'curl') {
          node.textContent = json || node.textContent;
          node.dataset.view = 'json';
          return;
        }
        node.textContent = curl;
        node.dataset.view = 'curl';
        return;
      }

      if (action === 'copy') {
        var copyValue = node.dataset.curl || node.textContent;
        if (!copyValue) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(copyValue);
        } else {
          try {
            var area = document.createElement('textarea');
            area.value = copyValue;
            area.setAttribute('readonly', 'true');
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            document.body.removeChild(area);
          } catch (e) {}
        }
        btn.textContent = 'Copied';
        window.setTimeout(function () {
          btn.textContent = 'Copy';
        }, 1000);
      }
    });
  }

  function clearSuggestCache() {
    if (window.__rwSuggestCache && typeof window.__rwSuggestCache.clear === 'function') {
      window.__rwSuggestCache.clear();
    }
  }

  window.__rw = window.__rw || {};
  window.__rw.setupApiPanel = setupApiPanel;
  window.__rw.clearSuggestCache = clearSuggestCache;
})();
