import express from 'express';
import { compile, __unstable__loadDesignSystem } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// Configuration + state helpers
// =============================================================================
const parseIntWithDefault = (value, fallback, min = 1) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < min) return fallback;
    return parsed;
};

const parseBoolean = (value, fallback = false) => {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
    return fallback;
};

const parseCorsOrigin = (value) => {
    if (value === undefined || value === null) return null;
    const tokens = (Array.isArray(value) ? value : [value])
        .flatMap((part) => String(part).split(','))
        .map((part) => part.trim())
        .filter(Boolean);
    if (tokens.length === 0) return null;
    if (
        tokens.length === 1 &&
        ['0', 'false', 'off', 'none', 'disabled'].includes(tokens[0].toLowerCase())
    ) {
        return null;
    }
    if (tokens.includes('*')) return '*';
    return Array.from(new Set(tokens));
};

const resolveCorsOrigin = (corsOrigin, requestOrigin) => {
    if (!corsOrigin) return null;
    if (corsOrigin === '*') return '*';
    if (typeof requestOrigin !== 'string' || !requestOrigin) return null;
    return corsOrigin.includes(requestOrigin) ? requestOrigin : null;
};

const appendVaryHeader = (existingValue, nextToken) => {
    const existing = String(existingValue || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    const lowerToken = nextToken.toLowerCase();
    if (!existing.some((t) => t.toLowerCase() === lowerToken)) existing.push(nextToken);
    return existing.join(', ');
};

const NODE_ROLES = new Set(['hybrid', 'writer', 'reader']);
const READ_ONLY_ERROR_CODE = 'READ_ONLY_REPLICA';
export const ERROR_CODES = Object.freeze([
    'INVALID_ID', 'MISSING_INPUT', 'INVALID_BODY', 'UNSUPPORTED_MEDIA_TYPE',
    'PAYLOAD_TOO_LARGE', 'READ_ONLY_REPLICA', 'RATE_LIMITED', 'SERVER_BUSY',
    'UNAUTHORIZED', 'FORBIDDEN', 'REQUEST_BLOCKED', 'NOT_FOUND', 'INTERNAL'
]);

export class RichWindError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = 'RichWindError';
        this.status = status;
        this.code = code;
    }
}

function sendError(res, status, code, error) {
    return res.status(status).json({ error, code });
}

function guardErrorCode(status) {
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 429) return 'RATE_LIMITED';
    return 'REQUEST_BLOCKED';
}

function defaultErrorCode(status) {
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'READ_ONLY_REPLICA';
    if (status === 413) return 'PAYLOAD_TOO_LARGE';
    if (status === 415) return 'UNSUPPORTED_MEDIA_TYPE';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'INTERNAL';
    return 'INVALID_BODY';
}

// Pre-compiled regex constants
const VALID_ID_RE = /^[a-zA-Z0-9._-]+$/;
const CSS_HEADER_RE = /^\/\*![\s\S]*?\*\/\n@layer[^;]*;\n/;
const THEME_BLOCK_RE = /:root, :host\s*\{[\s\S]*?\}\n?/g;
const LAYER_DECL_RE = /@layer[^;]*;/;
const ESCAPE_BACKSLASH_RE = /\\/g;
const ESCAPE_QUOTE_RE = /"/g;
// Reject characters that could break out of @source inline("...") directives
const UNSAFE_CLASS_CHAR_RE = /[(){};,\n\r\0]/;

function normalizeNodeRole(value) {
    if (typeof value !== 'string') return 'hybrid';
    const normalized = value.trim().toLowerCase();
    if (normalized === 'read') return 'reader';
    if (normalized === 'write') return 'writer';
    return NODE_ROLES.has(normalized) ? normalized : 'hybrid';
}

function createReadOnlyError(action) {
    const error = new Error(`"${action}" is not allowed on read-only replicas.`);
    error.code = READ_ONLY_ERROR_CODE;
    error.action = action;
    return error;
}

function buildConfig(overrides = {}) {
    const cacheTtlMs = parseIntWithDefault(
        overrides.cacheTtlMs ?? process.env.RW_CACHE_TTL_MS,
        600000,
        0
    );
    return {
        maxBodyBytes: parseIntWithDefault(
            overrides.maxBodyBytes ?? process.env.RW_MAX_BODY_BYTES,
            100000,
            1024
        ),
        maxHtmlChars: parseIntWithDefault(
            overrides.maxHtmlChars ?? process.env.RW_MAX_HTML_CHARS,
            50000,
            1
        ),
        maxClassChars: parseIntWithDefault(
            overrides.maxClassChars ?? process.env.RW_MAX_CLASS_CHARS,
            10000,
            1
        ),
        maxClassCount: parseIntWithDefault(
            overrides.maxClassCount ?? process.env.RW_MAX_CLASS_COUNT,
            1500,
            1
        ),
        maxIdLength: parseIntWithDefault(
            overrides.maxIdLength ?? process.env.RW_MAX_ID_LENGTH,
            64,
            1
        ),
        suggestLimit: parseIntWithDefault(
            overrides.suggestLimit ?? process.env.RW_SUGGEST_LIMIT,
            100,
            1
        ),
        suggestFallback: parseBoolean(
            overrides.suggestFallback ?? process.env.RW_SUGGEST_FALLBACK,
            true
        ),
        trustProxy: parseBoolean(
            overrides.trustProxy ?? process.env.RW_TRUST_PROXY,
            false
        ),
        cacheMaxPages: parseIntWithDefault(
            overrides.cacheMaxPages ?? process.env.RW_CACHE_MAX_PAGES,
            200,
            1
        ),
        cacheTtlMs,
        projectCacheTtlMs: parseIntWithDefault(
            overrides.projectCacheTtlMs ?? process.env.RW_PROJECT_CACHE_TTL_MS,
            cacheTtlMs,
            0
        ),
        corsOrigin: parseCorsOrigin(
            overrides.corsOrigin ?? process.env.RW_CORS_ORIGIN
        ),
        maxCssChars: parseIntWithDefault(
            overrides.maxCssChars ?? process.env.RW_MAX_CSS_CHARS,
            2000000,
            1
        ),
        nodeRole: normalizeNodeRole(
            overrides.nodeRole ?? process.env.RW_NODE_ROLE
        )
    };
}

function createCacheState() {
    return {
        projects: new Map(),
        pageLru: new Map()
    };
}

