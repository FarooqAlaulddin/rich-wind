/**
 * Express routes for the demo API.
 * JSON endpoints consumed by the Preact SPA.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import { loadDocsCatalog } from './docs-catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(__dirname, '../docs');

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

md.renderer.rules.heading_open = function (tokens, idx) {
  const token = tokens[idx];
  const tag = token.tag;
  const inline = tokens[idx + 1];
  const text = inline?.children?.map(t => t.content).join('') ?? '';
  const id = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `<${tag} id="${id}">`;
};

function wrapTables(html) {
  if (!html.includes('<table')) return html;
  return html.replace(/<table(\s[^>]*)?>/g, '<div class="table-wrapper"><table$1>').replace(/<\/table>/g, '</table></div>');
}

async function loadSections() {
  try {
    return await loadDocsCatalog(docsRoot);
  } catch {
    return {
      pages: [],
      sections: [
        { kind: 'docs', title: 'All Docs', pages: [] },
        { kind: 'review', title: 'Review', pages: [] },
        { kind: 'idea', title: 'Ideas', pages: [] },
      ],
      pageBySlug: new Map(),
      pageByFile: new Map(),
    };
  }
}

export function registerDemoRoutes(app) {
  // JSON API: docs catalog
  app.get('/api/docs/catalog', async (_req, res) => {
    try {
      const catalog = await loadSections();
      res.json({ sections: catalog.sections, pages: catalog.pages });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // JSON API: doc by slug (index)
  app.get('/api/docs/index', async (_req, res) => {
    const catalog = await loadSections();
    const page = catalog.pageBySlug.get('') || catalog.pages[0] || null;
    if (!page) return res.status(404).json({ error: 'No index doc found' });

    try {
      const fullPath = path.resolve(docsRoot, page.file);
      const markdown = await readFile(fullPath, 'utf8');
      const contentHtml = wrapTables(md.render(markdown));
      res.json({ title: page.title, contentHtml, isReview: page.isReview, isIdea: page.isIdea });
    } catch {
      res.status(404).json({ error: 'Failed to read document' });
    }
  });

  // JSON API: doc by slug
  app.get('/api/docs/:slug', async (req, res) => {
    const slug = req.params.slug;
    const catalog = await loadSections();
    const page = catalog.pageBySlug.get(slug);
    if (!page || !page.file) {
      return res.status(404).json({ error: `No doc found for slug: ${slug}` });
    }

    const fullPath = path.resolve(docsRoot, page.file);
    const relative = path.relative(docsRoot, fullPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return res.status(404).json({ error: 'Page not found' });
    }

    try {
      const markdown = await readFile(fullPath, 'utf8');
      const contentHtml = wrapTables(md.render(markdown));
      res.json({ title: page.title, contentHtml, isReview: page.isReview, isIdea: page.isIdea });
    } catch {
      res.status(404).json({ error: 'Failed to read document' });
    }
  });
}
