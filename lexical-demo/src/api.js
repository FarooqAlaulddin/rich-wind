export const CORE_BASE = (import.meta.env.VITE_RW_CORE_URL || '/rich-wind').replace(/\/+$/, '');

export async function compile({ projectId, pageId, html, classes, bundle }) {
  const res = await fetch(`${CORE_BASE}/api/compile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, pageId, html, classes, bundle }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Compile failed');
  return data;
}

export async function getPageCss({ projectId, pageId, bundle = 'full' }) {
  const qs = new URLSearchParams({
    projectId: String(projectId || ''),
    pageId: String(pageId || ''),
    bundle: String(bundle || 'full'),
  });
  const res = await fetch(`${CORE_BASE}/api/css?${qs.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || 'Fetch page css failed');
  }
  const css = await res.text();
  return { css, cached: true };
}

export async function getProjectCss({ projectId, bundle = 'full' }) {
  const encoded = encodeURIComponent(String(projectId || ''));
  const qs = new URLSearchParams({ bundle: String(bundle || 'full') });
  const res = await fetch(`${CORE_BASE}/api/projects/${encoded}/css?${qs.toString()}`);
  if (!res.ok) {
    return { css: '', cached: false };
  }
  const css = await res.text();
  return { css, cached: true };
}

export async function fetchPromotedCss(projectId) {
  const encoded = encodeURIComponent(String(projectId || ''));
  const res = await fetch(`${CORE_BASE}/plugins/auto-promote/css/${encoded}`);
  if (!res.ok) return '';
  return res.text();
}

export async function fetchPromotedStats() {
  const res = await fetch(`${CORE_BASE}/plugins/auto-promote/stats`);
  if (!res.ok) return {};
  const data = await res.json().catch(() => ({}));
  return data && typeof data === 'object' ? data : {};
}

export async function suggest({ projectId, prefix, classes, limit = 50 }) {
  const res = await fetch(`${CORE_BASE}/api/suggest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, prefix, classes, limit }),
  });
  const data = await res.json();
  return data?.suggestions || [];
}
