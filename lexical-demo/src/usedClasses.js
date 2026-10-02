/** Every class used in the project: the active page's HTML plus every saved page, most used first. */
export function collectUsedClasses(html, pages) {
  const counts = new Map();
  const add = (list) => {
    for (const c of list.split(/\s+/)) if (c) counts.set(c, (counts.get(c) || 0) + 1);
  };
  for (const m of String(html || '').matchAll(/class="([^"]*)"/g)) add(m[1]);
  try {
    for (const m of JSON.stringify(pages || {}).matchAll(/"tailwindClasses":"([^"]*)"/g)) add(m[1]);
  } catch { /* unserializable pages: skip */ }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
