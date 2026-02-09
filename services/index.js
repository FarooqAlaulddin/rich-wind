import express from 'express';
import { compile, __unstable__loadDesignSystem } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'node:crypto';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();
app.disable('x-powered-by');

const MAX_BODY_BYTES = Number.parseInt(process.env.RW_MAX_BODY_BYTES ?? '100000', 10);
const MAX_HTML_CHARS = Number.parseInt(process.env.RW_MAX_HTML_CHARS ?? '50000', 10);
const MAX_CLASS_CHARS = Number.parseInt(process.env.RW_MAX_CLASS_CHARS ?? '10000', 10);
const MAX_CLASS_COUNT = Number.parseInt(process.env.RW_MAX_CLASS_COUNT ?? '1500', 10);
const MAX_ID_LENGTH = Number.parseInt(process.env.RW_MAX_ID_LENGTH ?? '64', 10);
const RATE_LIMIT_WINDOW_MS = Number.parseInt(process.env.RW_RATE_LIMIT_WINDOW_MS ?? '60000', 10);
const RATE_LIMIT_MAX = Number.parseInt(process.env.RW_RATE_LIMIT_MAX ?? '60', 10);
const RATE_LIMIT_DISABLED = process.env.RW_RATE_LIMIT_DISABLED === 'true';

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
});

app.use(express.json({ limit: MAX_BODY_BYTES }));

const rateBuckets = new Map();

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

function rateLimit(req, res, next) {
    if (RATE_LIMIT_DISABLED) return next();
    const now = Date.now();
    const ip = getClientIp(req);
    const entry = rateBuckets.get(ip);
    if (!entry || entry.resetAt <= now) {
        rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return next();
    }
    if (entry.count >= RATE_LIMIT_MAX) {
        const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
        res.setHeader('Retry-After', retryAfter);
        return res.status(429).json({ error: 'Rate limit exceeded. Slow down.' });
    }
    entry.count += 1;
    return next();
}

app.use(rateLimit);

app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Payload too large.' });
    }
    return next(err);
});

const CACHE_MAX_PAGES = Number.parseInt(process.env.RW_CACHE_MAX_PAGES ?? '200', 10);
const CACHE_TTL_MS = Number.parseInt(process.env.RW_CACHE_TTL_MS ?? '600000', 10); // 10 minutes
const PROJECT_CACHE_TTL_MS = Number.parseInt(process.env.RW_PROJECT_CACHE_TTL_MS ?? `${CACHE_TTL_MS}`, 10);

// In-memory project/page store
const projects = new Map();
const pageLru = new Map();

function makePageKey(projectId, pageId) {
    return `${projectId}::${pageId}`;
}

function touchPageKey(key) {
    if (!pageLru.has(key)) return;
    const value = pageLru.get(key);
    pageLru.delete(key);
    pageLru.set(key, value);
}

function evictPageByKey(key) {
    const meta = pageLru.get(key);
    if (!meta) return;
    pageLru.delete(key);

    const { projectId, pageId } = meta;
    const project = projects.get(projectId);
    if (!project) return;

    const page = project.pages.get(pageId);
    if (!page) return;

    for (const className of page.classes) {
        const count = project.classCounts.get(className) ?? 0;
        if (count <= 1) {
            project.classCounts.delete(className);
        } else {
            project.classCounts.set(className, count - 1);
        }
    }

    project.pages.delete(pageId);
    project.cssCache = null;

    if (project.pages.size === 0) {
        projects.delete(projectId);
    }
}

function evictIfNeeded() {
    while (pageLru.size > CACHE_MAX_PAGES) {
        const oldestKey = pageLru.keys().next().value;
        evictPageByKey(oldestKey);
    }
}

function getProject(projectId) {
    let project = projects.get(projectId);
    if (!project) {
        project = {
            id: projectId,
            pages: new Map(),
            classCounts: new Map(),
            cssCache: null
        };
        projects.set(projectId, project);
    }
    return project;
}

function normalizeClassList(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
        return input
            .flatMap(item => (typeof item === 'string' ? item.split(/\s+/) : []))
            .filter(Boolean);
    }
    if (typeof input === 'string') {
        return input.split(/\s+/).filter(Boolean);
    }
    return [];
}

function isValidId(value) {
    if (!value || typeof value !== 'string') return false;
    if (value.length > MAX_ID_LENGTH) return false;
    return /^[a-zA-Z0-9._-]+$/.test(value);
}