function getClientIp(req) {
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

// =============================================================================
// In-memory cache helpers (per-core instance)
// =============================================================================
function makePageKey(projectId, pageId) {
    return `${projectId}::${pageId}`;
}

function createAsyncTaskQueue() {
    let pendingCount = 0;
    const waiters = new Set();

    const flushWaiters = () => {
        if (pendingCount !== 0) return;
        for (const resolve of waiters) resolve();
        waiters.clear();
    };

    return {
        queue(taskFactory) {
            pendingCount += 1;
            queueMicrotask(() => {
                Promise.resolve()
                    .then(taskFactory)
                    .catch(() => {})
                    .finally(() => {
                        pendingCount -= 1;
                        flushWaiters();
                    });
            });
        },
        drain() {
            if (pendingCount === 0) return Promise.resolve();
            return new Promise((resolve) => waiters.add(resolve));
        }
    };
}

function touchPageKey(state, key) {
    if (!state.pageLru.has(key)) return;
    const value = state.pageLru.get(key);
    state.pageLru.delete(key);
    state.pageLru.set(key, value);
}

function evictPageByKey(state, key) {
    const meta = state.pageLru.get(key);
    if (!meta) return;
    state.pageLru.delete(key);

    const { projectId, pageId } = meta;
    const project = state.projects.get(projectId);
    if (!project) return;

    const page = project.pages.get(pageId);
    if (!page) return;

    updateClassCounts(project, page.classes, new Set());

    project.pages.delete(pageId);
    clearProjectAggregateCache(project);

    if (project.pages.size === 0) {
        state.projects.delete(projectId);
    }
}

function evictIfNeeded(state, config) {
    while (state.pageLru.size > config.cacheMaxPages) {
        const oldestKey = state.pageLru.keys().next().value;
        evictPageByKey(state, oldestKey);
    }
}

function getProject(state, projectId) {
    let project = state.projects.get(projectId);
    if (!project) {
        project = {
            id: projectId,
            pages: new Map(),
            classCounts: new Map(),
            cssCache: null,
            utilitiesCssCache: null,
            themeCssCache: null
        };
        state.projects.set(projectId, project);
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

function isValidId(value, config) {
    if (!value || typeof value !== 'string') return false;
    if (value.length > config.maxIdLength) return false;
    return VALID_ID_RE.test(value);
}

function hashClasses(classes) {
    return crypto.createHash('sha256').update(classes.join('|')).digest('hex');
}

function isExpired(entry) {
    return entry?.expiresAt && entry.expiresAt <= Date.now();
}

// Singleflight: coalesce concurrent compile calls for identical class sets
const compileInflight = new Map();
function coalesceCompile(key, fn) {
    const existing = compileInflight.get(key);
    if (existing) return existing;
    const promise = fn().finally(() => compileInflight.delete(key));
    compileInflight.set(key, promise);
    return promise;
}

function normalizeTimestamp(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

function classSetEquals(a = new Set(), b = new Set()) {
    if (a.size !== b.size) return false;
    for (const value of a) {
        if (!b.has(value)) return false;
    }
    return true;
}

function updateClassCounts(project, prev = new Set(), next = new Set()) {
    for (const className of prev) {
        if (next.has(className)) continue;
        const count = project.classCounts.get(className) ?? 0;
        if (count <= 1) {
            project.classCounts.delete(className);
        } else {
            project.classCounts.set(className, count - 1);
        }
    }
    for (const className of next) {
        if (prev.has(className)) continue;
        const count = project.classCounts.get(className) ?? 0;
        project.classCounts.set(className, count + 1);
    }
}

function clearProjectAggregateCache(project) {
    project.cssCache = null;
    project.utilitiesCssCache = null;
    project.themeCssCache = null;
}

function normalizeHydratedClasses(input, config) {
    if (input === undefined || input === null) return null;
    if (!Array.isArray(input) && typeof input !== 'string') return null;
    const normalized = Array.from(new Set(normalizeClassList(input))).sort();
    if (normalized.length > config.maxClassCount) return null;
    return normalized;
}

function sanitizePageArtifact(artifact, config, now = Date.now()) {
    if (!artifact || typeof artifact !== 'object') return null;
    if (typeof artifact.css !== 'string') return null;
    if (artifact.css.length > config.maxCssChars) return null;

    const expiresAt = normalizeTimestamp(artifact.expiresAt, now + config.cacheTtlMs);
    if (expiresAt <= now) return null;

    const classesProvided = artifact.classes !== undefined && artifact.classes !== null;
    const classes = normalizeHydratedClasses(artifact.classes, config);
    if (classesProvided && classes === null) return null;

    const hash = Array.isArray(classes)
        ? hashClasses(classes)
        : (typeof artifact.hash === 'string' && artifact.hash ? artifact.hash : null);
    return {
        css: artifact.css,
        classes,
        hash,
        updatedAt: normalizeTimestamp(artifact.updatedAt, now),
        expiresAt,
        source: typeof artifact.source === 'string' ? artifact.source : null
    };
}

function sanitizeProjectArtifact(artifact, config, now = Date.now()) {
    if (!artifact || typeof artifact !== 'object') return null;
    if (typeof artifact.css !== 'string') return null;
    if (artifact.css.length > config.maxCssChars) return null;

    const expiresAt = normalizeTimestamp(artifact.expiresAt, now + config.projectCacheTtlMs);
    if (expiresAt <= now) return null;

    const hash =
        artifact.hash === null || artifact.hash === undefined
            ? null
            : (typeof artifact.hash === 'string' ? artifact.hash : null);
    if (artifact.hash !== undefined && artifact.hash !== null && hash === null) {
        return null;
    }

    return {
        css: artifact.css,
        hash,
        updatedAt: normalizeTimestamp(artifact.updatedAt, now),
        expiresAt,
        source: typeof artifact.source === 'string' ? artifact.source : null
    };
}

function hydratePageFromArtifact(state, config, projectId, pageId, bundle, sanitizedArtifact, options = {}) {
    const requireClasses = Boolean(options.requireClasses);
    const normalizedBundle = normalizeBundle(bundle);
    if (normalizedBundle === 'base') return false;

    const project = getProject(state, projectId);
    let page = project.pages.get(pageId);
    const hasClasses = Array.isArray(sanitizedArtifact.classes);

    if (requireClasses && !hasClasses) {
        return false;
    }
    if (!page && !hasClasses) {
        return false;
    }

    if (!page) {
        page = {
            css: null,
            utilitiesCss: null,
            themeCss: null,
            classes: new Set(),
            hash: '',
            updatedAt: sanitizedArtifact.updatedAt,
            expiresAt: sanitizedArtifact.expiresAt
        };
        project.pages.set(pageId, page);
    }

    if (hasClasses) {
        const nextClasses = new Set(sanitizedArtifact.classes);
        const nextHash = sanitizedArtifact.hash || hashClasses(sanitizedArtifact.classes);
        const prevClasses = page.classes || new Set();

        if (!classSetEquals(prevClasses, nextClasses) || page.hash !== nextHash) {
            updateClassCounts(project, prevClasses, nextClasses);
            clearProjectAggregateCache(project);
        }
        page.classes = nextClasses;
        page.hash = nextHash;
    }

    if (normalizedBundle === 'full') {
        page.css = sanitizedArtifact.css;
    } else if (normalizedBundle === 'utilities') {
        page.utilitiesCss = sanitizedArtifact.css;
    } else if (normalizedBundle === 'theme') {
        page.themeCss = sanitizedArtifact.css;
    }

    page.updatedAt = sanitizedArtifact.updatedAt;
    page.expiresAt = sanitizedArtifact.expiresAt;

    const pageKey = makePageKey(projectId, pageId);
    state.pageLru.set(pageKey, { projectId, pageId });
    evictIfNeeded(state, config);

    return true;
}

function createCacheStoreRunner(cacheStore, options = {}) {
    const defaultTimeout = parseIntWithDefault(
        options.timeoutMs ?? process.env.RW_CACHE_STORE_TIMEOUT_MS,
        150,
        1
    );
    const onError = typeof options.onError === 'function' ? options.onError : null;
    const store = cacheStore && typeof cacheStore === 'object' ? cacheStore : null;
    const missingMethodOps = new Set();
    const hasMethod = (op) => Boolean(store && typeof store[op] === 'function');

    const withTimeout = (promise, method) => {
        if (!defaultTimeout || defaultTimeout <= 0) return promise;
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
                const error = new Error(`Cache store timeout after ${defaultTimeout}ms`);
                error.code = 'CACHE_STORE_TIMEOUT';
                error.method = method;
                reject(error);
            }, defaultTimeout);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    };

    const reportError = async (error, op, input) => {
        if (!onError) return;
        await onError({
            error,
            stage: 'cache-store',
            op,
            timedOut: Boolean(error && error.code === 'CACHE_STORE_TIMEOUT'),
            context: {
                projectId: input?.projectId ?? null,
                pageId: input?.pageId ?? null,
                bundle: input?.bundle ?? null,
                pluginName: input?.pluginName ?? null,
                key: input?.key ?? null,
                prefix: input?.prefix ?? null
            }
        });
    };

    const reportMissingMethod = async (op, input) => {
        if (missingMethodOps.has(op)) return;
        missingMethodOps.add(op);
        const error = new Error(`cacheStore.${op} is not implemented`);
        error.code = 'CACHE_STORE_METHOD_MISSING';
        error.method = op;
        await reportError(error, op, input);
    };

    const read = async (op, input) => {
        if (!hasMethod(op)) {
            await reportMissingMethod(op, input);
            return null;
        }
        const fn = store[op];
        try {
            return await withTimeout(Promise.resolve(fn(input)), op);
        } catch (error) {
            await reportError(error, op, input);
            return null;
        }
    };

    const write = async (op, input) => {
        if (!hasMethod(op)) {
            await reportMissingMethod(op, input);
            return false;
        }
        const fn = store[op];
        try {
            await withTimeout(Promise.resolve(fn(input)), op);
            return true;
        } catch (error) {
            await reportError(error, op, input);
            return false;
        }
    };

    return {
        enabled: Boolean(store),
        hasMethod,
        readPageArtifact: (input) => read('readPageArtifact', input),
        upsertPageArtifact: (input) => write('upsertPageArtifact', input),
        deletePageArtifact: (input) => write('deletePageArtifact', input),
        deleteProjectPageArtifacts: (input) => write('deleteProjectPageArtifacts', input),
        readProjectArtifact: (input) => read('readProjectArtifact', input),
        upsertProjectArtifact: (input) => write('upsertProjectArtifact', input),
        deleteProjectArtifact: (input) => write('deleteProjectArtifact', input),
        readPluginData: (input) => read('readPluginData', input),
        writePluginData: (input) => write('writePluginData', input),
        deletePluginData: (input) => write('deletePluginData', input),
        listPluginData: (input) => read('listPluginData', input)
    };
}

// =============================================================================
// Tailwind suggestion data (loaded from JSON)
// =============================================================================
const SUGGESTIONS_PATH = path.join(__dirname, 'tailwind-suggestions.json');
let cachedSuggestionData = null;
let cachedSuggestionIndex = null;

function loadSuggestionData() {
    if (cachedSuggestionData) return cachedSuggestionData;
    try {
        const raw = fs.readFileSync(SUGGESTIONS_PATH, 'utf8');
        cachedSuggestionData = JSON.parse(raw);
        return cachedSuggestionData;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load Tailwind suggestion data: ${message}`);
    }
}

function buildSuggestionIndex(data) {
    const colorClassMap = data.colorUtilities.reduce((acc, util) => {
        const list = [];
        for (const name of data.colorNames) {
            for (const scale of data.colorScales) {
                list.push(`${util}-${name}-${scale}`);
            }
        }
        for (const special of data.colorSpecials) {
            list.push(`${util}-${special}`);
        }
        acc[util] = list;
        return acc;
    }, {});

    const spacingClassMap = data.spacingPrefixes.reduce((acc, prefix) => {
        acc[prefix] = data.spacingValues.map((value) => `${prefix}${value}`);
        return acc;
    }, {});

    return { data, colorClassMap, spacingClassMap };
}

function getSuggestionIndex() {
    if (!cachedSuggestionIndex) {
        cachedSuggestionIndex = buildSuggestionIndex(loadSuggestionData());
    }
    return cachedSuggestionIndex;
}

// =============================================================================
// Suggestion logic
// =============================================================================
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

    const { data, colorClassMap, spacingClassMap } = getSuggestionIndex();

    if (base.startsWith('bg-')) addList(colorClassMap.bg);
    if (base.startsWith('text-')) addList([...data.textSizes, ...colorClassMap.text]);
    if (base.startsWith('border-')) addList([...colorClassMap.border, 'border', 'border-0', 'border-2', 'border-4', 'border-8']);
    if (base.startsWith('ring-')) addList([...colorClassMap.ring, 'ring', 'ring-0', 'ring-1', 'ring-2', 'ring-4', 'ring-8']);
    if (base.startsWith('from-')) addList(colorClassMap.from);
    if (base.startsWith('via-')) addList(colorClassMap.via);
    if (base.startsWith('to-')) addList(colorClassMap.to);

    for (const prefixKey of Object.keys(spacingClassMap)) {
        if (base.startsWith(prefixKey)) {
            addList(spacingClassMap[prefixKey]);
        }
    }

    if (base.startsWith('rounded')) addList(data.rounded);
    if (base.startsWith('shadow')) addList(data.shadows);
    if (base.startsWith('font-')) addList(data.fontWeights);
    if (base.startsWith('leading-')) addList(data.leading);
    if (base.startsWith('tracking-')) addList(data.tracking);
    if (base.startsWith('opacity-')) addList(data.opacity);
    if (base.startsWith('z-')) addList(data.z);

    if (!suggestions.length) {
        addList(data.keywords);
    }

    return suggestions;
}

let cachedClassList = null;

// =============================================================================
// Tailwind design system + compilation
// =============================================================================
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

function getProjectSuggestionList(state, projectId) {
    const project = state.projects.get(projectId);
    if (!project) return [];
    return Array.from(project.classCounts.entries())
        .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
        .map(([name]) => name);
}

let cachedDesignSystem = null;
let cachedBaseCss = null;

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

async function validateExplicitClasses(classes) {
    const tokens = normalizeClassList(classes);
    if (tokens.length === 0) return { valid: [], rejected: [] };

    const designSystem = await getDesignSystem();
    const cssResults = designSystem.candidatesToCss(tokens);
    const valid = [];
    const rejected = [];
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (UNSAFE_CLASS_CHAR_RE.test(token) || cssResults[index] === null) rejected.push(token);
        else valid.push(token);
    }
    return {
        valid: Array.from(new Set(valid)),
        rejected: Array.from(new Set(rejected)).sort()
    };
}

function stampCss(css) {
    const stamp = '/*! managed by rich-wind */';
    return css.replace(/(\/\*! tailwindcss[^*]*\*\/)/, `$1\n${stamp}`);
}

// Generate CSS for a set of classes
async function generateCssForClasses(classes) {
    const parts = [
        '@layer theme, base, components, utilities;',
        '@import "tailwindcss/preflight";',
        '@import "tailwindcss/utilities";',
        '@import "tailwindcss/theme.css";'
    ];
    for (const className of classes) {
        if (UNSAFE_CLASS_CHAR_RE.test(className)) continue;
        const escaped = className.replace(ESCAPE_BACKSLASH_RE, '\\\\').replace(ESCAPE_QUOTE_RE, '\\"');
        parts.push(`@source inline("${escaped}");`);
    }
    const inputCss = parts.join('\n') + '\n';

    const compiled = await compile(inputCss, {
        base: __dirname,
        onDependency: () => {}
    });

    return stampCss(compiled.build(classes));
}

// =============================================================================
// Bundle splitting (theme vs utilities)
// =============================================================================
function splitThemeUtilitiesCss(css = '') {
    const headerMatch = css.match(CSS_HEADER_RE);
    const header = headerMatch ? headerMatch[0] : '';
    const body = headerMatch ? css.slice(header.length) : css;
    const themeBlocks = body.match(THEME_BLOCK_RE) || [];
    const themeBody = themeBlocks.join('\n').trim();
    const utilitiesBody = body.replace(THEME_BLOCK_RE, '').trim();
    const themeHeader = header ? header.replace(LAYER_DECL_RE, '@layer theme;') : '';
    const utilitiesHeader = header ? header.replace(LAYER_DECL_RE, '@layer utilities;') : '';

    return {
        themeCss: `${themeHeader}${themeBody ? `\n${themeBody}` : ''}`.trim(),
        utilitiesCss: `${utilitiesHeader}${utilitiesBody ? `\n${utilitiesBody}` : ''}`.trim()
    };
}

async function generateThemeUtilitiesForClasses(classes) {
    const parts = [
        '@layer theme, utilities;',
        '@import "tailwindcss/utilities";',
        '@import "tailwindcss/theme.css";'
    ];
    for (const className of classes) {
        if (UNSAFE_CLASS_CHAR_RE.test(className)) continue;
        const escaped = className.replace(ESCAPE_BACKSLASH_RE, '\\\\').replace(ESCAPE_QUOTE_RE, '\\"');
        parts.push(`@source inline("${escaped}");`);
    }
    const inputCss = parts.join('\n') + '\n';

    const compiled = await compile(inputCss, {
        base: __dirname,
        onDependency: () => {}
    });

    const css = stampCss(compiled.build(classes));
    return splitThemeUtilitiesCss(css);
}

async function generateBaseCss() {
    if (cachedBaseCss) return cachedBaseCss;
    const inputCss = '@layer base;\n@import "tailwindcss/preflight";\n';
    const compiled = await compile(inputCss, {
        base: __dirname,
        onDependency: () => {}
    });
    cachedBaseCss = stampCss(compiled.build([]));
    return cachedBaseCss;
}

// =============================================================================
// Input normalization + compile orchestration
// =============================================================================
function normalizeBundle(value) {
    if (!value) return 'full';
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'base') return 'base';
    if (normalized === 'theme') return 'theme';
    if (normalized === 'utilities') return 'utilities';
    return 'full';
}

const RICH_WIND_LOADER_JS = `(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) {
    var scripts = document.getElementsByTagName('script');
    script = scripts[scripts.length - 1] || null;
  }

  function getAttr(name, fallback) {
    if (!script) return fallback;
    var value = script.getAttribute(name);
    return value === null || value === '' ? fallback : value;
  }

  function trimTrailingSlash(value) {
    return String(value || '').replace(/\\/+$/, '');
  }

  function inferCoreUrl() {
    var globalConfig = window.RichWind || {};
    var explicit = getAttr('data-core-url', globalConfig.coreUrl || '');
    if (explicit) return trimTrailingSlash(explicit);
    if (!script || !script.src) return '';

    try {
      var url = new URL(script.src, window.location.href);
      url.pathname = url.pathname.replace(/\\/[^/]*$/, '');
      url.search = '';
      url.hash = '';
      return trimTrailingSlash(url.href);
    } catch (error) {
      return '';
    }
  }

  function encode(value) {
    return encodeURIComponent(String(value || ''));
  }

  function addStylesheet(href) {
    if (!href || !document.head) return;
    var links = document.getElementsByTagName('link');
    for (var i = 0; i < links.length; i += 1) {
      if (links[i].rel === 'stylesheet' && links[i].href === href) return;
    }

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-rich-wind', 'true');
    document.head.appendChild(link);
  }

  function removeScripts(root) {
    var scripts = root.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i += 1) {
      if (scripts[i].parentNode) scripts[i].parentNode.removeChild(scripts[i]);
    }
  }

  var globalConfig = window.RichWind || {};
  var coreUrl = inferCoreUrl();
  var projectId = getAttr('data-project-id', globalConfig.projectId || '');
  var pageId = getAttr('data-page-id', globalConfig.pageId || 'default');
  var bundle = getAttr('data-bundle', 'utilities');
  var shouldCompile = getAttr('data-compile', 'true') !== 'false';

  if (!coreUrl || !projectId) return;

  var encodedProjectId = encode(projectId);
  addStylesheet(coreUrl + '/api/css?projectId=' + encodedProjectId + '&bundle=base');
  addStylesheet(coreUrl + '/api/projects/' + encodedProjectId + '/css?bundle=theme');
  addStylesheet(coreUrl + '/plugins/auto-promote/css/' + encodedProjectId);

  function compilePage() {
    if (!shouldCompile || !document.body || !window.fetch) return;

    var body = document.body.cloneNode(true);
    removeScripts(body);

    window.fetch(coreUrl + '/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: projectId,
        pageId: pageId || 'default',
        html: body.innerHTML,
        bundle: bundle
      })
    })
      .then(function (response) {
        if (!response.ok) throw new Error('Rich Wind compile failed');
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.css || !document.head) return;
        var style = document.createElement('style');
        style.setAttribute('data-rich-wind', 'utilities');
        style.textContent = data.css;
        document.head.appendChild(style);
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', compilePage);
  } else {
    compilePage();
  }
}());
`;

const RICH_WIND_RELOAD_JS = `(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) {
    var scripts = document.getElementsByTagName('script');
    script = scripts[scripts.length - 1] || null;
  }

  function getAttr(name, fallback) {
    if (!script) return fallback;
    var value = script.getAttribute(name);
    return value === null || value === '' ? fallback : value;
  }

  function addStyles() {
    if (!document.head || document.getElementById('rich-wind-reload-style')) return;

    var style = document.createElement('style');
    style.id = 'rich-wind-reload-style';
    style.textContent = [
      '.rich-wind-reload-button {',
      '  position: fixed;',
      '  right: max(16px, env(safe-area-inset-right));',
      '  bottom: max(16px, env(safe-area-inset-bottom));',
      '  z-index: 2147483647;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '  min-height: 40px;',
      '  padding: 9px 13px;',
      '  border: 1px solid rgba(255, 255, 255, 0.22);',
      '  border-radius: 999px;',
      '  background: rgba(17, 24, 39, 0.94);',
      '  color: #fff;',
      '  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.28);',
      '  font: 600 13px/1.1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
      '  letter-spacing: 0;',
      '  cursor: pointer;',
      '  -webkit-font-smoothing: antialiased;',
      '}',
      '.rich-wind-reload-button:hover { background: rgba(31, 41, 55, 0.98); }',
      '.rich-wind-reload-button:focus-visible { outline: 3px solid rgba(59, 130, 246, 0.65); outline-offset: 3px; }',
      '.rich-wind-reload-icon { font-size: 16px; line-height: 1; }',
      '@media (max-width: 520px) {',
      '  .rich-wind-reload-button { right: 12px; bottom: 12px; min-height: 38px; padding: 8px 11px; }',
      '}'
    ].join('\\n');
    document.head.appendChild(style);
  }

  function forceReload() {
    var cacheBust = getAttr('data-cache-bust', 'true') !== 'false';
    if (!cacheBust) {
      window.location.reload();
      return;
    }

    try {
      var url = new URL(window.location.href);
      url.searchParams.set('rwReload', Date.now().toString(36));
      window.location.replace(url.href);
    } catch (error) {
      window.location.reload();
    }
  }

  function mountButton() {
    if (!document.body || document.getElementById('rich-wind-reload-button')) return;

    addStyles();

    var label = getAttr('data-label', 'Reload');
    var button = document.createElement('button');
    button.id = 'rich-wind-reload-button';
    button.className = 'rich-wind-reload-button';
    button.type = 'button';
    button.title = getAttr('data-title', 'Reload this page');
    button.setAttribute('aria-label', button.title);
    var icon = document.createElement('span');
    icon.className = 'rich-wind-reload-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '&#8635;';
    var text = document.createElement('span');
    text.textContent = label;
    button.appendChild(icon);
    button.appendChild(text);
    button.addEventListener('click', forceReload);
    document.body.appendChild(button);
  }

  if (getAttr('data-enabled', 'true') === 'false') return;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButton);
  } else {
    mountButton();
  }
}());
`;

async function resolveClassesFromInput({ html, validInput }) {
    // extractClasses already validates via candidatesToCss, so only
    // validate the raw class input to avoid a redundant second pass.
    const fromHtml = html ? await extractClasses(html) : [];
    const fromInput = validInput;

    if (fromInput.length === 0) {
        return Array.from(new Set(fromHtml)).sort();
    }
    const combined = new Set([...fromHtml, ...fromInput]);
    return Array.from(combined).sort();
}

async function compileAndCachePage({
    state,
    config,
    projectId,
    pageId,
    html,
    classes,
    bundle = 'full',
    pluginRunner,
    cacheStoreRunner,
    queueStoreWrite,
    skipHooks = false,
    source = 'http',
    request = null
}) {
    const normalizedBundle = normalizeBundle(bundle);
    // HTML scanner candidates are intentionally excluded from rejection feedback.
    const { valid: validInput, rejected } = await validateExplicitClasses(classes);

    // Base bundle handling
    if (normalizedBundle === 'base') {
        const css = await generateBaseCss();
        if (!skipHooks && pluginRunner) {
            await pluginRunner.runHook('onCacheHit', { projectId, pageId, bundle: 'base', source, request });
            await pluginRunner.runHook('onCompileResult', { projectId, pageId, bundle: 'base', classes: [], css, hash: 'base', cached: true, source, request });
        }
        return { css, classes: [], rejected, hash: 'base', cached: true, bundle: normalizedBundle };
    }

    // Fire onCompileStart
    if (!skipHooks && pluginRunner) {
        await pluginRunner.runHook('onCompileStart', { projectId, pageId, bundle: normalizedBundle, html, classes, source, request });
    }

    // Pre-hydrate from cacheStore
    if (!skipHooks) {
        await hydrateMissingCompilePageFromStore(state, config, cacheStoreRunner, projectId, pageId, bundle);
    }

    let resolvedClasses = await resolveClassesFromInput({ html, validInput });

    // transformClasses pipeline
    if (!skipHooks && pluginRunner) {
        const transformed = await pluginRunner.runPipeline('transformClasses', { projectId, pageId, bundle: normalizedBundle, source, request }, resolvedClasses);
        if (Array.isArray(transformed)) {
            const deduped = Array.from(new Set(transformed));
            const valid = await filterValidClasses(deduped);
            resolvedClasses = valid.sort();
        }
    }

    const allowEmptyClassSet =
        normalizedBundle === 'utilities' ||
        normalizedBundle === 'theme';
    if (resolvedClasses.length === 0 && !allowEmptyClassSet) {
        const err = { error: 'No valid classes found.', classes: [], css: '', status: 400 };
        if (!skipHooks && pluginRunner) {
            await pluginRunner.runHook('onError', { error: new Error(err.error), stage: 'compile', source, request, context: { projectId, pageId, bundle: normalizedBundle } });
        }
        return err;
    }
    if (resolvedClasses.length > config.maxClassCount) {
        const err = {
            error: `Too many classes (${resolvedClasses.length}). Limit is ${config.maxClassCount}.`,
            classes: [],
            css: '',
            status: 413
        };
        if (!skipHooks && pluginRunner) {
            await pluginRunner.runHook('onError', { error: new Error(err.error), stage: 'compile', source, request, context: { projectId, pageId, bundle: normalizedBundle } });
        }
        return err;
    }

    const now = Date.now();
    const project = getProject(state, projectId);
    const existing = project.pages.get(pageId);
    const classHash = hashClasses(resolvedClasses);
    const bundleKey =
        normalizedBundle === 'utilities'
            ? 'utilitiesCss'
            : normalizedBundle === 'theme'
              ? 'themeCss'
              : 'css';

    if (existing && existing.hash === classHash && !isExpired(existing)) {
        existing.expiresAt = now + config.cacheTtlMs;
        existing.updatedAt = now;
        const pageKey = makePageKey(projectId, pageId);
        touchPageKey(state, pageKey);
        if (existing[bundleKey] !== null && existing[bundleKey] !== undefined) {
            if (!skipHooks && pluginRunner) {
                await pluginRunner.runHook('onCacheHit', { projectId, pageId, bundle: normalizedBundle, source, request });
                await pluginRunner.runHook('onCompileResult', { projectId, pageId, bundle: normalizedBundle, classes: resolvedClasses, css: existing[bundleKey], hash: classHash, cached: true, source, request });
            }
            return { css: existing[bundleKey], classes: resolvedClasses, rejected, hash: classHash, cached: true, bundle: normalizedBundle };
        }
    }

    let css = '';
    const compileKey = `${classHash}:${normalizedBundle === 'utilities' || normalizedBundle === 'theme' ? 'split' : 'full'}`;
    if (normalizedBundle === 'utilities' || normalizedBundle === 'theme') {
        const split = await coalesceCompile(compileKey, () => generateThemeUtilitiesForClasses(resolvedClasses));
        css = normalizedBundle === 'utilities' ? split.utilitiesCss : split.themeCss;
    } else {
        css = await coalesceCompile(compileKey, () => generateCssForClasses(resolvedClasses));
    }

    // transformCss pipeline
    if (!skipHooks && pluginRunner) {
        const transformedCss = await pluginRunner.runPipeline('transformCss', { projectId, pageId, bundle: normalizedBundle, source, request }, css);
        if (typeof transformedCss === 'string') {
            if (transformedCss.length <= config.maxCssChars) {
                css = transformedCss;
            } else {
                await pluginRunner.runHook('onError', {
                    error: new Error(`transformCss output exceeds maxCssChars (${transformedCss.length} > ${config.maxCssChars})`),
                    stage: 'transform', hook: 'transformCss', source, request,
                    context: { projectId, pageId, bundle: normalizedBundle }
                });
            }
        }
    }

    const newClassSet = new Set(resolvedClasses);
    const classesChanged = !existing || existing.hash !== classHash;

    if (classesChanged) {
        updateClassCounts(project, existing?.classes ?? new Set(), newClassSet);
    }

    if (existing) {
        existing.hash = classHash;
        existing.classes = newClassSet;
        existing.updatedAt = now;
        existing.expiresAt = now + config.cacheTtlMs;
        if (normalizedBundle === 'utilities') {
            existing.utilitiesCss = css;
        } else if (normalizedBundle === 'theme') {
            existing.themeCss = css;
        } else if (normalizedBundle === 'full') {
            existing.css = css;
        }
    } else {
        project.pages.set(pageId, {
            css: normalizedBundle === 'full' ? css : null,
            utilitiesCss: normalizedBundle === 'utilities' ? css : null,
            themeCss: normalizedBundle === 'theme' ? css : null,
            classes: newClassSet,
            hash: classHash,
            updatedAt: now,
            expiresAt: now + config.cacheTtlMs
        });
    }
    if (classesChanged) clearProjectAggregateCache(project);

    const pageKey = makePageKey(projectId, pageId);
    state.pageLru.set(pageKey, { projectId, pageId });
    evictIfNeeded(state, config);

    // Fire observer hooks
    if (!skipHooks && pluginRunner) {
        await pluginRunner.runHook('onCacheMiss', { projectId, pageId, bundle: normalizedBundle, source, request });
        await pluginRunner.runHook('onCompileResult', { projectId, pageId, bundle: normalizedBundle, classes: resolvedClasses, css, hash: classHash, cached: false, source, request });
    }

    // CacheStore write-through
    if (cacheStoreRunner?.enabled && normalizedBundle !== 'base') {
        const writeNow = Date.now();
        const queueWrite = typeof queueStoreWrite === 'function'
            ? queueStoreWrite
            : (fn) => {
                queueMicrotask(() => {
                    Promise.resolve(fn()).catch(() => {});
                });
            };
        queueWrite(() =>
            cacheStoreRunner.upsertPageArtifact({
                projectId, pageId, bundle: normalizedBundle,
                css, hash: classHash, classes: resolvedClasses,
                cached: false, updatedAt: writeNow, expiresAt: writeNow + config.cacheTtlMs
            })
        );
    }

    return { css, classes: resolvedClasses, rejected, hash: classHash, cached: false, bundle: normalizedBundle };
}

async function getCachedPageCss(state, config, projectId, pageId, bundle = 'full') {
    const normalizedBundle = normalizeBundle(bundle);
    if (normalizedBundle === 'base') {
        return { css: await generateBaseCss() };
    }
    const project = state.projects.get(projectId);
    if (!project) return null;
    const page = project.pages.get(pageId);
    if (!page) return null;
    if (isExpired(page)) {
        evictPageByKey(state, makePageKey(projectId, pageId));
        return null;
    }

    page.expiresAt = Date.now() + config.cacheTtlMs;
    touchPageKey(state, makePageKey(projectId, pageId));
    if (normalizedBundle === 'utilities' || normalizedBundle === 'theme') {
        if (page.utilitiesCss === null || page.utilitiesCss === undefined || page.themeCss === null || page.themeCss === undefined) {
            const split = await generateThemeUtilitiesForClasses(Array.from(page.classes || []));
            page.utilitiesCss = split.utilitiesCss;
            page.themeCss = split.themeCss;
        }
        return { css: normalizedBundle === 'utilities' ? page.utilitiesCss : page.themeCss };
    }
    if (page.css === null || page.css === undefined) {
        page.css = await generateCssForClasses(Array.from(page.classes || []));
    }
    return { css: page.css };
}

async function getProjectCss(state, config, projectId, bundle = 'full') {
    const normalizedBundle = normalizeBundle(bundle);
    if (normalizedBundle === 'base') {
        return { css: await generateBaseCss(), hash: 'base', cached: true };
    }
    const project = state.projects.get(projectId);
    if (!project) return null;

    const now = Date.now();
    const cacheKey =
        normalizedBundle === 'utilities'
            ? 'utilitiesCssCache'
            : normalizedBundle === 'theme'
              ? 'themeCssCache'
              : 'cssCache';
    const cacheEntry = project[cacheKey];
    if (cacheEntry && !isExpired(cacheEntry)) {
        return { css: cacheEntry.css, hash: cacheEntry.hash, cached: true };
    }

    const classes = Array.from(project.classCounts.keys()).sort();
    const hash = hashClasses(classes);
    if (cacheEntry && cacheEntry.hash === hash) {
        cacheEntry.expiresAt = now + config.projectCacheTtlMs;
        return { css: cacheEntry.css, hash: cacheEntry.hash, cached: true };
    }

    let css = '';
    if (classes.length) {
        if (normalizedBundle === 'utilities' || normalizedBundle === 'theme') {
            const split = await generateThemeUtilitiesForClasses(classes);
            css = normalizedBundle === 'utilities' ? split.utilitiesCss : split.themeCss;
        } else {
            css = await generateCssForClasses(classes);
        }
    }
    project[cacheKey] = {
        css,
        hash,
        updatedAt: now,
        expiresAt: now + config.projectCacheTtlMs
    };
    return { css, hash, cached: false };
}

async function readPageArtifactFromStore(cacheStoreRunner, config, projectId, pageId, bundle) {
    if (!cacheStoreRunner?.enabled) return null;
    const raw = await cacheStoreRunner.readPageArtifact({
        projectId,
        pageId,
        bundle: normalizeBundle(bundle),
        now: Date.now()
    });
    return sanitizePageArtifact(raw, config, Date.now());
}

async function readProjectArtifactFromStore(cacheStoreRunner, config, projectId, bundle) {
    if (!cacheStoreRunner?.enabled) return null;
    const raw = await cacheStoreRunner.readProjectArtifact({
        projectId,
        bundle: normalizeBundle(bundle),
        now: Date.now()
    });
    return sanitizeProjectArtifact(raw, config, Date.now());
}

async function hydrateMissingCompilePageFromStore(state, config, cacheStoreRunner, projectId, pageId, bundle) {
    if (!cacheStoreRunner?.enabled) return false;
    const project = state.projects.get(projectId);
    if (project?.pages?.has(pageId)) return true;

    const normalizedBundle = normalizeBundle(bundle);
    if (normalizedBundle === 'base') return false;
    const bundleTryOrder = Array.from(
        new Set([normalizedBundle, 'full', 'utilities', 'theme'])
    );

    for (const candidateBundle of bundleTryOrder) {
        const artifact = await readPageArtifactFromStore(
            cacheStoreRunner,
            config,
            projectId,
            pageId,
            candidateBundle
        );
        if (!artifact || !Array.isArray(artifact.classes)) continue;
        if (hydratePageFromArtifact(state, config, projectId, pageId, candidateBundle, artifact, { requireClasses: true })) {
            return true;
        }
    }
    return false;
}

// =============================================================================
// Plugin system
// =============================================================================
const hookStore = new AsyncLocalStorage();

const PLUGIN_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const MAX_PLUGIN_NAME_LENGTH = 64;
const PLUGIN_STORAGE_KEY_RE = /^[a-zA-Z0-9._:-]{1,128}$/;
const PLUGIN_STORAGE_KEY_DESC = '[a-zA-Z0-9._:-]{1,128}';
const PLUGIN_STORAGE_PREFIX_RE = /^[a-zA-Z0-9._:-]{0,128}$/;
const PLUGIN_STORAGE_PREFIX_DESC = '[a-zA-Z0-9._:-]{0,128}';

function createPluginRunner(plugins = [], options = {}) {
    const defaultTimeoutMs = parseIntWithDefault(
        options.timeoutMs ?? process.env.RW_PLUGIN_TIMEOUT_MS,
        200,
        0
    );
    const pluginContext = options.pluginContext && typeof options.pluginContext === 'object'
        ? options.pluginContext
        : null;
    const buildHookContext = (context) => {
        if (!pluginContext) return context || {};
        return {
            ...pluginContext,
            ...(context || {})
        };
    };
    const list = (Array.isArray(plugins) ? plugins : [plugins])
        .filter(Boolean)
        .map((plugin, index) => {
            const name = plugin.name || `plugin-${index + 1}`;
            return {
                name,
                routeName: name.toLowerCase(),
                instance: plugin,
                defer: Boolean(plugin.defer),
                deferHooks: Array.isArray(plugin.deferHooks) ? plugin.deferHooks : null,
                timeoutMs: Number.isFinite(plugin.timeoutMs)
                    ? Math.max(0, plugin.timeoutMs)
                    : defaultTimeoutMs,
                active: typeof plugin.setup !== 'function',
                failed: false
            };
        });

    // Validate plugin names
    const seenRouteNames = new Map();
    for (const plugin of list) {
        if (!PLUGIN_NAME_RE.test(plugin.name) || plugin.name.length > MAX_PLUGIN_NAME_LENGTH) {
            throw new Error(`Invalid plugin name "${plugin.name}": must match [a-zA-Z0-9_-]+ and be ≤64 chars`);
        }
        const existing = seenRouteNames.get(plugin.routeName);
        if (existing) {
            throw new Error(`Plugin name "${plugin.name}" collides with existing plugin "${existing}" (route segment "${plugin.routeName}")`);
        }
        seenRouteNames.set(plugin.routeName, plugin.name);
    }

    // Pre-compute which plugins implement each hook for fast dispatch
    const ALL_HOOKS = [
        'guard',
        'onRequestStart', 'onResponseSent', 'onCompileStart', 'onCompileResult',
        'onCacheHit', 'onCacheMiss', 'onProjectCss', 'onSuggest', 'onError',
        'transformClasses', 'transformCss', 'transformSuggestions',
        'resolvePageCss', 'resolveProjectCss'
    ];
    const hookSubscribers = new Map();
    for (const hook of ALL_HOOKS) {
        const subscribers = list.filter(p => typeof p.instance?.[hook] === 'function');
        hookSubscribers.set(hook, subscribers);
    }

    const NEVER_DEFER_HOOKS = new Set([
        'guard', 'onError', 'transformClasses', 'transformCss', 'transformSuggestions',
        'resolvePageCss', 'resolveProjectCss'
    ]);

    const shouldDefer = (plugin, hook) => {
        if (NEVER_DEFER_HOOKS.has(hook)) return false;
        if (plugin.deferHooks) return plugin.deferHooks.includes(hook);
        return plugin.defer;
    };

    const withTimeout = (promise, timeoutMs) => {
        if (!timeoutMs || timeoutMs <= 0) return promise;
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
                const error = new Error(`Plugin timeout after ${timeoutMs}ms`);
                error.code = 'PLUGIN_TIMEOUT';
                reject(error);
            }, timeoutMs);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    };

    const runSingle = async (plugin, hook, context) => {
        if (!plugin.active || plugin.failed) return;
        const fn = plugin.instance && typeof plugin.instance[hook] === 'function' ? plugin.instance[hook] : null;
        if (!fn) return;
        try {
            await withTimeout(Promise.resolve(fn(context)), plugin.timeoutMs);
        } catch (error) {
            if (hook === 'onError') return;
            const timedOut = error && error.code === 'PLUGIN_TIMEOUT';
            await runHook('onError', {
                error,
                hook,
                plugin: plugin.name,
                timedOut,
                context
            });
        }
    };

    const runHook = async (hook, context) => {
        const subscribers = hookSubscribers.get(hook);
        if (!subscribers || subscribers.length === 0) return;
        const hookContext = buildHookContext(context);
        for (const plugin of subscribers) {
            if (shouldDefer(plugin, hook)) {
                const p = plugin;
                const parentStore = hookStore.getStore();
                const chainDepth = parentStore?.compileChainDepth ?? 0;
                queueMicrotask(() => {
                    hookStore.run(
                        { inHook: false, deferred: true, compileChainDepth: chainDepth },
                        () => runSingle(p, hook, hookContext)
                    );
                });
                continue;
            }
            await hookStore.run(
                { inHook: true },
                () => runSingle(plugin, hook, hookContext)
            );
        }
    };

    const runPipeline = async (hook, context, initialValue) => {
        const subscribers = hookSubscribers.get(hook);
        if (!subscribers || subscribers.length === 0) return initialValue;
        const hookContext = buildHookContext(context);
        let value = initialValue;
        for (const plugin of subscribers) {
            if (!plugin.active || plugin.failed) continue;
            const fn = plugin.instance && typeof plugin.instance[hook] === 'function' ? plugin.instance[hook] : null;
            if (!fn) continue;
            try {
                const result = await hookStore.run(
                    { inHook: true },
                    () => withTimeout(Promise.resolve(fn({ ...hookContext, value })), plugin.timeoutMs)
                );
                if (result !== undefined) {
                    value = result;
                }
            } catch (error) {
                const timedOut = error && error.code === 'PLUGIN_TIMEOUT';
                await runHook('onError', {
                    error, hook, plugin: plugin.name, timedOut, context: hookContext
                });
            }
        }
        return value;
    };

    const runResolve = async (hook, context, resolveConfig) => {
        const hookContext = buildHookContext(context);
        for (const plugin of list) {
            if (!plugin.active || plugin.failed) continue;
            const fn = plugin.instance && typeof plugin.instance[hook] === 'function' ? plugin.instance[hook] : null;
            if (!fn) continue;
            try {
                const result = await hookStore.run(
                    { inHook: true },
                    () => withTimeout(Promise.resolve(fn(hookContext)), plugin.timeoutMs)
                );
                if (result == null) continue;
                if (typeof result.css !== 'string') continue;
                if (result.css.length > resolveConfig.maxCssChars) {
                    await runHook('onError', {
                        error: new Error(`Resolve hook "${hook}" returned CSS exceeding maxCssChars (${result.css.length} > ${resolveConfig.maxCssChars})`),
                        hook, plugin: plugin.name, stage: 'resolve'
                    });
                    continue;
                }
                return result;
            } catch (error) {
                const timedOut = error && error.code === 'PLUGIN_TIMEOUT';
                await runHook('onError', {
                    error, hook, plugin: plugin.name, timedOut, context: hookContext
                });
            }
        }
        return null;
    };

    const runGuard = async (context) => {
        const subscribers = hookSubscribers.get('guard');
        if (!subscribers || subscribers.length === 0) return null;
        const hookContext = buildHookContext(context);
        for (const plugin of subscribers) {
            if (!plugin.active || plugin.failed) continue;
            const fn = plugin.instance && typeof plugin.instance.guard === 'function' ? plugin.instance.guard : null;
            if (!fn) continue;
            try {
                const result = await withTimeout(Promise.resolve(fn(hookContext)), plugin.timeoutMs);
                if (result && result.blocked) return result;
            } catch (error) {
                const timedOut = error && error.code === 'PLUGIN_TIMEOUT';
                await runHook('onError', { error, hook: 'guard', plugin: plugin.name, timedOut, context: hookContext });
            }
        }
        return null;
    };

    return { runHook, runPipeline, runResolve, runGuard, list };
}

// =============================================================================
// HTTP routes
// =============================================================================
function registerRoutes(app, pluginRunner, config, state, cacheStoreRunner, roleHelpers = {}, runtimeHelpers = {}) {
    const withRequestHooks = (req, res, context) => {
        const start = Date.now();
        pluginRunner.runHook('onRequestStart', context);
        res.once('finish', () => {
            pluginRunner.runHook('onResponseSent', {
                ...context,
                status: res.statusCode,
                durationMs: Date.now() - start
            });
        });
    };
    const queueStoreWrite = typeof runtimeHelpers.queueStoreWrite === 'function'
        ? runtimeHelpers.queueStoreWrite
        : (fn) => {
            queueMicrotask(() => {
                Promise.resolve(fn()).catch(() => {});
            });
        };
    const isWriteAllowed = typeof roleHelpers.isWriteAllowed === 'function'
        ? roleHelpers.isWriteAllowed
        : (() => true);
    const reportWriteBlocked = typeof roleHelpers.reportWriteBlocked === 'function'
        ? roleHelpers.reportWriteBlocked
        : (async () => {});
// API Routes

function sendCss(req, res, css, etag) {
    if (etag) {
        const quoted = `"${etag}"`;
        res.setHeader('ETag', quoted);
        res.setHeader('Cache-Control', 'no-cache');
        if (req.headers['if-none-match'] === quoted) {
            return res.status(304).end();
        }
    }
    return res.type('text/css').send(css);
}

// Optional browser helper for plain HTML preview surfaces.
app.get('/richwind-loader.js', (req, res) => {
    withRequestHooks(req, res, {
        action: 'loader',
        request: { ip: getClientIp(req), method: req.method, path: req.path }
    });
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.type('application/javascript').send(RICH_WIND_LOADER_JS);
});

// Optional reload control for preview surfaces.
app.get('/richwind-reload.js', (req, res) => {
    withRequestHooks(req, res, {
        action: 'reload',
        request: { ip: getClientIp(req), method: req.method, path: req.path }
    });
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.type('application/javascript').send(RICH_WIND_RELOAD_JS);
});

// Compile CSS for a project/page (in-memory cache)
app.post('/api/compile', async (req, res) => {
    try {
        const body = req.body || {};
        const projectId = body.projectId;
        const pageId = body.pageId ?? 'default';
        const { html, classes } = body;
        const bundle = normalizeBundle(body.bundle);
        const hookContext = {
            projectId,
            pageId,
            bundle,
            html,
            classes,
            request: { ip: getClientIp(req), method: req.method, path: req.path }
        };
        withRequestHooks(req, res, { ...hookContext, action: 'compile' });

        if (!isWriteAllowed()) {
            await reportWriteBlocked('http-compile', {
                source: 'http',
                request: hookContext.request,
                projectId,
                pageId,
                bundle
            });
            return res.status(409).json({
                error: 'This replica is read-only. Route compile writes to a writer replica.',
                code: READ_ONLY_ERROR_CODE
            });
        }

        if (!projectId) {
            return sendError(res, 400, 'MISSING_INPUT', 'projectId is required.');
        }
        if (!isValidId(projectId, config)) {
            return sendError(res, 400, 'INVALID_ID', `projectId must be <= ${config.maxIdLength} chars and use a-z, 0-9, ".", "-", "_".`);
        }
        if (!isValidId(pageId, config)) {
            return sendError(res, 400, 'INVALID_ID', `pageId must be <= ${config.maxIdLength} chars and use a-z, 0-9, ".", "-", "_".`);
        }
        if (!html && !classes && bundle !== 'base') {
            return sendError(res, 400, 'MISSING_INPUT', 'Either html or classes is required.');
        }
        if (typeof html === 'string' && html.length > config.maxHtmlChars) {
            return sendError(res, 413, 'PAYLOAD_TOO_LARGE', `html is too large. Limit is ${config.maxHtmlChars} chars.`);
        }
        if (typeof classes === 'string' && classes.length > config.maxClassChars) {
            return sendError(res, 413, 'PAYLOAD_TOO_LARGE', `classes is too large. Limit is ${config.maxClassChars} chars.`);
        }

        const result = await compileAndCachePage({
            state, config, projectId, pageId, html, classes, bundle,
            pluginRunner, cacheStoreRunner,
            queueStoreWrite,
            skipHooks: false, source: 'http', request: hookContext.request
        });
        if (result.error) {
            return sendError(res, result.status || 400, result.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_BODY', result.error);
        }

        res.json({
            success: true,
            projectId,
            pageId,
            bundle: result.bundle ?? bundle,
            hash: result.hash,
            classes: result.classes,
            rejected: result.rejected ?? [],
            cached: result.cached,
            css: result.css
        });
    } catch (err) {
        await pluginRunner.runHook('onError', { error: err, stage: 'compile', source: 'http', request: { ip: getClientIp(req), method: req.method, path: req.path } });
        sendError(res, 500, 'INTERNAL', 'Internal server error.');
    }
});

// Get cached CSS for a project/page
app.get('/api/css', async (req, res) => {
    try {
        const projectId = req.query.projectId;
        const pageId = req.query.pageId ?? 'default';
        const bundle = normalizeBundle(req.query.bundle);
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        const hookContext = {
            projectId,
            pageId,
            bundle,
            request: { ip: getClientIp(req), method: req.method, path: req.path }
        };
        withRequestHooks(req, res, { ...hookContext, action: 'cache' });

        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required.' });
        }
        if (!isValidId(projectId, config)) {
            return res.status(400).json({
                error: `projectId must be <= ${config.maxIdLength} chars and use a-z, 0-9, ".", "-", "_".`
            });
        }
        if (!isValidId(pageId, config)) {
            return res.status(400).json({
                error: `pageId must be <= ${config.maxIdLength} chars and use a-z, 0-9, ".", "-", "_".`
            });
        }

        const readerStoreFirst =
            config.nodeRole === 'reader' &&
            cacheStoreRunner?.enabled &&
            bundle !== 'base';

        if (readerStoreFirst) {
            const storeArtifact = await readPageArtifactFromStore(
                cacheStoreRunner,
                config,
                projectId,
                pageId,
                bundle
            );
            if (storeArtifact) {
                hydratePageFromArtifact(
                    state,
                    config,
                    projectId,
                    pageId,
                    bundle,
                    storeArtifact
                );
                await pluginRunner.runHook('onCacheHit', {
                    projectId,
                    pageId,
                    bundle,
                    source: 'page-store',
                    request: hookContext.request
                });
                return sendCss(req, res, storeArtifact.css, storeArtifact.hash);
            }
            await pluginRunner.runHook('onCacheMiss', {
                projectId,
                pageId,
                bundle,
                source: 'page-store',
                request: hookContext.request
            });
        } else {
            const cached = await getCachedPageCss(state, config, projectId, pageId, bundle);
            if (cached) {
                await pluginRunner.runHook('onCacheHit', {
                    projectId,
                    pageId,
                    bundle,
                    source: 'page',
                    request: hookContext.request
                });
                const pageHash = state.projects.get(projectId)?.pages.get(pageId)?.hash;
                return sendCss(req, res, cached.css, pageHash);
            }

            const storeArtifact = await readPageArtifactFromStore(
                cacheStoreRunner,
                config,
                projectId,
                pageId,
                bundle
            );
            if (storeArtifact) {
                hydratePageFromArtifact(
                    state,
                    config,
                    projectId,
                    pageId,
                    bundle,
                    storeArtifact
                );
                await pluginRunner.runHook('onCacheHit', {
                    projectId,
                    pageId,
                    bundle,
                    source: 'page-store',
                    request: hookContext.request
                });
                return sendCss(req, res, storeArtifact.css, storeArtifact.hash);
            }
            await pluginRunner.runHook('onCacheMiss', {
                projectId,
                pageId,
                bundle,
                source: 'page',
                request: hookContext.request
            });
        }

        // Resolve hook: let plugins provide CSS on cache miss
        const resolved = await pluginRunner.runResolve('resolvePageCss', {
            projectId, pageId, bundle, source: 'http', request: hookContext.request
        }, config);
        if (resolved) {
            return res.type('text/css').send(resolved.css);
        }

        return sendError(res, 404, 'NOT_FOUND', 'Cached CSS was not found.');
    } catch (err) {
        const reqInfo = { ip: getClientIp(req), method: req.method, path: req.path };
        await pluginRunner.runHook('onError', { error: err, stage: 'cache', source: 'http', request: reqInfo });
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Get aggregated CSS for a project (union of cached pages)
app.get('/api/projects/:projectId/css', async (req, res) => {
    try {
        const { projectId } = req.params;
        const bundle = normalizeBundle(req.query.bundle);
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        const hookContext = {
            projectId,
            bundle,
            request: { ip: getClientIp(req), method: req.method, path: req.path }
        };
        withRequestHooks(req, res, { ...hookContext, action: 'project-css' });
        if (!isValidId(projectId, config)) {
            return res.status(400).json({
                error: `projectId must be <= ${config.maxIdLength} chars and use a-z, 0-9, ".", "-", "_".`
            });
        }
        const readerStoreFirst =
            config.nodeRole === 'reader' &&
            cacheStoreRunner?.enabled &&
            bundle !== 'base';
        let result = null;

        if (readerStoreFirst) {
            const storeArtifact = await readProjectArtifactFromStore(
                cacheStoreRunner,
                config,
                projectId,
                bundle
            );
            if (storeArtifact) {
                result = {
                    css: storeArtifact.css,
                    hash: storeArtifact.hash ?? null,
                    cached: true,
                    source: 'store'
                };
            }
        } else {
            result = await getProjectCss(state, config, projectId, bundle);
            if (!result && bundle !== 'base') {
                const storeArtifact = await readProjectArtifactFromStore(
                    cacheStoreRunner,
                    config,
                    projectId,
                    bundle
                );
                if (storeArtifact) {
                    result = {
                        css: storeArtifact.css,
                        hash: storeArtifact.hash ?? null,
                        cached: true,
                        source: 'store'
                    };
                }
            }
        }
        if (!result) {
            // Resolve hook: let plugins provide project CSS on cache miss
            const resolved = await pluginRunner.runResolve('resolveProjectCss', {
                projectId, bundle, source: 'http', request: hookContext.request
            }, config);
            if (resolved) {
                return res.type('text/css').send(resolved.css);
            }
            return sendError(res, 404, 'NOT_FOUND', 'Project CSS was not found.');
        }

        if (
            cacheStoreRunner?.enabled &&
            bundle !== 'base' &&
            result.source !== 'store' &&
            isWriteAllowed()
        ) {
            const now = Date.now();
            queueStoreWrite(() =>
                cacheStoreRunner.upsertProjectArtifact({
                    projectId,
                    bundle,
                    css: result.css,
                    hash: result.hash ?? null,
                    cached: result.cached,
                    updatedAt: now,
                    expiresAt: now + config.projectCacheTtlMs
                })
            );
        }

        await pluginRunner.runHook('onProjectCss', {
            projectId,
            bundle,
            css: result?.css ?? '',
            hash: result?.hash ?? null,
            cached: result?.cached ?? false,
            source: 'http',
            request: hookContext.request
        });
        return sendCss(req, res, result?.css ?? '', result?.hash ?? null);
    } catch (err) {
        const reqInfo = { ip: getClientIp(req), method: req.method, path: req.path };
        await pluginRunner.runHook('onError', { error: err, stage: 'project-css', source: 'http', request: reqInfo });
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Invalidate (purge) a page or an entire project from the in-memory cache and cache store
app.post('/api/invalidate', async (req, res) => {
    try {
        const body = req.body || {};
        const projectId = body.projectId ?? null;
        const pageId = body.pageId ?? null;

        withRequestHooks(req, res, {
            action: 'invalidate',
            projectId,
            pageId,
            request: { ip: getClientIp(req), method: req.method, path: req.path }
        });

        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required.' });
        }
        if (!isValidId(projectId, config)) {
            return res.status(400).json({
                error: `projectId must be <= ${config.maxIdLength} chars and use a-z, 0-9, ".", "-", "_".`
            });
        }
        if (pageId !== null && !isValidId(pageId, config)) {
            return res.status(400).json({
                error: `pageId must be <= ${config.maxIdLength} chars and use a-z, 0-9, ".", "-", "_".`
            });
        }
        if (!isWriteAllowed()) {
            return res.status(409).json({
                error: 'This replica is read-only. Route invalidation writes to a writer replica.',
                code: READ_ONLY_ERROR_CODE
            });
        }

        const bundles = ['full', 'utilities', 'theme'];

        if (pageId !== null) {
            evictPageByKey(state, makePageKey(projectId, pageId));
            if (cacheStoreRunner?.enabled) {
                await Promise.all(
                    bundles.map(b => cacheStoreRunner.deletePageArtifact({ projectId, pageId, bundle: b }))
                );
            }
            return res.json({ invalidated: true, projectId, pageId });
        }

        // Purge entire project from memory
        const project = state.projects.get(projectId);
        if (project) {
            for (const pid of Array.from(project.pages.keys())) {
                evictPageByKey(state, makePageKey(projectId, pid));
            }
            state.projects.delete(projectId);
        }
        // Purge from store
        if (cacheStoreRunner?.enabled) {
            if (cacheStoreRunner.hasMethod?.('deleteProjectPageArtifacts')) {
                await cacheStoreRunner.deleteProjectPageArtifacts({ projectId });
            }
            await Promise.all(
                bundles.map(b => cacheStoreRunner.deleteProjectArtifact({ projectId, bundle: b }))
            );
        }
        return res.json({ invalidated: true, projectId });
    } catch (err) {
        const reqInfo = { ip: getClientIp(req), method: req.method, path: req.path };
        await pluginRunner.runHook('onError', { error: err, stage: 'invalidate', source: 'http', request: reqInfo });
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Suggest Tailwind classes based on cached project data and/or input
app.post('/api/suggest', async (req, res) => {
    try {
        const body = req.body || {};
        const projectId = body.projectId ?? null;
        const prefix = typeof body.prefix === 'string' ? body.prefix.trim() : '';
        const limitRaw = body.limit;
        const limit = Math.min(parseIntWithDefault(limitRaw, config.suggestLimit, 1), config.suggestLimit);
        const includeInput = normalizeClassList(body.classes);
        const hookContext = {
            projectId,
            prefix,
            limit,
            request: { ip: getClientIp(req), method: req.method, path: req.path }
        };
        withRequestHooks(req, res, { ...hookContext, action: 'suggest' });

        if (projectId && !isValidId(projectId, config)) {
            return res.status(400).json({
                error: `projectId must be <= ${config.maxIdLength} chars and use a-z, 0-9, ".", "-", "_".`
            });
        }

        // Phase 1: Collect ALL candidates (no limit enforcement yet)
        const seen = new Set();
        const allSuggestions = [];
        const push = (list) => {
            for (const item of list) {
                if (!item) continue;
                if (prefix && !item.startsWith(prefix)) continue;
                if (!seen.has(item)) { seen.add(item); allSuggestions.push(item); }
            }
        };

        if (includeInput.length) push(includeInput);
        if (projectId) push(getProjectSuggestionList(state, projectId));
        if (config.suggestFallback && prefix) {
            const staticList = await getStaticClassSuggestions(prefix);
            push(staticList.length ? staticList : getFallbackSuggestions(prefix));
        }

        // Phase 2: Run transform pipeline
        let suggestions = await pluginRunner.runPipeline('transformSuggestions',
            { projectId, prefix, limit, source: 'http', request: hookContext.request },
            allSuggestions
        );

        // Phase 3: Post-validation
        if (!Array.isArray(suggestions)) suggestions = allSuggestions;
        suggestions = suggestions.filter(s => typeof s === 'string');
        suggestions = [...new Set(suggestions)];
        const effectiveLimit = Math.min(limit, config.suggestLimit);
        suggestions = suggestions.slice(0, effectiveLimit);

        // Phase 4: Respond
        await pluginRunner.runHook('onSuggest', { ...hookContext, suggestions, source: 'http' });
        return res.json({ success: true, projectId, prefix, count: suggestions.length, suggestions });
    } catch (err) {
        await pluginRunner.runHook('onError', { error: err, stage: 'suggest', source: 'http', request: { ip: getClientIp(req), method: req.method, path: req.path } });
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    withRequestHooks(req, res, {
        action: 'health',
        request: { ip: getClientIp(req), method: req.method, path: req.path }
    });
    res.status(200).json({ status: 'ok' });
});

// Error handler middleware (must be defined after all routes)
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
        pluginRunner.runHook('onError', { error: err, stage: 'body', context: { path: req.path } });
        return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Payload too large.');
    }
    pluginRunner.runHook('onError', { error: err, stage: 'body', context: { path: req.path } });
    return sendError(res, 400, 'INVALID_BODY', 'Invalid JSON request body.');
});
}

// =============================================================================
// Plugin context + lifecycle
// =============================================================================
function buildPluginContext(state, config) {
    const ctx = {
        getProjectIds() {
            return Array.from(state.projects.keys());
        },
        getClassCounts(projectId) {
            const project = state.projects.get(projectId);
            if (!project) return null;
            return Object.freeze(Object.fromEntries(project.classCounts));
        },
        getPageIds(projectId) {
            const project = state.projects.get(projectId);
            if (!project) return null;
            return Array.from(project.pages.keys());
        },
        getPageClasses(projectId, pageId) {
            const project = state.projects.get(projectId);
            if (!project) return null;
            const page = project.pages.get(pageId);
            if (!page) return null;
            return Array.from(page.classes).sort();
        },
        getPageMeta(projectId, pageId) {
            const project = state.projects.get(projectId);
            if (!project) return null;
            const page = project.pages.get(pageId);
            if (!page) return null;
            return Object.freeze({ hash: page.hash, updatedAt: page.updatedAt, expiresAt: page.expiresAt });
        },
        getCss(projectId, pageId, bundle) {
            const normalizedBundle = normalizeBundle(bundle);
            if (normalizedBundle === 'base') return cachedBaseCss || null;
            const project = state.projects.get(projectId);
            if (!project) return null;
            const page = project.pages.get(pageId);
            if (!page) return null;
            const key = normalizedBundle === 'utilities' ? 'utilitiesCss'
                : normalizedBundle === 'theme' ? 'themeCss' : 'css';
            return page[key] || null;
        },
        getProjectCss(projectId, bundle) {
            const normalizedBundle = normalizeBundle(bundle);
            if (normalizedBundle === 'base') return cachedBaseCss || null;
            const project = state.projects.get(projectId);
            if (!project) return null;
            const key = normalizedBundle === 'utilities' ? 'utilitiesCssCache'
                : normalizedBundle === 'theme' ? 'themeCssCache' : 'cssCache';
            const entry = project[key];
            return entry?.css || null;
        },
        getCacheStats() {
            return Object.freeze({
                totalPages: state.pageLru.size,
                maxPages: config.cacheMaxPages,
                projectCount: state.projects.size
            });
        },
        getConfig() {
            return Object.freeze({ ...config });
        },
        async validateClasses(classes) {
            const input = normalizeClassList(
                typeof classes === 'string' ? classes : (Array.isArray(classes) ? classes : [])
            );
            return filterValidClasses(input);
        }
    };
    return ctx;
}

function withTimeoutGeneric(promise, timeoutMs, label = 'Operation') {
    if (!timeoutMs || timeoutMs <= 0) return promise;
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const error = new Error(`${label} timeout after ${timeoutMs}ms`);
            error.code = 'PLUGIN_SETUP_TIMEOUT';
            reject(error);
        }, timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function mountPluginRoutes(
    app,
    pluginList,
    pluginContext,
    cacheStoreRunner,
    globalSetupTimeoutMs,
    roleHelpers = {}
) {
    const isWriteAllowed = typeof roleHelpers.isWriteAllowed === 'function'
        ? roleHelpers.isWriteAllowed
        : (() => true);
    const reportWriteBlocked = typeof roleHelpers.reportWriteBlocked === 'function'
        ? roleHelpers.reportWriteBlocked
        : (async () => {});

    for (const plugin of pluginList) {
        if (typeof plugin.instance.setup !== 'function') {
            plugin.active = true;
            continue;
        }

        const router = express.Router();
        let setupDone = false;

        const addRoute = (method, routePath, handler) => {
            if (setupDone) throw new Error('addRoute is only available during setup().');
            const m = String(method).toLowerCase();
            if (!['get', 'post', 'put', 'delete', 'patch'].includes(m)) {
                throw new Error(`Invalid HTTP method "${method}".`);
            }
            if (!routePath || !/^\/[a-zA-Z0-9/_:.\-]*$/.test(routePath) || routePath.includes('..')) {
                throw new Error(`Invalid route path "${routePath}".`);
            }
            if (typeof handler !== 'function') {
                throw new Error('Route handler must be a function.');
            }
            router[m](routePath, handler);
        };

        const storage = Object.freeze({
            async get(key) {
                if (typeof key !== 'string' || !PLUGIN_STORAGE_KEY_RE.test(key)) {
                    throw new Error(`Invalid storage key "${key}". Must match ${PLUGIN_STORAGE_KEY_DESC}.`);
                }
                return cacheStoreRunner.readPluginData({
                    pluginName: plugin.routeName,
                    key
                });
            },
            async set(key, value) {
                if (typeof key !== 'string' || !PLUGIN_STORAGE_KEY_RE.test(key)) {
                    throw new Error(`Invalid storage key "${key}". Must match ${PLUGIN_STORAGE_KEY_DESC}.`);
                }
                if (!isWriteAllowed()) {
                    await reportWriteBlocked('plugin-storage-set', {
                        source: 'plugin',
                        pluginName: plugin.name,
                        key
                    });
                    return false;
                }
                return cacheStoreRunner.writePluginData({
                    pluginName: plugin.routeName,
                    key,
                    value
                });
            },
            async delete(key) {
                if (typeof key !== 'string' || !PLUGIN_STORAGE_KEY_RE.test(key)) {
                    throw new Error(`Invalid storage key "${key}". Must match ${PLUGIN_STORAGE_KEY_DESC}.`);
                }
                if (!isWriteAllowed()) {
                    await reportWriteBlocked('plugin-storage-delete', {
                        source: 'plugin',
                        pluginName: plugin.name,
                        key
                    });
                    return false;
                }
                return cacheStoreRunner.deletePluginData({
                    pluginName: plugin.routeName,
                    key
                });
            },
            async list(prefix = '') {
                const normalizedPrefix = prefix == null ? '' : prefix;
                if (typeof normalizedPrefix !== 'string' || !PLUGIN_STORAGE_PREFIX_RE.test(normalizedPrefix)) {
                    throw new Error(`Invalid storage prefix "${prefix}". Must match ${PLUGIN_STORAGE_PREFIX_DESC}.`);
                }
                const result = await cacheStoreRunner.listPluginData({
                    pluginName: plugin.routeName,
                    prefix: normalizedPrefix
                });
                if (!Array.isArray(result)) return [];
                const seen = new Set();
                const filtered = [];
                for (const key of result) {
                    if (typeof key !== 'string') continue;
                    if (!PLUGIN_STORAGE_KEY_RE.test(key)) continue;
                    if (normalizedPrefix && !key.startsWith(normalizedPrefix)) continue;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    filtered.push(key);
                }
                return filtered;
            }
        });

        try {
            const perPluginTimeout = plugin.instance.setupTimeoutMs ?? globalSetupTimeoutMs;
            await withTimeoutGeneric(
                Promise.resolve(plugin.instance.setup({ ...pluginContext, addRoute, storage })),
                perPluginTimeout,
                `Plugin "${plugin.name}" setup`
            );
            plugin.active = true;
            app.use(`/plugins/${plugin.routeName}`, router);
        } catch (error) {
            console.error(`Plugin "${plugin.name}" setup failed:`, error.message);
            plugin.failed = true;
        }
        setupDone = true;
    }
}

// =============================================================================
// Core factory
// =============================================================================
export async function createCore({
    plugins = [],
    pluginTimeoutMs,
    setupTimeoutMs,
    maxPluginCompileChainDepth,
    config: configOverrides,
    cacheStore,
    cacheStoreTimeoutMs
} = {}) {
    const chainDepthLimit = Math.max(1, parseIntWithDefault(maxPluginCompileChainDepth, 2, 1));
    const config = buildConfig(configOverrides);
    const state = createCacheState();
    const storeWriteQueue = createAsyncTaskQueue();
    const queueStoreWrite = (fn) => storeWriteQueue.queue(fn);
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', config.trustProxy);

    // Keep every JSON failure in the public error envelope while individual route
    // handlers select more precise codes where their validation knows the cause.
    app.use((req, res, next) => {
        const json = res.json.bind(res);
        res.json = (body) => {
            if (res.statusCode >= 400 && body && typeof body === 'object' && body.error && !body.code) {
                return json({ ...body, code: defaultErrorCode(res.statusCode) });
            }
            return json(body);
        };
        next();
    });

    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        next();
    });

    app.use((req, res, next) => {
        const resolvedOrigin = resolveCorsOrigin(config.corsOrigin, req.headers.origin);
        const corsEnabled = Boolean(config.corsOrigin);

        if (resolvedOrigin) {
            res.setHeader('Access-Control-Allow-Origin', resolvedOrigin);
            if (resolvedOrigin !== '*') {
                res.setHeader(
                    'Vary',
                    appendVaryHeader(res.getHeader('Vary'), 'Origin')
                );
            }
            res.setHeader(
                'Access-Control-Allow-Methods',
                'GET,POST,PUT,PATCH,DELETE,OPTIONS'
            );
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.setHeader('Access-Control-Max-Age', '86400');
            // CORP must match CORS: same-origin (default) would block <link>/<img>
            // subresource loads from other origins even when CORS permits fetch access.
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        }

        if (req.method === 'OPTIONS' && corsEnabled) {
            if (req.headers.origin && !resolvedOrigin) {
                return res.status(403).json({ error: 'CORS origin not allowed.' });
            }
            return res.status(204).end();
        }

        return next();
    });

    app.use((req, res, next) => {
        if (req.method === 'POST' && req.path.startsWith('/api/')) {
            if (req.headers['content-encoding'] || !req.is('application/json')) {
                return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'POST API requests require application/json without content encoding.');
            }
        }
        return next();
    });

    app.use(express.json({ limit: config.maxBodyBytes }));

    app.use((req, res, next) => {
        if (req.method === 'POST' && req.path.startsWith('/api/') &&
            (!req.body || Array.isArray(req.body) || typeof req.body !== 'object')) {
            return sendError(res, 400, 'INVALID_BODY', 'Request body must be a JSON object.');
        }
        return next();
    });

    const pluginContext = buildPluginContext(state, config);
    const pluginRunner = createPluginRunner(plugins, { timeoutMs: pluginTimeoutMs, pluginContext });

    app.use(async (req, res, next) => {
        const block = await pluginRunner.runGuard({
            ip: getClientIp(req),
            method: req.method,
            path: req.path
        });
        if (block) {
            if (block.retryAfter != null) res.setHeader('Retry-After', block.retryAfter);
            const status = block.status ?? 429;
            return sendError(res, status, guardErrorCode(status), block.error ?? 'Blocked.');
        }
        return next();
    });
    const cacheStoreRunner = createCacheStoreRunner(cacheStore, {
        timeoutMs: cacheStoreTimeoutMs,
        onError: (context) => pluginRunner.runHook('onError', context)
    });
    const persistedBundles = ['full', 'utilities', 'theme'];
    const readOnlyWriteMessage = 'This replica is read-only. Route writes to a writer replica.';
    const isWriteAllowed = () => config.nodeRole !== 'reader';
    const reportWriteBlocked = async (action, context = {}) => {
        await pluginRunner.runHook('onError', {
            error: createReadOnlyError(action),
            stage: 'replica-role',
            code: READ_ONLY_ERROR_CODE,
            source: context.source ?? 'core',
            request: context.request ?? null,
            context: {
                ...context,
                nodeRole: config.nodeRole,
                action
            }
        });
    };
    const reportWriteBlockedAsync = (action, context = {}) => {
        queueMicrotask(() => {
            reportWriteBlocked(action, context).catch(() => {});
        });
    };

    // Wire mutation functions onto pluginContext
    const evictProjectLocal = (projectId) => {
        const project = state.projects.get(projectId);
        if (!project) return [];
        const pageIds = Array.from(project.pages.keys());
        for (const pageId of pageIds) {
            evictPageByKey(state, makePageKey(projectId, pageId));
        }
        state.projects.delete(projectId);
        return pageIds;
    };

    const purgePageArtifactsFromStore = async (projectId, pageId) => {
        if (!cacheStoreRunner?.enabled) return true;
        const results = await Promise.all(
            persistedBundles.map((bundle) =>
                cacheStoreRunner.deletePageArtifact({ projectId, pageId, bundle })
            )
        );
        return results.every(Boolean);
    };

    const purgeProjectArtifactsFromStore = async (projectId) => {
        if (!cacheStoreRunner?.enabled) return true;
        const results = await Promise.all(
            persistedBundles.map((bundle) =>
                cacheStoreRunner.deleteProjectArtifact({ projectId, bundle })
            )
        );
        return results.every(Boolean);
    };

    const purgeProjectPagesFromStore = async (projectId) => {
        if (!cacheStoreRunner?.enabled) return true;
        return cacheStoreRunner.deleteProjectPageArtifacts({ projectId });
    };

    pluginContext.evictPage = (projectId, pageId) => {
        if (!isWriteAllowed()) {
            reportWriteBlockedAsync('plugin-evict-page', { source: 'plugin', projectId, pageId });
            return;
        }
        evictPageByKey(state, makePageKey(projectId, pageId));
    };

    pluginContext.evictProject = (projectId) => {
        if (!isWriteAllowed()) {
            reportWriteBlockedAsync('plugin-evict-project', { source: 'plugin', projectId });
            return;
        }
        evictProjectLocal(projectId);
    };

    pluginContext.purgePage = async (projectId, pageId) => {
        if (!isWriteAllowed()) {
            await reportWriteBlocked('plugin-purge-page', { source: 'plugin', projectId, pageId });
            return false;
        }
        if (!isValidId(projectId, config) || !isValidId(pageId, config)) return false;
        evictPageByKey(state, makePageKey(projectId, pageId));
        return purgePageArtifactsFromStore(projectId, pageId);
    };

    pluginContext.purgeProject = async (projectId) => {
        if (!isWriteAllowed()) {
            await reportWriteBlocked('plugin-purge-project', { source: 'plugin', projectId });
            return false;
        }
        if (!isValidId(projectId, config)) return false;
        const pageIds = evictProjectLocal(projectId);
        let pageResult = true;
        if (pageIds.length > 0) {
            const pageResults = await Promise.all(
                pageIds.map((pageId) => purgePageArtifactsFromStore(projectId, pageId))
            );
            pageResult = pageResults.every(Boolean);
        }

        const hasBulkProjectPageDelete = cacheStoreRunner?.hasMethod?.('deleteProjectPageArtifacts');
        if (cacheStoreRunner?.enabled && (hasBulkProjectPageDelete || pageIds.length === 0)) {
            const bulkResult = await purgeProjectPagesFromStore(projectId);
            pageResult = pageResult && bulkResult;
        }

        const projectResult = await purgeProjectArtifactsFromStore(projectId);
        return pageResult && projectResult;
    };

    pluginContext.compile = async (input) => {
        const blockedProjectId = input?.projectId ?? null;
        const blockedPageId = input?.pageId ?? null;
        const blockedBundle = normalizeBundle(input?.bundle);
        if (!isWriteAllowed()) {
            await reportWriteBlocked('plugin-compile', {
                source: 'plugin',
                projectId: blockedProjectId,
                pageId: blockedPageId,
                bundle: blockedBundle
            });
            return { error: readOnlyWriteMessage, status: 409, code: READ_ONLY_ERROR_CODE };
        }
        const { projectId, pageId, html, classes, bundle } = input || {};
        if (!projectId || !isValidId(projectId, config)) return { error: 'Invalid projectId.', status: 400 };
        if (!pageId || !isValidId(pageId, config)) return { error: 'Invalid pageId.', status: 400 };
        if (html && typeof html === 'string' && html.length > config.maxHtmlChars) return { error: 'html too large.', status: 413 };
        if (classes && typeof classes === 'string' && classes.length > config.maxClassChars) return { error: 'classes too large.', status: 413 };

        const store = hookStore.getStore();
        const skipHooks = store?.inHook ?? false;
        const currentDepth = store?.compileChainDepth ?? 0;

        if (currentDepth >= chainDepthLimit) {
            const err = { error: 'Plugin compile chain depth exceeded.', status: 429 };
            if (!skipHooks) {
                await pluginRunner.runHook('onError', {
                    error: new Error(err.error), stage: 'compile', source: 'plugin',
                    code: 'PLUGIN_COMPILE_CHAIN_LIMIT', context: { projectId, pageId, bundle }
                });
            }
            return err;
        }

        return hookStore.run(
            { inHook: skipHooks, compileChainDepth: currentDepth + 1 },
            () => compileAndCachePage({
                state, config, projectId, pageId, html, classes, bundle,
                pluginRunner, cacheStoreRunner,
                queueStoreWrite,
                skipHooks,
                source: 'plugin',
                request: null
            })
        );
    };

    pluginContext.hydratePageArtifact = (input) => {
        if (!isWriteAllowed()) {
            reportWriteBlockedAsync('plugin-hydrate-page-artifact', {
                source: 'plugin',
                projectId: input?.projectId ?? null,
                pageId: input?.pageId ?? null,
                bundle: normalizeBundle(input?.bundle)
            });
            return false;
        }
        const { projectId, pageId, bundle, ...rest } = input || {};
        if (!projectId || !isValidId(projectId, config)) return false;
        if (!pageId || !isValidId(pageId, config)) return false;
        const sanitized = sanitizePageArtifact(rest, config);
        if (!sanitized) return false;
        return hydratePageFromArtifact(state, config, projectId, pageId, bundle, sanitized, { requireClasses: false });
    };

    pluginContext.hydrateProjectArtifact = (input) => {
        if (!isWriteAllowed()) {
            reportWriteBlockedAsync('plugin-hydrate-project-artifact', {
                source: 'plugin',
                projectId: input?.projectId ?? null,
                bundle: normalizeBundle(input?.bundle)
            });
            return false;
        }
        const { projectId, bundle, ...rest } = input || {};
        if (!projectId || !isValidId(projectId, config)) return false;
        const project = state.projects.get(projectId);
        if (!project) return false;
        const sanitized = sanitizeProjectArtifact(rest, config);
        if (!sanitized) return false;
        const normalizedBundle = normalizeBundle(bundle);
        if (normalizedBundle === 'base') return false;
        const cacheKey = normalizedBundle === 'utilities' ? 'utilitiesCssCache'
            : normalizedBundle === 'theme' ? 'themeCssCache' : 'cssCache';
        project[cacheKey] = {
            css: sanitized.css,
            hash: sanitized.hash,
            updatedAt: sanitized.updatedAt,
            expiresAt: sanitized.expiresAt
        };
        return true;
    };

    Object.freeze(pluginContext);

    const defaultSetupTimeout = Math.max((pluginTimeoutMs ?? 200) * 5, 1000);
    await mountPluginRoutes(
        app,
        pluginRunner.list,
        pluginContext,
        cacheStoreRunner,
        setupTimeoutMs ?? defaultSetupTimeout,
        { isWriteAllowed, reportWriteBlocked }
    );

    registerRoutes(
        app,
        pluginRunner,
        config,
        state,
        cacheStoreRunner,
        { isWriteAllowed, reportWriteBlocked },
        { queueStoreWrite }
    );

    app.use((req, res) => sendError(res, 404, 'NOT_FOUND', 'Not found.'));

    let closePromise = null;
    const close = () => {
        if (closePromise) return closePromise;
        closePromise = (async () => {
            await storeWriteQueue.drain();
            for (const plugin of [...pluginRunner.list].reverse()) {
                if (typeof plugin.instance.teardown === 'function') {
                    try {
                        await withTimeoutGeneric(
                            Promise.resolve(plugin.instance.teardown()),
                            plugin.timeoutMs,
                            `Plugin "${plugin.name}" teardown`
                        );
                    } catch { /* teardown errors are silent */ }
                }
            }
            await storeWriteQueue.drain();
        })();
        return closePromise;
    };

    return { app, close };
}

// =============================================================================
// CLI entry (node services/index.js)
// =============================================================================
const PORT = process.env.PORT || 3001;
const isDirectRun =
    process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
    createCore().then(({ app, close }) => {
        const server = app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
            console.log('In-memory cache enabled (no DB).');
        });
        const shutdown = async () => {
            await new Promise((resolve) => server.close(resolve));
            await close();
        };
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    });
}
