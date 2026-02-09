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
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
                  setupPreviewSync();
                  setupLayoutControls();
                  setupSplitter();
                  setupCompactToggle();

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
                    if (mode === 'editor') grid.classList.add('layout-editor');
                    if (mode === 'output') grid.classList.add('layout-output');
                    buttons.forEach(function(btn) {
                      btn.classList.toggle('is-active', btn.dataset.layout === mode);
                    });
                    try {
                      localStorage.setItem('rw-layout', mode || 'split');
                    } catch (e) {}
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
                    '<style>@import url(\\'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap\\');:root{color-scheme:only light;}body{margin:0;font-family:\\'Space Grotesk\\',system-ui,sans-serif;background:radial-gradient(circle at top,rgba(255,255,255,0.9),rgba(255,255,255,0.65));padding:24px;} .preview-shell{min-height:100%;}</style>' +
                    '<style id="rw-preview-style"></style></head><body>' +
                    '<div id="rw-preview-root" class="preview-shell"><div style="border:1px dashed rgba(148,163,184,0.4);padding:24px;text-align:center;color:#94a3b8;border-radius:16px;">Compile to render preview.</div></div>' +
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
                    html = '<div style="border:1px dashed rgba(148,163,184,0.4);padding:24px;text-align:center;color:#94a3b8;border-radius:16px;">Add HTML or classes to preview compiled CSS.</div>';
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
                    if (payload) applyPreview(payload, 'local');
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
