import { useEffect, useState } from 'preact/hooks';
import { DocsSidebar } from './DocsSidebar';
import { fetchDocsCatalog } from '../api';

// Module-level cache so catalog persists across navigations
let catalogCache = null;

export function DocsShell({ activeSlug, activePlugin, children }) {
  const [sections, setSections] = useState(catalogCache?.sections || []);

  useEffect(() => {
    if (catalogCache) {
      setSections(catalogCache.sections);
      return;
    }
    fetchDocsCatalog()
      .then((data) => {
        catalogCache = data;
        setSections(data.sections || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.body.classList.add('docs-page');
    return () => document.body.classList.remove('docs-page');
  }, []);

  return (
    <div class="docs-shell">
      <DocsSidebar sections={sections} activeSlug={activeSlug} activePlugin={activePlugin} />
      <main class="docs-main">
        {children}
      </main>
    </div>
  );
}
