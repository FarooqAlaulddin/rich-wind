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

const parseIntWithDefault = (value, fallback, min = 1) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < min) return fallback;
    return parsed;
};

const MAX_BODY_BYTES = parseIntWithDefault(process.env.RW_MAX_BODY_BYTES, 100000, 1024);
const MAX_HTML_CHARS = parseIntWithDefault(process.env.RW_MAX_HTML_CHARS, 50000, 1);
const MAX_CLASS_CHARS = parseIntWithDefault(process.env.RW_MAX_CLASS_CHARS, 10000, 1);
const MAX_CLASS_COUNT = parseIntWithDefault(process.env.RW_MAX_CLASS_COUNT, 1500, 1);
const MAX_ID_LENGTH = parseIntWithDefault(process.env.RW_MAX_ID_LENGTH, 64, 1);
const SUGGEST_LIMIT = parseIntWithDefault(process.env.RW_SUGGEST_LIMIT, 100, 1);
const SUGGEST_FALLBACK_RAW = (process.env.RW_SUGGEST_FALLBACK ?? 'true').toString();
const SUGGEST_FALLBACK = ['1', 'true', 'yes'].includes(SUGGEST_FALLBACK_RAW.toLowerCase());
const RATE_LIMIT_WINDOW_MS = parseIntWithDefault(process.env.RW_RATE_LIMIT_WINDOW_MS, 60000, 1000);
const RATE_LIMIT_MAX = parseIntWithDefault(process.env.RW_RATE_LIMIT_MAX, 60, 1);
const RATE_LIMIT_DISABLED = process.env.RW_RATE_LIMIT_DISABLED === 'true';
const TRUST_PROXY_RAW = (process.env.RW_TRUST_PROXY ?? (process.env.RENDER_EXTERNAL_URL ? '1' : '0')).toString();
const TRUST_PROXY = ['1', 'true', 'yes'].includes(TRUST_PROXY_RAW.toLowerCase());

app.set('trust proxy', TRUST_PROXY);

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

// Periodic cleanup of expired rate bucket entries to prevent memory leak
const rateBucketCleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateBuckets.entries()) {
        if (entry.resetAt <= now) {
            rateBuckets.delete(ip);
        }
    }
}, RATE_LIMIT_WINDOW_MS);
// Use unref() so the interval doesn't prevent Node from exiting
rateBucketCleanup.unref();

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

const COLOR_NAMES = [
    'slate', 'gray', 'zinc', 'neutral', 'stone',
    'red', 'orange', 'amber', 'yellow', 'lime',
    'green', 'emerald', 'teal', 'cyan', 'sky',
    'blue', 'indigo', 'violet', 'purple', 'fuchsia',
    'pink', 'rose'
];
const COLOR_SCALES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const COLOR_SPECIALS = ['black', 'white', 'transparent', 'current'];
const COLOR_UTILS = ['bg', 'text', 'border', 'ring', 'from', 'via', 'to'];

const SPACING_VALUES = [
    '0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5',
    '4', '5', '6', '7', '8', '9', '10', '11', '12',
    '14', '16', '20', '24', '28', '32', '36', '40',
    '44', '48', '52', '56', '60', '64', '72', '80', '96'
];

const SPACING_PREFIXES = [
    'p-', 'px-', 'py-', 'pt-', 'pr-', 'pb-', 'pl-',
    'm-', 'mx-', 'my-', 'mt-', 'mr-', 'mb-', 'ml-',
    'gap-', 'gap-x-', 'gap-y-',
    'space-x-', 'space-y-',
    'w-', 'h-', 'min-w-', 'min-h-', 'max-w-', 'max-h-',
    'top-', 'right-', 'bottom-', 'left-',
    'inset-', 'inset-x-', 'inset-y-',
    'translate-x-', 'translate-y-'
];

const TEXT_SIZE_CLASSES = [
    'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl',
    'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl',
    'text-7xl', 'text-8xl', 'text-9xl'
];

