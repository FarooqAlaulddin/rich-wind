// Checks a built docs site (the GitHub Pages output of docs/): every page uses
// the docs layout, and every internal link, script, stylesheet and #anchor
// resolves. Usage: node scripts/check-docs-site.mjs <site-dir> [base-path]
// The base path defaults to the prefix of the stylesheet link in index.html.
import fs from 'node:fs';
import path from 'node:path';

const siteDir = path.resolve(process.argv[2] || '_site');
const indexHtml = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');
const detected = indexHtml.match(/href="([^"]*)\/assets\/css\/site\.css"/)?.[1] ?? '';
const basePath = (process.argv[3] ?? detected).replace(/\/+$/, '');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const pages = walk(siteDir).filter((file) => file.endsWith('.html'));
const ids = new Map();
const idsOf = (file) => {
  if (!ids.has(file)) {
    const html = fs.readFileSync(file, 'utf8');
    ids.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return ids.get(file);
};

const problems = [];
for (const page of pages) {
  const rel = path.relative(siteDir, page);
  const html = fs.readFileSync(page, 'utf8');
  if (!html.includes('class="sidebar"')) problems.push(`${rel}: page does not use the docs layout`);
  if (!/<title>[^<]+<\/title>/.test(html)) problems.push(`${rel}: missing <title>`);

  for (const [, attr] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|data:|\/\/)/.test(attr)) continue;
    const [target, anchor] = attr.split('#');
    let file;
    if (!target) {
      file = page;
    } else if (target.startsWith('/')) {
      if (basePath && !target.startsWith(`${basePath}/`) && target !== basePath) {
        problems.push(`${rel}: ${attr} is outside the base path ${basePath}`);
        continue;
      }
      file = path.join(siteDir, target.slice(basePath.length));
    } else {
      file = path.resolve(path.dirname(page), target);
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      problems.push(`${rel}: broken link ${attr}`);
      continue;
    }
    if (anchor && file.endsWith('.html') && !idsOf(file).has(decodeURIComponent(anchor))) {
      problems.push(`${rel}: missing anchor ${attr}`);
    }
  }
}

if (pages.length === 0) problems.push(`no HTML pages found in ${siteDir}`);

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s) in ${pages.length} page(s).`);
  process.exit(1);
}
console.log(`Docs site OK: ${pages.length} pages, all internal links and anchors resolve.`);
