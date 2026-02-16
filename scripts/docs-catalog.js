/**
 * Docs catalog — scans docs/ for markdown files and builds a navigation structure.
 * Ported from ui/app/routes/docs.catalog.js.
 */

import { readdir } from 'node:fs/promises';

const DOC_EXTENSION = '.md';
const REVIEW_PREFIX = '_review_';
const IDEA_PREFIX = '_idea_';
const ACRONYMS = new Set(['api', 'css', 'html', 'http', 'https', 'id', 'json', 'sdk', 'sla', 'sql', 'ui', 'url']);
const SECTION_ORDER = ['docs', 'review', 'idea'];
const SECTION_TITLES = { docs: 'All Docs', review: 'Review', idea: 'Ideas' };
const KIND_PRIORITY = { docs: 3, review: 2, idea: 1 };

function toTitleCaseWord(word) {
  const lower = word.toLowerCase();
  if (ACRONYMS.has(lower)) return lower.toUpperCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
}

function titleFromSlug(slug) {
  if (!slug) return 'Overview';
  return slug.split(/[-_/]+/).filter(Boolean).map(toTitleCaseWord).join(' ');
}

function isReviewDocFile(name) { return /^_review_.+\.md$/i.test(name); }
function isIdeaDocFile(name) { return /^_idea_.+\.md$/i.test(name); }

function isIgnoredDocFile(name) {
  if (isReviewDocFile(name) || isIdeaDocFile(name)) return false;
  return name.startsWith('_');
}

function slugFromFile(name) {
  if (name === 'index.md') return '';
  if (isReviewDocFile(name)) return name.slice(REVIEW_PREFIX.length, -DOC_EXTENSION.length);
  if (isIdeaDocFile(name)) return name.slice(IDEA_PREFIX.length, -DOC_EXTENSION.length);
  return name.slice(0, -DOC_EXTENSION.length);
}

function kindFromFile(name) {
  if (isReviewDocFile(name)) return 'review';
  if (isIdeaDocFile(name)) return 'idea';
  return 'docs';
}

function pickPreferred(existing, candidate) {
  if (!existing) return candidate;
  if ((KIND_PRIORITY[candidate.kind] ?? 0) > (KIND_PRIORITY[existing.kind] ?? 0)) return candidate;
  return existing;
}

export async function loadDocsCatalog(docsRoot) {
  const entries = await readdir(docsRoot, { withFileTypes: true });
  const bySlug = new Map();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(DOC_EXTENSION)) continue;
    if (isIgnoredDocFile(entry.name)) continue;

    const slug = slugFromFile(entry.name);
    const candidate = {
      slug,
      file: entry.name,
      title: titleFromSlug(slug),
      isReview: isReviewDocFile(entry.name),
      isIdea: isIdeaDocFile(entry.name),
      kind: kindFromFile(entry.name),
    };
    bySlug.set(slug, pickPreferred(bySlug.get(slug), candidate));
  }

  const pages = [...bySlug.values()].sort((a, b) => {
    if (a.kind !== b.kind) return SECTION_ORDER.indexOf(a.kind) - SECTION_ORDER.indexOf(b.kind);
    if (a.slug === '' && b.slug !== '') return -1;
    if (a.slug !== '' && b.slug === '') return 1;
    return a.title.localeCompare(b.title, 'en');
  });

  const pageBySlug = new Map(pages.map(p => [p.slug, p]));
  const pageByFile = new Map(pages.map(p => [p.file, p]));

  const byKind = { docs: [], review: [], idea: [] };
  for (const p of pages) byKind[p.kind].push(p);
  const sections = SECTION_ORDER.map(kind => ({ kind, title: SECTION_TITLES[kind], pages: byKind[kind] }));

  return { pages, sections, pageBySlug, pageByFile };
}

export function resolveDocFromPathname(pathname, catalog) {
  const relative = String(pathname || '/docs').replace(/^\/docs\/?/, '').replace(/\/+$/, '');
  if (relative.includes('..')) return null;
  if (!relative) return catalog.pageBySlug.get('') || catalog.pages[0] || null;
  if (relative.endsWith(DOC_EXTENSION)) {
    const fileName = relative.split('/').pop();
    if (fileName !== relative) return null;
    return catalog.pageByFile.get(fileName) || catalog.pageBySlug.get(fileName.slice(0, -DOC_EXTENSION.length)) || null;
  }
  return catalog.pageBySlug.get(relative) || null;
}
