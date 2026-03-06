const BASE = (import.meta.env.VITE_RW_CORE_URL || '/rich-wind').replace(/\/+$/, '');

export async function compile({ projectId, pageId, html, classes, customCss, bundle }) {
  const res = await fetch(`${BASE}/api/compile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, pageId, html, classes, bundle }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Compile failed');
  return data;
}

export async function fetchCachedCss({ projectId, pageId, bundle }) {
  const params = new URLSearchParams({ projectId, pageId });
  if (bundle && bundle !== 'full') params.set('bundle', bundle);
  const res = await fetch(`${BASE}/api/css?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || 'Cache miss');
  }
  return res.text();
}

export async function fetchProjectCss({ projectId, bundle }) {
  const params = bundle && bundle !== 'full' ? `?bundle=${encodeURIComponent(bundle)}` : '';
  const res = await fetch(`${BASE}/api/projects/${encodeURIComponent(projectId)}/css${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || 'Project cache miss');
  }
  return res.text();
}

export async function fetchSuggestions({ projectId, prefix, classes, limit = 50 }) {
  const res = await fetch(`${BASE}/api/suggest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, prefix, classes, limit }),
  });
  const data = await res.json();
  return data?.suggestions || [];
}

export async function fetchDocsCatalog() {
  const res = await fetch(`${BASE}/api/docs/catalog`);
  if (!res.ok) throw new Error('Failed to load docs catalog');
  return res.json();
}

export async function fetchDoc(slug) {
  const url = slug ? `${BASE}/api/docs/${encodeURIComponent(slug)}` : `${BASE}/api/docs/index`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Doc not found');
  return res.json();
}

export async function fetchAnalyticsData() {
  const res = await fetch(`${BASE}/plugins/analytics/data`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchAutoPromoteStats() {
  const res = await fetch(`${BASE}/plugins/auto-promote/stats`);
  if (!res.ok) return {};
  return res.json();
}

export async function fetchPromotedCss(projectId) {
  const res = await fetch(`${BASE}/plugins/auto-promote/css/${encodeURIComponent(projectId)}`);
  if (!res.ok) return null;
  return res.text();
}
