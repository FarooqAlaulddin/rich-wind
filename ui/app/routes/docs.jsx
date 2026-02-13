import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import "../docs.css";
import { Link, useLoaderData, useLocation } from "react-router";
import { useEffect } from "react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsRoot = path.resolve(__dirname, "../../public/docs");

const DOC_PAGES = [
  { slug: "", title: "Overview", file: "index.md" },
  { slug: "plugin-system", title: "Plugin system", file: "plugin-system.md" },
  { slug: "css-strategies", title: "CSS strategies", file: "css-strategies.md" },
  { slug: "persistence-layer", title: "Persistence layer report", file: "persistence-layer.md" },
];

const pageBySlug = new Map(DOC_PAGES.map((page) => [page.slug, page]));
const pageByFile = new Map(DOC_PAGES.map((page) => [page.file, page]));
const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

function resolveDoc(pathname) {
  const relative = pathname.replace(/^\/docs\/?/, "").replace(/\/+$/, "");
  if (!relative) {
    return { file: "index.md", page: pageBySlug.get("") };
  }

  if (relative.includes("..")) return null;

  if (relative.endsWith(".md")) {
    const file = relative;
    const slug = relative.replace(/\.md$/, "");
    return { file, page: pageBySlug.get(slug) || pageByFile.get(file) };
  }

  return { file: `${relative}.md`, page: pageBySlug.get(relative) };
}

export async function loader({ request }) {
  const { pathname } = new URL(request.url);
  const resolved = resolveDoc(pathname);
  if (!resolved || !resolved.file) {
    return new Response("Not found", { status: 404 });
  }

  const fullPath = path.resolve(docsRoot, resolved.file);
  if (!fullPath.startsWith(docsRoot)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const markdown = await readFile(fullPath, "utf8");
    const html = md.render(markdown);
    return new Response(JSON.stringify({
      html,
      slug: resolved.page?.slug ?? "",
      title: resolved.page?.title ?? "Docs",
      pages: DOC_PAGES,
    }), { headers: { "content-type": "application/json; charset=utf-8" } });
  } catch (error) {
    return new Response("Not found", { status: 404 });
  }
}

export default function DocsRoute() {
  const { html, pages, slug, title } = useLoaderData();
  const location = useLocation();

  useEffect(() => {
    document.body.classList.add("allow-scroll", "docs-page");
    return () => {
      document.body.classList.remove("allow-scroll", "docs-page");
    };
  }, [location.pathname]);

  return (
    <div className="docs-shell">
      <aside className="docs-nav">
        <div className="docs-brand">Rich Wind Docs</div>
        <nav>
          {pages.map((page) => {
            const active = page.slug === slug;
            const href = page.slug ? `/docs/${page.slug}` : "/docs";
            return (
              <Link key={page.file} to={href} className={`docs-link${active ? " is-active" : ""}`}>
                {page.title}
              </Link>
            );
          })}
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
        <article
          className="docs-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </main>
    </div>
  );
}
