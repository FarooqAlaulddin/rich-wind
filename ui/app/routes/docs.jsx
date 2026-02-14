import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import "../docs.css";
import { Link, useLoaderData, useLocation } from "react-router";
import { useEffect } from "react";
import { loadDocsCatalog, resolveDocFromPathname } from "./docs.catalog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsRoot = path.resolve(__dirname, "../../public/docs");

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

md.renderer.rules.heading_open = function (tokens, idx) {
  const token = tokens[idx];
  const tag = token.tag;
  const inline = tokens[idx + 1];
  const text = inline?.children?.map((t) => t.content).join("") ?? "";
  const id = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `<${tag} id="${id}">`;
};

function wrapTables(html) {
  const source = String(html || "");
  if (!source.includes("<table")) {
    return source;
  }
  return source
    .replace(/<table(\s[^>]*)?>/g, '<div class="table-wrapper"><table$1>')
    .replace(/<\/table>/g, "</table></div>");
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function notFoundPayload(pathname = "/docs", sections = []) {
  const safePath = String(pathname || "/docs");
  return {
    html: md.render(`# Not Found\n\nNo docs page exists for \`${safePath}\`.`),
    slug: "",
    title: "Not found",
    sections,
    kind: "docs",
    isReview: false,
    isIdea: false,
  };
}

function pathIsInsideRoot(rootPath, absolutePath) {
  const relative = path.relative(rootPath, absolutePath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function loader({ request }) {
  const { pathname } = new URL(request.url);
  let catalog;
  try {
    catalog = await loadDocsCatalog(docsRoot);
  } catch {
    catalog = {
      pages: [],
      sections: [
        { kind: "docs", title: "All Docs", pages: [] },
        { kind: "review", title: "Review", pages: [] },
        { kind: "idea", title: "Ideas", pages: [] },
      ],
      pageBySlug: new Map(),
      pageByFile: new Map(),
    };
  }

  const page = resolveDocFromPathname(pathname, catalog);

  if (!page || !page.file) {
    return jsonResponse(notFoundPayload(pathname, catalog.sections), 404);
  }

  const fullPath = path.resolve(docsRoot, page.file);
  if (!pathIsInsideRoot(docsRoot, fullPath)) {
    return jsonResponse(notFoundPayload(pathname, catalog.sections), 404);
  }

  try {
    const markdown = await readFile(fullPath, "utf8");
    const html = wrapTables(md.render(markdown));
    return jsonResponse({
      html,
      slug: page.slug,
      title: page.title,
      sections: catalog.sections,
      kind: page.kind,
      isReview: Boolean(page.isReview),
      isIdea: Boolean(page.isIdea),
    });
  } catch (error) {
    return jsonResponse(notFoundPayload(pathname, catalog.sections), 404);
  }
}

export default function DocsRoute() {
  const data = useLoaderData() || {};
  const html = typeof data.html === "string" ? data.html : "";
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const visibleSections = sections.filter(
    (section) => Array.isArray(section?.pages) && section.pages.length > 0
  );
  const reviewStatus = Boolean(data.isReview);
  const ideaStatus = Boolean(data.isIdea);
  const slug = typeof data.slug === "string" ? data.slug : "";
  const title = typeof data.title === "string" ? data.title : "Docs";
  const location = useLocation();

  useEffect(() => {
    document.body.classList.add("allow-scroll", "docs-page");
    return () => {
      document.body.classList.remove("allow-scroll", "docs-page");
    };
  }, [location.pathname]);

  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) el.scrollIntoView();
    }
  }, [location.hash, html]);

  return (
    <div className="docs-shell">
      <aside className="docs-nav">
        <div className="docs-brand">Rich Wind Docs</div>
        <nav>
          {visibleSections.map((section) => (
            <div key={section.kind} className={`docs-nav-section docs-nav-section--${section.kind}`}>
              <div className="docs-nav-section-title">{section.title}</div>
              {section.pages.map((page) => {
                const active = page.slug === slug;
                const href = page.slug ? `/docs/${page.slug}` : "/docs";
                return (
                  <Link key={page.slug || "overview"} to={href} className={`docs-link${active ? " is-active" : ""}`}>
                    {page.title}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="docs-controls">
          <label className="docs-toggle">
            <input id="theme-toggle" type="checkbox" aria-label="Toggle dark mode" />
            <span>Dark mode</span>
          </label>
        </div>
        <div className="docs-nav-footer">
          <a href="/" className="docs-meta-link">Demo</a>
          <a
            href="https://github.com/FarooqAlaulddin/rich-wind"
            className="docs-meta-link"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      </aside>
      <main className="docs-main">
        <div className="docs-header">
          <h1>{title}</h1>
        </div>
        {reviewStatus ? (
          <div className="docs-review-banner" role="status">
            This page is under review and might contain errors.
          </div>
        ) : null}
        {ideaStatus ? (
          <div className="docs-idea-banner" role="status">
            Idea draft: this proposal is not implemented yet and may change before release.
          </div>
        ) : null}
        <article
          className="docs-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </main>
    </div>
  );
}