function hashClasses(classes) {
    return crypto.createHash('sha256').update(classes.join('|')).digest('hex');
}

function isExpired(entry) {
    return entry?.expiresAt && entry.expiresAt <= Date.now();
}

// Your existing functions
let cachedDesignSystem = null;

async function getDesignSystem() {
    if (!cachedDesignSystem) {
        const inputCss = `
            @layer theme, base, components, utilities;
            @import "tailwindcss/preflight";
            @import "tailwindcss/utilities";
            @import "tailwindcss/theme.css";
        `;

        cachedDesignSystem = await __unstable__loadDesignSystem(inputCss, {
            base: __dirname
        });
    }
    return cachedDesignSystem;
}

// Extract classes from HTML
async function extractClasses(html) {
    const designSystem = await getDesignSystem();
    const scanner = new Scanner({ sources: [] });
    
    const allCandidates = scanner.scanFiles([{
        content: html,
        extension: 'html'
    }]);
    
    const cssResults = designSystem.candidatesToCss(allCandidates);
    const validClasses = allCandidates.filter((_, i) => cssResults[i] !== null);
    
    return validClasses;
}

async function filterValidClasses(classes) {
    if (!classes.length) return [];
    const designSystem = await getDesignSystem();
    const cssResults = designSystem.candidatesToCss(classes);
    return classes.filter((_, i) => cssResults[i] !== null);
}

// Generate CSS for a set of classes
async function generateCssForClasses(classes) {
    let inputCss = '@layer theme, base, components, utilities;\n';
    inputCss += '@import "tailwindcss/preflight";\n';
    inputCss += '@import "tailwindcss/utilities";\n';
    inputCss += '@import "tailwindcss/theme.css";\n';
    
    // Add @source directives for each class
    classes.forEach(className => {
        const escaped = className.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        inputCss += `@source inline("${escaped}");\n`;
    });
    
    const compiled = await compile(inputCss, {
        base: __dirname,
        onDependency: () => {}
    });
    
    return compiled.build(classes);
}

async function resolveClassesFromInput({ html, classes }) {
    let fromHtml = [];
    if (html) {
        fromHtml = await extractClasses(html);
    }

    const fromInput = normalizeClassList(classes);
    const combined = new Set([...fromHtml, ...fromInput]);
    const classList = Array.from(combined);

    const valid = await filterValidClasses(classList);
    return valid.sort();
}

async function compileAndCachePage({ projectId, pageId, html, classes }) {
    const resolvedClasses = await resolveClassesFromInput({ html, classes });
    if (resolvedClasses.length === 0) {
        return { error: 'No valid classes found.', classes: [], css: '', status: 400 };
    }
    if (resolvedClasses.length > MAX_CLASS_COUNT) {
        return {
            error: `Too many classes (${resolvedClasses.length}). Limit is ${MAX_CLASS_COUNT}.`,
            classes: [],
            css: '',
            status: 413
        };
    }

    const now = Date.now();
    const project = getProject(projectId);
    const existing = project.pages.get(pageId);
    const classHash = hashClasses(resolvedClasses);

    if (existing && existing.hash === classHash && !isExpired(existing)) {
        existing.expiresAt = now + CACHE_TTL_MS;
        existing.updatedAt = now;
        const pageKey = makePageKey(projectId, pageId);
        touchPageKey(pageKey);
        return { css: existing.css, classes: resolvedClasses, hash: classHash, cached: true };
    }

    const css = await generateCssForClasses(resolvedClasses);
    const newClassSet = new Set(resolvedClasses);

    if (existing) {
        for (const className of existing.classes) {
            if (!newClassSet.has(className)) {
                const count = project.classCounts.get(className) ?? 0;
                if (count <= 1) {
                    project.classCounts.delete(className);
                } else {
                    project.classCounts.set(className, count - 1);
                }
            }
        }
        for (const className of newClassSet) {
            if (!existing.classes.has(className)) {
                const count = project.classCounts.get(className) ?? 0;
                project.classCounts.set(className, count + 1);
            }
        }
    } else {
        for (const className of newClassSet) {
            const count = project.classCounts.get(className) ?? 0;
            project.classCounts.set(className, count + 1);
        }
    }

    project.pages.set(pageId, {
        css,
        classes: newClassSet,
        hash: classHash,
        updatedAt: now,
        expiresAt: now + CACHE_TTL_MS
    });
    project.cssCache = null;

    const pageKey = makePageKey(projectId, pageId);
    pageLru.set(pageKey, { projectId, pageId });
    touchPageKey(pageKey);
    evictIfNeeded();

    return { css, classes: resolvedClasses, hash: classHash, cached: false };
}

