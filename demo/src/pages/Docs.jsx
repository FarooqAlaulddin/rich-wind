import { useEffect, useMemo, useState } from 'preact/hooks';
import { DocsShell } from '../components/DocsShell';
import { fetchDoc } from '../api';

// Cache docs across navigations
const docCache = new Map();

function buildFaqHtml(contentHtml) {
  if (!contentHtml || typeof DOMParser === 'undefined') {
    return contentHtml || '';
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<div id="faq-root">${contentHtml}</div>`, 'text/html');
  const root = parsed.getElementById('faq-root');
  if (!root) return contentHtml;

  const nodes = Array.from(root.childNodes);
  const hasQuestions = nodes.some((node) => node.nodeType === 1 && node.tagName === 'H2');
  if (!hasQuestions) return contentHtml;

  const out = parsed.createElement('div');
  out.className = 'faq-list';

  let index = 0;
  while (index < nodes.length) {
    const node = nodes[index];
    if (!(node.nodeType === 1 && node.tagName === 'H2')) {
      out.appendChild(node);
      index += 1;
      continue;
    }

    const details = parsed.createElement('details');
    details.className = 'faq-item';

    const summary = parsed.createElement('summary');
    summary.textContent = node.textContent || 'Question';
    details.appendChild(summary);

    const answer = parsed.createElement('div');
    answer.className = 'faq-answer';

    index += 1;
    while (index < nodes.length) {
      const current = nodes[index];
      if (current.nodeType === 1 && current.tagName === 'H2') break;
      answer.appendChild(current);
      index += 1;
    }

    if (!answer.childNodes.length) {
      const fallback = parsed.createElement('p');
      fallback.textContent = 'Answer coming soon.';
      answer.appendChild(fallback);
    }

    details.appendChild(answer);
    out.appendChild(details);
  }

  return out.innerHTML;
}

export function Docs({ slug }) {
  const key = slug || '';
  const [doc, setDoc] = useState(docCache.get(key) || null);
  const [error, setError] = useState(null);
  const renderedHtml = useMemo(() => {
    if (!doc?.contentHtml) return '';
    if (key !== 'faq') return doc.contentHtml;
    return buildFaqHtml(doc.contentHtml);
  }, [doc?.contentHtml, key]);

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
          <article class="docs-content" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        </>
      ) : (
        <div class="docs-header"><h1>Loading...</h1></div>
      )}
    </DocsShell>
  );
}
