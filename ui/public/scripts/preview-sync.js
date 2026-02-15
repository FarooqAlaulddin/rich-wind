(function () {
  var PREVIEW_HOST_VERSION = 'v2';

  function decodePayload(encoded) {
    if (!encoded) return null;
    try {
      var binary = atob(encoded);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      var json = new TextDecoder().decode(bytes);
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  function buildPreviewHostDoc() {
    return '<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https:; style-src \'unsafe-inline\' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src \'none\'; script-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\';">' +
      '<style id="rw-preview-style"></style></head><body>' +
      '<div id="rw-preview-root" class="preview-shell"><div class="rw-preview-empty">Compile to render preview.</div></div>' +
      '</body></html>';
  }

  function sanitizeHtml(raw) {
    if (!raw) return '';
    try {
      var template = document.createElement('template');
      template.innerHTML = raw;
      var scripts = template.content.querySelectorAll('script');
      scripts.forEach(function (node) { node.remove(); });
      return template.innerHTML;
    } catch (e) {
      return raw;
    }
  }

  function renderPreviewInFrame(frame, payload) {
    if (!frame || !frame.contentDocument) return false;
    var doc = frame.contentDocument;
    var style = doc.getElementById('rw-preview-style');
    var root = doc.getElementById('rw-preview-root');
    if (!style || !root) return false;
    var html = payload && payload.html ? payload.html : '';
    if (!html || !html.trim()) {
      html = '<div class="rw-preview-empty">Add HTML or classes to preview compiled CSS.</div>';
    }
    html = sanitizeHtml(html);
    var css = (payload && payload.css ? payload.css : '') + '\n' + (payload && payload.customCss ? payload.customCss : '');
    if (style.textContent !== css) style.textContent = css;
    if (root.innerHTML !== html) root.innerHTML = html;
    return true;
  }

  function ensurePreviewFrame(frame) {
    if (!frame || frame.tagName !== 'IFRAME') return false;
    if (frame.dataset.hostVersion !== PREVIEW_HOST_VERSION) {
      frame.dataset.host = '';
      frame.dataset.hostVersion = PREVIEW_HOST_VERSION;
    }
    if (frame.dataset.host === 'ready') return true;
    if (frame.dataset.host !== 'loading') {
      frame.dataset.host = 'loading';
      frame.srcdoc = buildPreviewHostDoc();
      frame.addEventListener('load', function () {
        frame.dataset.host = 'ready';
        if (window.__rwPreview) renderPreviewInFrame(frame, window.__rwPreview);
      }, { once: true });
    }
    return false;
  }

  function broadcastPreview(payload) {
    if (!payload) return;
    try {
      localStorage.setItem('rw-preview-payload', JSON.stringify(payload));
    } catch (e) {}
    if (!window.__rwPreviewChannel && 'BroadcastChannel' in window) {
      window.__rwPreviewChannel = new BroadcastChannel('rw-preview');
    }
    if (window.__rwPreviewChannel) {
      try { window.__rwPreviewChannel.postMessage(payload); } catch (e) {}
    }
  }

  function applyPreview(payload, source) {
    if (!payload) return;
    var key = JSON.stringify(payload);
    var changed = window.__rwPreviewKey !== key;
    window.__rwPreviewKey = key;
    window.__rwPreview = payload;

    var frame = document.getElementById('preview-frame');
    if (ensurePreviewFrame(frame)) {
      renderPreviewInFrame(frame, payload);
    }

    var standalone = document.getElementById('preview-standalone');
    if (ensurePreviewFrame(standalone)) {
      renderPreviewInFrame(standalone, payload);
    }

    if (changed && source !== 'external') {
      broadcastPreview(payload);
    }
  }

  function applyPreviewFromForm() {
    var form = document.getElementById('compile-form');
    if (!form || !window.__rwPreview) return;
    var data = new FormData(form);
    var payload = {
      html: data.get('html') || '',
      css: window.__rwPreview.css || '',
      customCss: data.get('customCss') || ''
    };
    applyPreview(payload, 'local');
  }

  function setupPreviewSync() {
    ensurePreviewFrame(document.getElementById('preview-frame'));
    ensurePreviewFrame(document.getElementById('preview-standalone'));
    function syncPreviewFromDom() {
      var node = document.getElementById('preview-data');
      if (!node) return;
      var payload = decodePayload(node.dataset.payload || '');
      if (payload) {
        applyPreview(payload, 'local');
        window.__rw.clearSuggestCache();
      }
    }
    document.body.addEventListener('htmx:afterOnLoad', syncPreviewFromDom);
    document.body.addEventListener('htmx:afterSwap', syncPreviewFromDom);
    document.body.addEventListener('htmx:oobAfterSwap', syncPreviewFromDom);
    try {
      var saved = localStorage.getItem('rw-preview-payload');
      if (saved) {
        var parsed = JSON.parse(saved);
        applyPreview(parsed, 'external');
      }
    } catch (e) {}
    if ('BroadcastChannel' in window) {
      var channel = new BroadcastChannel('rw-preview');
      channel.addEventListener('message', function (event) {
        if (event && event.data) applyPreview(event.data, 'external');
      });
    }
    window.addEventListener('storage', function (event) {
      if (event.key === 'rw-preview-payload' && event.newValue) {
        try {
          applyPreview(JSON.parse(event.newValue), 'external');
        } catch (e) {}
      }
    });
  }

  window.__rw = window.__rw || {};
  window.__rw.setupPreviewSync = setupPreviewSync;
  window.__rw.applyPreview = applyPreview;
  window.__rw.applyPreviewFromForm = applyPreviewFromForm;
  window.__rw.ensurePreviewFrame = ensurePreviewFrame;
})();
