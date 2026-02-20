import { useRef, useEffect, useCallback } from 'preact/hooks';

const PREVIEW_HOST_DOC = '<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>' +
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https:; style-src \'unsafe-inline\' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src \'none\'; script-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\';">' +
  '<style id="rw-preview-style"></style></head><body>' +
  '<div id="rw-preview-root" class="preview-shell"><div class="rw-preview-empty">Compile to render preview.</div></div>' +
  '</body></html>';

function sanitizeHtml(raw) {
  if (!raw) return '';
  try {
    const template = document.createElement('template');
    template.innerHTML = raw;
    template.content.querySelectorAll('script').forEach((n) => n.remove());
    return template.innerHTML;
  } catch {
    return raw;
  }
}

export function PreviewFrame({ preview }) {
  const frameRef = useRef(null);
  const readyRef = useRef(false);

  const renderPayload = useCallback((payload) => {
    const frame = frameRef.current;
    if (!frame?.contentDocument) return;
    const doc = frame.contentDocument;
    const style = doc.getElementById('rw-preview-style');
    const root = doc.getElementById('rw-preview-root');
    if (!style || !root) return;

    let html = payload?.html || '';
    if (!html.trim()) {
      html = '<div class="rw-preview-empty">Add HTML or classes to preview compiled CSS.</div>';
    }
    html = sanitizeHtml(html);
    const css = (payload?.css || '') + '\n' + (payload?.customCss || '');
    if (style.textContent !== css) style.textContent = css;
    if (root.innerHTML !== html) root.innerHTML = html;
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    readyRef.current = false;
    frame.srcdoc = PREVIEW_HOST_DOC;
    const onLoad = () => {
      readyRef.current = true;
      if (preview) renderPayload(preview);
    };
    frame.addEventListener('load', onLoad, { once: true });
    return () => frame.removeEventListener('load', onLoad);
  }, []);

  useEffect(() => {
    if (readyRef.current && preview) renderPayload(preview);
  }, [preview, renderPayload]);

  // Broadcast preview for cross-tab sync
  useEffect(() => {
    if (!preview) return;
    try { localStorage.setItem('rw-preview-payload', JSON.stringify(preview)); } catch { /* ignore */ }
    try {
      if (!window.__rwPreviewChannel && 'BroadcastChannel' in window) {
        window.__rwPreviewChannel = new BroadcastChannel('rw-preview');
      }
      window.__rwPreviewChannel?.postMessage(preview);
    } catch { /* ignore */ }
  }, [preview]);

  return (
    <iframe
      ref={frameRef}
      title="Preview"
      class="preview-frame"
      sandbox="allow-same-origin"
    />
  );
}