function getCachedPageCss(projectId, pageId) {
    const project = projects.get(projectId);
    if (!project) return null;
    const page = project.pages.get(pageId);
    if (!page) return null;
    if (isExpired(page)) {
        evictPageByKey(makePageKey(projectId, pageId));
        return null;
    }

    page.expiresAt = Date.now() + CACHE_TTL_MS;
    touchPageKey(makePageKey(projectId, pageId));
    return page;
}

async function getProjectCss(projectId) {
    const project = projects.get(projectId);
    if (!project) return null;

    const now = Date.now();
    if (project.cssCache && !isExpired(project.cssCache)) {
        return { css: project.cssCache.css, hash: project.cssCache.hash, cached: true };
    }

    const classes = Array.from(project.classCounts.keys()).sort();
    const hash = hashClasses(classes);
    if (project.cssCache && project.cssCache.hash === hash && !isExpired(project.cssCache)) {
        project.cssCache.expiresAt = now + PROJECT_CACHE_TTL_MS;
        return { css: project.cssCache.css, hash: project.cssCache.hash, cached: true };
    }

    const css = classes.length ? await generateCssForClasses(classes) : '';
    project.cssCache = {
        css,
        hash,
        updatedAt: now,
        expiresAt: now + PROJECT_CACHE_TTL_MS
    };
    return { css, hash, cached: false };
}

// API Routes

// Compile CSS for a project/page (in-memory cache)
app.post('/api/compile', async (req, res) => {
    try {
        const projectId = req.body.projectId ?? req.body.project_id;
        const pageId = req.body.pageId ?? req.body.page_id ?? 'default';
        const { html, classes } = req.body;

        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required.' });
        }
        if (!isValidId(projectId)) {
            return res.status(400).json({ error: 'projectId must be <= 64 chars and use a-z, 0-9, ".", "-", "_".' });
        }
        if (!isValidId(pageId)) {
            return res.status(400).json({ error: 'pageId must be <= 64 chars and use a-z, 0-9, ".", "-", "_".' });
        }
        if (!html && !classes) {
            return res.status(400).json({ error: 'Either html or classes is required.' });
        }
        if (typeof html === 'string' && html.length > MAX_HTML_CHARS) {
            return res.status(413).json({ error: `html is too large. Limit is ${MAX_HTML_CHARS} chars.` });
        }
        if (typeof classes === 'string' && classes.length > MAX_CLASS_CHARS) {
            return res.status(413).json({ error: `classes is too large. Limit is ${MAX_CLASS_CHARS} chars.` });
        }

        const result = await compileAndCachePage({ projectId, pageId, html, classes });
        if (result.error) {
            return res.status(result.status || 400).json({ error: result.error });
        }

        res.json({
            success: true,
            projectId,
            pageId,
            hash: result.hash,
            classes: result.classes,
            cached: result.cached,
            css: result.css
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get cached CSS for a project/page
app.get('/api/css', (req, res) => {
    try {
        const projectId = req.query.projectId ?? req.query.project_id;
        const pageId = req.query.pageId ?? req.query.page_id ?? 'default';

        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required.' });
        }
        if (!isValidId(projectId)) {
            return res.status(400).json({ error: 'projectId must be <= 64 chars and use a-z, 0-9, ".", "-", "_".' });
        }
        if (!isValidId(pageId)) {
            return res.status(400).json({ error: 'pageId must be <= 64 chars and use a-z, 0-9, ".", "-", "_".' });
        }

        const cached = getCachedPageCss(projectId, pageId);
        if (!cached) {
            return res.status(404).json({ error: 'Cache miss. POST /api/compile with html/classes first.' });
        }

        res.type('text/css').send(cached.css);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get aggregated CSS for a project (union of cached pages)
app.get('/api/projects/:projectId/css', async (req, res) => {
    try {
        const { projectId } = req.params;
        if (!isValidId(projectId)) {
            return res.status(400).json({ error: 'projectId must be <= 64 chars and use a-z, 0-9, ".", "-", "_".' });
        }
        const project = projects.get(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found in cache.' });
        }

        const result = await getProjectCss(projectId);
        return res.type('text/css').send(result?.css ?? '');
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3001;
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
    app.listen(PORT, () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
        console.log('🧠 In-memory cache enabled (no DB).');
    });
}

export { app };
