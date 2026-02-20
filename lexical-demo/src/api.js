export async function compile({ projectId, pageId, html, classes }) {
  const res = await fetch('/api/compile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, pageId, html, classes }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Compile failed');
  return data;
}

export async function suggest({ projectId, prefix, classes, limit = 50 }) {
  const res = await fetch('/api/suggest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId, prefix, classes, limit }),
  });
  const data = await res.json();
  return data?.suggestions || [];
}