const FONT_WEIGHT_CLASSES = [
    'font-thin', 'font-extralight', 'font-light', 'font-normal',
    'font-medium', 'font-semibold', 'font-bold', 'font-extrabold', 'font-black'
];

const SHADOW_CLASSES = [
    'shadow-none', 'shadow-sm', 'shadow', 'shadow-md', 'shadow-lg', 'shadow-xl', 'shadow-2xl', 'shadow-inner'
];

const ROUNDED_CLASSES = [
    'rounded-none', 'rounded-sm', 'rounded', 'rounded-md', 'rounded-lg',
    'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-full'
];

const LEADING_CLASSES = [
    'leading-none', 'leading-tight', 'leading-snug', 'leading-normal',
    'leading-relaxed', 'leading-loose'
];

const TRACKING_CLASSES = [
    'tracking-tighter', 'tracking-tight', 'tracking-normal', 'tracking-wide',
    'tracking-wider', 'tracking-widest'
];

const OPACITY_CLASSES = [
    'opacity-0', 'opacity-5', 'opacity-10', 'opacity-20', 'opacity-25',
    'opacity-30', 'opacity-40', 'opacity-50', 'opacity-60', 'opacity-70',
    'opacity-75', 'opacity-80', 'opacity-90', 'opacity-95', 'opacity-100'
];

const Z_CLASSES = [
    'z-0', 'z-10', 'z-20', 'z-30', 'z-40', 'z-50'
];

const KEYWORD_CLASSES = [
    'flex', 'inline-flex', 'grid', 'inline-grid', 'block', 'inline-block', 'hidden',
    'items-start', 'items-center', 'items-end',
    'justify-start', 'justify-center', 'justify-end', 'justify-between',
    'content-start', 'content-center', 'content-end', 'content-between',
    'flex-row', 'flex-col', 'flex-wrap', 'flex-nowrap',
    'overflow-hidden', 'overflow-auto', 'overflow-scroll',
    'text-left', 'text-center', 'text-right',
    'uppercase', 'lowercase', 'capitalize', 'normal-case'
];

const COLOR_CLASS_MAP = COLOR_UTILS.reduce((acc, util) => {
    const list = [];
    for (const name of COLOR_NAMES) {
        for (const scale of COLOR_SCALES) {
            list.push(`${util}-${name}-${scale}`);
        }
    }
    for (const special of COLOR_SPECIALS) {
        list.push(`${util}-${special}`);
    }
    acc[util] = list;
    return acc;
}, {});

const SPACING_CLASS_MAP = SPACING_PREFIXES.reduce((acc, prefix) => {
    acc[prefix] = SPACING_VALUES.map((value) => `${prefix}${value}`);
    return acc;
}, {});

function splitVariantPrefix(prefix = '') {
    const idx = prefix.lastIndexOf(':');
    if (idx === -1) return { variant: '', base: prefix };
    return { variant: prefix.slice(0, idx + 1), base: prefix.slice(idx + 1) };
}

