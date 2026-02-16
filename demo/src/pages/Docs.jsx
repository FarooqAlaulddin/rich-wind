import { useEffect, useState } from 'preact/hooks';
import { DocsShell } from '../components/DocsShell';
import { fetchDoc } from '../api';

// Cache docs across navigations
const docCache = new Map();

export function Docs({ slug }) {
  const key = slug || '';
  const [doc, setDoc] = useState(docCache.get(key) || null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (docCache.has(key)) {
      setDoc(docCache.get(key));
      setError(null);
      return;
    }
    setDoc(null);
    setError(null);
    fetchDoc(key)
      .then((data) => {
        docCache.set(key, data);
        setDoc(data);
      })
      .catch((err) => setError(err.message));
  }, [key]);

  return (
    <DocsShell activeSlug={key} activePlugin={null}>
      {error ? (
        <>
          <div class="docs-header"><h1>Not Found</h1></div>
          <article class="docs-content"><p>{error}</p></article>
        </>
      ) : doc ? (
        <>
          <div class="docs-header"><h1>{doc.title}</h1></div>
          {doc.isReview && (
            <div class="docs-review-banner" role="status">
              This page is under review and might contain errors.
            </div>
          )}
          {doc.isIdea && (
            <div class="docs-idea-banner" role="status">
              Idea draft: this proposal is not implemented yet and may change before release.
            </div>
          )}
          <article class="docs-content" dangerouslySetInnerHTML={{ __html: doc.contentHtml }} />
        </>
      ) : (
        <div class="docs-header"><h1>Loading...</h1></div>
      )}
    </DocsShell>
  );
}
