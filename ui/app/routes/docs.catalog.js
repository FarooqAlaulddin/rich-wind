import { readdir } from "node:fs/promises";
import path from "node:path";

const DOC_EXTENSION = ".md";
const REVIEW_PREFIX = "_review_";
const IDEA_PREFIX = "_idea_";
const ACRONYMS = new Set(["api", "css", "html", "http", "https", "id", "json", "sdk", "sla", "sql", "ui", "url"]);
const SECTION_ORDER = ["docs", "review", "idea"];
const SECTION_TITLES = {
  docs: "All Docs",
  review: "Review",
  idea: "Ideas",
};
const KIND_PRIORITY = {
  docs: 3,
  review: 2,
  idea: 1,
};

function toTitleCaseWord(word) {
  const lower = word.toLowerCase();
  if (ACRONYMS.has(lower)) return lower.toUpperCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
}

function titleFromSlug(slug) {
  if (!slug) return "Overview";
  return slug
    .split(/[-_/]+/)
    .filter(Boolean)
    .map(toTitleCaseWord)
    .join(" ");
}

function isMarkdownFile(fileName) {
  return fileName.toLowerCase().endsWith(DOC_EXTENSION);
}

function isReviewDocFile(fileName) {
  return /^_review_.+\.md$/i.test(fileName);
}

function isIdeaDocFile(fileName) {
  return /^_idea_.+\.md$/i.test(fileName);
}

function isIgnoredDocFile(fileName) {
  if (isReviewDocFile(fileName) || isIdeaDocFile(fileName)) return false;
  return fileName.startsWith("_");
}

function slugFromFile(fileName) {
  if (fileName === "index.md") return "";
  if (isReviewDocFile(fileName)) {
    return fileName.slice(REVIEW_PREFIX.length, -DOC_EXTENSION.length);
  }
  if (isIdeaDocFile(fileName)) {
    return fileName.slice(IDEA_PREFIX.length, -DOC_EXTENSION.length);
  }
  return fileName.slice(0, -DOC_EXTENSION.length);
}

function comparePages(a, b) {
  if (a.kind !== b.kind) {
    return SECTION_ORDER.indexOf(a.kind) - SECTION_ORDER.indexOf(b.kind);
  }
  if (a.slug === "" && b.slug !== "") return -1;
  if (a.slug !== "" && b.slug === "") return 1;
  return a.title.localeCompare(b.title, "en");
}

function pickPreferredPage(existingPage, candidatePage) {
  if (!existingPage) return candidatePage;
  if ((KIND_PRIORITY[candidatePage.kind] ?? 0) > (KIND_PRIORITY[existingPage.kind] ?? 0)) {
    return candidatePage;
  }
  return existingPage;
}

function kindFromFile(fileName) {
  if (isReviewDocFile(fileName)) return "review";
  if (isIdeaDocFile(fileName)) return "idea";
  return "docs";
}

function buildSections(pages) {
  const byKind = {
    docs: [],
    review: [],
    idea: [],
  };

  for (const page of pages) {
    byKind[page.kind].push(page);
  }

  return SECTION_ORDER.map((kind) => ({
    kind,
    title: SECTION_TITLES[kind],
    pages: byKind[kind],
  }));
}

export async function loadDocsCatalog(docsRoot) {
  const entries = await readdir(docsRoot, { withFileTypes: true });
  const pagesBySlug = new Map();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!isMarkdownFile(entry.name)) continue;
    if (isIgnoredDocFile(entry.name)) continue;

    const slug = slugFromFile(entry.name);
    if (typeof slug !== "string" || (slug.length === 0 && entry.name !== "index.md")) {
      continue;
    }

    const candidate = {
      slug,
      file: entry.name,
      title: titleFromSlug(slug),
      isReview: isReviewDocFile(entry.name),
      isIdea: isIdeaDocFile(entry.name),
      kind: kindFromFile(entry.name),
    };

    const existing = pagesBySlug.get(slug);
    pagesBySlug.set(slug, pickPreferredPage(existing, candidate));
  }

  const pages = [...pagesBySlug.values()].sort(comparePages);
  const pageBySlug = new Map(pages.map((page) => [page.slug, page]));
  const pageByFile = new Map(pages.map((page) => [page.file, page]));
  const sections = buildSections(pages);

  return { pages, sections, pageBySlug, pageByFile };
}

export function resolveDocFromPathname(pathname, catalog) {
  const safePathname = String(pathname || "/docs");
  const relative = safePathname.replace(/^\/docs\/?/, "").replace(/\/+$/, "");

  if (relative.includes("..")) return null;

  if (!relative) {
    return catalog.pageBySlug.get("") || catalog.pages[0] || null;
  }

  if (relative.endsWith(DOC_EXTENSION)) {
    const fileName = path.basename(relative);
    if (fileName !== relative) return null;
    return catalog.pageByFile.get(fileName) || catalog.pageBySlug.get(fileName.slice(0, -DOC_EXTENSION.length)) || null;
  }

  return catalog.pageBySlug.get(relative) || null;
}