function getFallbackSuggestions(prefix) {
    const { variant, base } = splitVariantPrefix(prefix);
    if (!base) return [];

    const suggestions = [];
    const addList = (list) => {
        for (const item of list) {
            if (item.startsWith(base)) {
                suggestions.push(`${variant}${item}`);
            }
        }
    };

    if (base.startsWith('bg-')) addList(COLOR_CLASS_MAP.bg);
    if (base.startsWith('text-')) addList([...TEXT_SIZE_CLASSES, ...COLOR_CLASS_MAP.text]);
    if (base.startsWith('border-')) addList([...COLOR_CLASS_MAP.border, 'border', 'border-0', 'border-2', 'border-4', 'border-8']);
    if (base.startsWith('ring-')) addList([...COLOR_CLASS_MAP.ring, 'ring', 'ring-0', 'ring-1', 'ring-2', 'ring-4', 'ring-8']);
    if (base.startsWith('from-')) addList(COLOR_CLASS_MAP.from);
    if (base.startsWith('via-')) addList(COLOR_CLASS_MAP.via);
    if (base.startsWith('to-')) addList(COLOR_CLASS_MAP.to);

    for (const prefixKey of Object.keys(SPACING_CLASS_MAP)) {
        if (base.startsWith(prefixKey)) {
            addList(SPACING_CLASS_MAP[prefixKey]);
        }
    }

    if (base.startsWith('rounded')) addList(ROUNDED_CLASSES);
    if (base.startsWith('shadow')) addList(SHADOW_CLASSES);
    if (base.startsWith('font-')) addList(FONT_WEIGHT_CLASSES);
    if (base.startsWith('leading-')) addList(LEADING_CLASSES);
    if (base.startsWith('tracking-')) addList(TRACKING_CLASSES);
    if (base.startsWith('opacity-')) addList(OPACITY_CLASSES);
    if (base.startsWith('z-')) addList(Z_CLASSES);

    if (!suggestions.length) {
        addList(KEYWORD_CLASSES);
    }

    return suggestions;
}

let cachedClassList = null;

async function getTailwindClassList() {
    if (cachedClassList) return cachedClassList;
    const designSystem = await getDesignSystem();
    cachedClassList = designSystem.getClassList().map(([name]) => name);
    return cachedClassList;
}

async function getStaticClassSuggestions(prefix) {
    const { variant, base } = splitVariantPrefix(prefix);
    if (!base) return [];
    const list = await getTailwindClassList();
    const matches = [];
    for (const item of list) {
        if (item.startsWith(base)) {
            matches.push(`${variant}${item}`);
        }
    }
    return matches;
}

function getProjectSuggestionList(projectId) {
    const project = projects.get(projectId);
    if (!project) return [];
    return Array.from(project.classCounts.entries())
        .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
        .map(([name]) => name);
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

// Suggest Tailwind classes based on cached project data and/or input
app.post('/api/suggest', async (req, res) => {
    try {
        const projectId = req.body.projectId ?? req.body.project_id ?? null;
        const prefix = typeof req.body.prefix === 'string' ? req.body.prefix.trim() : '';
        const limitRaw = req.body.limit ?? req.body.max ?? req.body.count;
        const limit = Math.min(parseIntWithDefault(limitRaw, SUGGEST_LIMIT, 1), SUGGEST_LIMIT);
        const includeInput = normalizeClassList(req.body.classes);

        if (projectId && !isValidId(projectId)) {
            return res.status(400).json({ error: 'projectId must be <= 64 chars and use a-z, 0-9, ".", "-", "_".' });
        }

    const suggestions = new Map();

        const pushList = (list) => {
            for (const item of list) {
                if (!item) continue;
                if (prefix && !item.startsWith(prefix)) continue;
                if (!suggestions.has(item)) {
                    suggestions.set(item, true);
                    if (suggestions.size >= limit) return true;
                }
            }
            return false;
        };

        if (includeInput.length) {
            if (pushList(includeInput)) {
                return res.json({
                    success: true,
                    projectId,
                    prefix,
                    count: suggestions.size,
                    suggestions: Array.from(suggestions.keys())
                });
            }
        }

        if (projectId) {
            if (pushList(getProjectSuggestionList(projectId))) {
                return res.json({
                    success: true,
                    projectId,
                    prefix,
                    count: suggestions.size,
                    suggestions: Array.from(suggestions.keys())
                });
            }
        }

        if (SUGGEST_FALLBACK && prefix) {
            const staticList = await getStaticClassSuggestions(prefix);
            if (!staticList.length) {
                pushList(getFallbackSuggestions(prefix));
            } else {
                pushList(staticList);
            }
        }

        return res.json({
            success: true,
            projectId,
            prefix,
            count: suggestions.size,
            suggestions: Array.from(suggestions.keys())
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Error handler middleware (must be defined after all routes)
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Payload too large.' });
    }
    return next(err);
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
