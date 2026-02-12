import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import "./app.css";

export const links = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
  { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Space+Grotesk:wght@300..700&family=DM+Mono:wght@300;400;500&display=swap",
  },
];

export function Layout({ children }) {
  const coreOrigin = (() => {
    if (typeof process === "undefined") return "";
    const raw = (process.env.RW_CORE_URL || "").trim();
    if (!raw) return "";
    return /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  })();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {coreOrigin ? (
          <meta name="rw-core-origin" content={coreOrigin} />
        ) : null}
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
        <script src="https://unpkg.com/htmx.org@1.9.12"></script>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function boot() {
                  var meta = document.querySelector('meta[name="rw-core-origin"]');
                  if (meta && meta.content) {
                    window.__rwCoreOrigin = meta.content;
                  }
                  setupPreviewSync();
                  setupLayoutControls();
                  setupSplitter();
                  setupPaneResizers();
                  setupApiPanel();
                  setupThemeToggle();
                  setupCompactToggle();
                  setupCopyButtons();

                  var tries = 0;
                  var timer = setInterval(function() {
                    tries += 1;
                    var form = document.getElementById('compile-form');
                    if (window.htmx) {
                      window.htmx.process(document.body);
                      if (form) {
                        setupActionFeedback(form);
                        setupAutoCompile(form);
                      }
                      clearInterval(timer);
                    }
                    if (tries > 60) clearInterval(timer);
                  }, 50);
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
                    buttons.forEach(function(btn) {
                      btn.classList.toggle('is-active', btn.dataset.layout === mode);
                    });
                    try {
                      localStorage.setItem('rw-layout', mode || 'split');
                    } catch (e) {}
                    syncScrollMode();
                  }

                  buttons.forEach(function(btn) {
                    btn.addEventListener('click', function() {
                      var mode = btn.dataset.layout || 'split';
                      setLayout(mode);
                    });
                  });

                  var saved = null;
                  try {
                    saved = localStorage.getItem('rw-layout');
                  } catch (e) {}
                  setLayout(saved || 'split');
                  window.addEventListener('resize', syncScrollMode);
                }

                function getLayoutMode(grid) {
                  if (!grid) return 'split';
                  if (grid.classList.contains('layout-editor')) return 'editor';
                  if (grid.classList.contains('layout-output')) return 'output';
                  if (grid.classList.contains('layout-collapsed')) return 'collapsed';
                  return 'split';
                }

                function syncScrollMode() {
                  var grid = document.getElementById('studio-grid');
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
                    var keys = ['projectId', 'pageId', 'html', 'classes'];
                    return keys.map(function(key) {
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
                    debounceTimer = setTimeout(function() {
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
                        applyPreviewFromForm();
                      }
                    }, 500);
                  }

                  form.addEventListener('input', function(event) {
                    if (event.target && (event.target.matches('textarea') || event.target.matches('input'))) {
                      schedule();
                    }
                  });
                  form.addEventListener('change', schedule);
                  form.addEventListener('submit', function() {
                    lastCore = snapshotCore();
                    lastCustom = snapshotCustom();
                    if (form.__rwSetIntent) form.__rwSetIntent('compile', true);
                  });
                  form.addEventListener('htmx:beforeRequest', function() {
                    inFlight = true;
                    lastCore = snapshotCore();
                    lastCustom = snapshotCustom();
                  });
                  form.addEventListener('htmx:afterRequest', function() {
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
                      applyPreviewFromForm();
                    }
                  });
                  if (autoToggle) {
                    autoToggle.addEventListener('change', function() {
                      if (autoToggle.checked) {
                        schedule();
                      }
                    });
                  }

                  if (autoToggle && autoToggle.checked) {
                    schedule();
                  }
                }

                function setupActionFeedback(form) {
                  if (form.__rwSetIntent) return;
                  var buttons = form.querySelectorAll('[data-intent]');
                  var intentField = document.getElementById('intent-field');

                  function setIntent(intent) {
                    if (!intentField) return;
                    intentField.value = intent || 'compile';
                  }

                  function setActive(intent) {
                    buttons.forEach(function(btn) {
                      btn.classList.toggle('is-active', btn.dataset.intent === intent);
                    });
                  }

                  form.__rwSetIntent = function(intent, silent) {
                    setIntent(intent);
                    if (!silent) setActive(intent);
                  };

                  buttons.forEach(function(btn) {
                    btn.addEventListener('click', function() {
                      var intent = btn.dataset.intent || 'compile';
                      setIntent(intent);
                      setActive(intent);
                    });
                  });

                  form.addEventListener('htmx:beforeRequest', function(event) {
                    var submitter = event.detail && event.detail.triggeringEvent ? event.detail.triggeringEvent.submitter : null;
                    var intent = submitter && submitter.dataset ? submitter.dataset.intent : null;
                    if (!intent) intent = 'compile';
                    setIntent(intent);
                    setActive(intent);
                    buttons.forEach(function(btn) {
                      btn.classList.toggle('is-loading', btn === submitter);
                    });
                  });

                  form.addEventListener('htmx:afterRequest', function() {
                    buttons.forEach(function(btn) {
                      btn.classList.remove('is-loading');
                    });
                    setIntent('compile');
                  });

                  setActive('compile');
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
                  toggle.addEventListener('change', function() {
                    document.body.classList.toggle('compact-mode', toggle.checked);
                    try { localStorage.setItem('rw-compact', String(toggle.checked)); } catch (e) {}
                  });
                }

                function setupThemeToggle() {
                  var toggle = document.getElementById('theme-toggle');
                  if (!toggle) return;
                  var saved = null;
                  try { saved = localStorage.getItem('rw-theme'); } catch (e) {}
                  var prefersDark = false;
                  try {
                    prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                  } catch (e) {}
                  var useDark = saved ? saved === 'dark' : prefersDark;
                  toggle.checked = useDark;
                  document.body.classList.toggle('theme-dark', useDark);

                  toggle.addEventListener('change', function() {
                    var enabled = toggle.checked;
                    document.body.classList.toggle('theme-dark', enabled);
                    try { localStorage.setItem('rw-theme', enabled ? 'dark' : 'light'); } catch (e) {}
                    if (window.__rwPreview) {
                      applyPreview(window.__rwPreview, 'local');
                    }
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
                    button.__rwTimer = window.setTimeout(function() {
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
                    return new Promise(function(resolve, reject) {
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

                  button.addEventListener('click', function() {
                    var text = getCssText();
                    copyText(text)
                      .then(function() { setLabel('Copied', 'is-success'); })
                      .catch(function() { setLabel('Copy failed', 'is-error'); });
                  });
                }

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
                    node.textContent = status ? status.toUpperCase() : '—';
                  }
                  function pulseCards(kind) {
                    var cards = document.querySelectorAll('[data-api-kind="' + kind + '"]');
                    cards.forEach(function(card) {
                      card.classList.remove('is-updated');
                      void card.offsetWidth;
                      card.classList.add('is-updated');
                      window.clearTimeout(card.__rwPulse);
                      card.__rwPulse = window.setTimeout(function() {
                        card.classList.remove('is-updated');
                      }, 900);
                    });
                  }
                  window.__rwApiPanelUpdate = function(kind, request, response, status) {
                    var time = new Date().toLocaleTimeString();
                    if (request && typeof request === 'object') {
                      var origin = window.__rwCoreOrigin || window.location.origin;
                      if (typeof request.url === 'string' && request.url.startsWith('/')) {
                        request = Object.assign({}, request, { url: origin + request.url });
                      }
                    }
                    updatePre('api-' + kind + '-request', request || '—');
                    updatePre('api-' + kind + '-response', response || '—');
                    updatePre('api-' + kind + '-time', time);
                    updateStatus('api-' + kind + '-status', status || 'ok');
                    pulseCards(kind);
                  };

                  document.addEventListener('click', function(event) {
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
                      window.setTimeout(function() {
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

                  splitter.addEventListener('pointerdown', function(event) {
                    dragging = true;
                    splitter.setPointerCapture(event.pointerId);
                  });
                  window.addEventListener('pointermove', function(event) {
                    if (!dragging) return;
                    var rect = grid.getBoundingClientRect();
                    var maxLeft = rect.width - 360 - 12;
                    var next = Math.max(360, Math.min(maxLeft, event.clientX - rect.left));
                    grid.style.setProperty('--left-pane', next + 'px');
                  });
                  window.addEventListener('pointerup', function() {
                    if (!dragging) return;
                    dragging = false;
                    var value = grid.style.getPropertyValue('--left-pane');
                    if (value) {
                      try { localStorage.setItem('rw-split', parseInt(value, 10)); } catch (e) {}
                    }
                  });
                }

                function setupPaneResizers() {
                  var handles = document.querySelectorAll('[data-pane-resizer]');
                  if (!handles.length) return;
                  var resetButton = document.getElementById('reset-panes');

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
                    document.querySelectorAll('.editor-pane, .preview-pane').forEach(function(pane) {
                      pane.style.height = '';
                    });
                    document.body.classList.remove('pane-resized');
                    try {
                      localStorage.removeItem('rw-editor-height');
                      localStorage.removeItem('rw-preview-height');
                    } catch (e) {}
                    syncScrollMode();
                  }

                  function applyStoredHeight(pane, key) {
                    var saved = null;
                    try { saved = localStorage.getItem(key); } catch (e) {}
                    var next = parseInt(saved, 10);
                    if (!Number.isFinite(next)) return;
                    pane.style.height = clampHeight(next) + 'px';
                    document.body.classList.add('pane-resized');
                  }

                  handles.forEach(function(handle) {
                    if (handle.__rwBound) return;
                    handle.__rwBound = true;
                    var pane = handle.closest('.editor-pane, .preview-pane');
                    if (!pane) return;
                    var key = pane.classList.contains('editor-pane')
                      ? 'rw-editor-height'
                      : 'rw-preview-height';
                    applyStoredHeight(pane, key);

                    handle.addEventListener('pointerdown', function(event) {
                      event.preventDefault();
                      var paneTop = pane.getBoundingClientRect().top + window.scrollY;
                      var lastClientY = event.clientY;
                      var dragging = true;
                      var raf = null;
                      handle.setPointerCapture(event.pointerId);
                      document.body.classList.add('pane-resizing', 'pane-resized');
                      syncScrollMode();

                      function applyHeight() {
                        var desired = clampHeight(lastClientY + window.scrollY - paneTop);
                        pane.style.height = desired + 'px';
                      }

                      function onMove(moveEvent) {
                        if (!dragging) return;
                        lastClientY = moveEvent.clientY;
                        applyHeight();
                        document.body.classList.add('pane-resized');
                        syncScrollMode();
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
                          syncScrollMode();
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
                        syncScrollMode();
                      }

                      handle.addEventListener('pointermove', onMove);
                      applyHeight();
                      raf = window.requestAnimationFrame(autoScroll);
                      handle.addEventListener('pointerup', function() {
                        handle.removeEventListener('pointermove', onMove);
                        finish();
                      }, { once: true });
                      handle.addEventListener('pointercancel', function() {
                        handle.removeEventListener('pointermove', onMove);
                        finish();
                      }, { once: true });
                    });
                  });

                  if (resetButton && !resetButton.__rwBound) {
                    resetButton.__rwBound = true;
                    resetButton.addEventListener('click', clearHeights);
                  }

                  syncScrollMode();
                }

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

                var PREVIEW_HOST_VERSION = 'v2';

                function buildPreviewHostDoc() {
                  return '<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>' +
                    '<meta http-equiv="Content-Security-Policy" content="default-src \\'none\\'; img-src data: https:; style-src \\'unsafe-inline\\' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src \\'none\\'; script-src \\'none\\'; object-src \\'none\\'; base-uri \\'none\\'; form-action \\'none\\';">' +
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
                    scripts.forEach(function(node) { node.remove(); });
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
                  var css = (payload && payload.css ? payload.css : '') + '\\n' + (payload && payload.customCss ? payload.customCss : '');
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
                    frame.addEventListener('load', function() {
                      frame.dataset.host = 'ready';
                      if (window.__rwPreview) renderPreviewInFrame(frame, window.__rwPreview);
                    }, { once: true });
                  }
                  return false;
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
                      clearSuggestCache();
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
                    channel.addEventListener('message', function(event) {
                      if (event && event.data) applyPreview(event.data, 'external');
                    });
                  }
                  window.addEventListener('storage', function(event) {
                    if (event.key === 'rw-preview-payload' && event.newValue) {
                      try {
                        applyPreview(JSON.parse(event.newValue), 'external');
                      } catch (e) {}
                    }
                  });
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

                window.addEventListener('load', function() {
                  setTimeout(boot, 0);
                });
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
