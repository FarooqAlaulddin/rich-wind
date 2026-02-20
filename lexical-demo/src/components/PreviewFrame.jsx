import React, { useRef, useEffect, useCallback } from 'react';

const PREVIEW_DOC = '<!doctype html><html><head><meta charset="utf-8"/>' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
  '<style id="rw-style"></style></head><body>' +
  '<div id="rw-root" style="padding:16px"><p style="color:#94a3b8">Type in the editor and apply Tailwind classes to see a live preview.</p></div>' +
  '</body></html>';

function sanitizeHtml(raw) {
  if (!raw) return '';
  try {
    const tpl = document.createElement('template');
    tpl.innerHTML = raw;
    tpl.content.querySelectorAll('script').forEach(n => n.remove());
    return tpl.innerHTML;
  } catch {
    return raw;
  }
}

export default function PreviewFrame({ html, css }) {
  const frameRef = useRef(null);
  const readyRef = useRef(false);

  const render = useCallback((h, c) => {
    const frame = frameRef.current;
    if (!frame?.contentDocument) return;
    const doc = frame.contentDocument;
    const style = doc.getElementById('rw-style');
    const root = doc.getElementById('rw-root');
    if (!style || !root) return;

    const safeHtml = sanitizeHtml(h) ||
      '<p style="color:#94a3b8">Type in the editor and apply Tailwind classes to see a live preview.</p>';
    if (style.textContent !== (c || '')) style.textContent = c || '';
    if (root.innerHTML !== safeHtml) root.innerHTML = safeHtml;
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    readyRef.current = false;
    frame.srcdoc = PREVIEW_DOC;
    const onLoad = () => {
      readyRef.current = true;
      render(html, css);
    };
    frame.addEventListener('load', onLoad, { once: true });
    return () => frame.removeEventListener('load', onLoad);
  }, []);

  useEffect(() => {
    if (readyRef.current) render(html, css);
  }, [html, css, render]);

  return (
    <iframe
      ref={frameRef}
      title="Preview"
      className="preview-frame"
      sandbox="allow-same-origin"
    />
  );
}
