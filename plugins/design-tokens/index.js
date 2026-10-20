/**
 * Design Tokens Plugin
 *
 * Gives each project the theme its token file declares. A token file is
 * ordinary Tailwind v4 CSS: its `@theme { ... }` blocks hold the tokens, and
 * everything outside them is left alone. The plugin answers core's
 * `resolveTheme` hook with those declarations, so `--color-ink: #111` makes
 * `bg-ink` a class for that project and no other.
 *
 * By default a namespace the file declares replaces Tailwind's: a file with
 * `--color-*` tokens gets `--color-*: initial` first, so `bg-red-500` is
 * rejected rather than quietly off-palette. Namespaces the file does not
 * mention keep Tailwind's values.
 *
 * A declaration core would refuse, or a block nested inside `@theme`
 * (`@keyframes`), is dropped and reported by `readTokens`, so one bad line
 * costs the author that line and not every request for the project. Each
 * declaration is checked with core's own `parseTheme`, so the plugin cannot
 * accept what core refuses. The one exception is a file past core's length
 * limit: it is reported and passed on whole, and core fails the project's
 * requests closed rather than serving part of a design system.
 */

import { parseTheme } from '../../services/index.js';

// Tailwind v4 theme namespaces a declared token resets, longest first so
// `--font-weight-bold` is read as font-weight and not font. Spacing is left
// out on purpose: `--spacing-*: initial` also clears the `--spacing`
// multiplier every `p-4` and `gap-2` is computed from, so a file naming one
// spacing token would switch off the whole numeric scale.
const NAMESPACES = [
    'inset-shadow', 'drop-shadow', 'text-shadow', 'font-weight', 'breakpoint',
    'perspective', 'container', 'tracking', 'leading', 'animate', 'aspect',
    'shadow', 'radius', 'color', 'font', 'text', 'blur', 'ease'
];

const MAX_MEMO = 64;

function namespaceOf(name) {
    const key = name.slice(2);
    for (const ns of NAMESPACES) {
        if (key.startsWith(`${ns}-`)) return ns;
    }
    return null;
}

// Splits CSS into top-level pieces, honouring strings and comments, so a
// brace or semicolon inside `content: "}"` or a comment never ends a block.
function scan(css) {
    const pieces = [];
    let i = 0;
    let start = 0;
    const n = css.length;
    const skipString = (quote) => {
        i++;
        while (i < n && css[i] !== quote) {
            if (css[i] === '\\') i++;
            i++;
        }
        i++;
    };
    const skipComment = () => {
        const end = css.indexOf('*/', i + 2);
        i = end === -1 ? n : end + 2;
    };
    const skipBlock = () => {
        let depth = 0;
        while (i < n) {
            const ch = css[i];
            if (ch === '"' || ch === "'") { skipString(ch); continue; }
            if (ch === '/' && css[i + 1] === '*') { skipComment(); continue; }
            if (ch === '{') depth++;
            if (ch === '}') {
                depth--;
                if (depth === 0) { i++; return true; }
            }
            i++;
        }
        return false;
    };
    while (i < n) {
        const ch = css[i];
        if (ch === '"' || ch === "'") { skipString(ch); continue; }
        if (ch === '/' && css[i + 1] === '*') { skipComment(); continue; }
        if (ch === ';') {
            i++;
            pieces.push({ kind: 'statement', text: css.slice(start, i) });
            start = i;
            continue;
        }
        if (ch === '{') {
            const prelude = css.slice(start, i);
            const bodyStart = i + 1;
            const closed = skipBlock();
            pieces.push({
                kind: 'block',
                prelude,
                body: css.slice(bodyStart, closed ? i - 1 : i),
                text: css.slice(start, i),
                closed
            });
            start = i;
            continue;
        }
        i++;
    }
    if (start < n) pieces.push({ kind: 'statement', text: css.slice(start) });
    return pieces;
}

function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, ' ');
}

const THEME_PRELUDE_RE = /^\s*@theme\b([^]*)$/;

function themeBlocks(css) {
    return scan(css).filter((p) => p.kind === 'block' && THEME_PRELUDE_RE.test(stripComments(p.prelude)));
}

/**
 * Reads a token file. Returns the theme core takes, the declarations it was
 * built from, and what was dropped and why.
 */
export function readTokens(css, { replaceDefaults = true } = {}) {
    if (typeof css !== 'string') throw new TypeError('readTokens: css must be a string');
    const declarations = [];
    const issues = [];
    for (const block of themeBlocks(css)) {
        const options = stripComments(block.prelude).replace(/^\s*@theme\b/, '').trim();
        if (options && options !== 'static') {
            issues.push({ code: 'theme_option', message: `@theme ${options} is read as @theme.` });
        }
        if (!block.closed) issues.push({ code: 'unclosed_block', message: '@theme is never closed.' });
        for (const piece of scan(block.body)) {
            if (piece.kind === 'block') {
                const head = stripComments(piece.prelude).trim();
                issues.push({ code: 'nested_block', message: `${head} inside @theme is not a token and was skipped.` });
                continue;
            }
            const text = stripComments(piece.text).trim().replace(/;$/, '').trim();
            if (!text) continue;
            try {
                parseTheme(text);
            } catch (err) {
                if (err?.code !== 'INVALID_THEME') throw err;
                issues.push({ code: 'refused', message: err.message });
                continue;
            }
            const colon = text.indexOf(':');
            const name = text.slice(0, colon).trim();
            const value = text.slice(colon + 1).trim();
            declarations.push({ name, value });
        }
    }

    const lines = [];
    if (replaceDefaults) {
        const resetAll = declarations.some((d) => d.name === '--*');
        const resets = new Set(declarations.filter((d) => d.name.endsWith('-*')).map((d) => d.name.slice(2, -2)));
        const declared = new Set();
        for (const { name } of declarations) {
            if (name.endsWith('*')) continue;
            const ns = namespaceOf(name);
            if (ns && !resets.has(ns)) declared.add(ns);
        }
        if (!resetAll) for (const ns of [...declared].sort()) lines.push(`--${ns}-*: initial;`);
    }
    for (const { name, value } of declarations) lines.push(`${name}: ${value};`);
    const theme = lines.length ? lines.join('\n') : null;
    try {
        parseTheme(theme);
    } catch (err) {
        if (err?.code !== 'INVALID_THEME') throw err;
        issues.push({ code: 'refused', message: err.message });
    }
    return { theme, declarations, issues };
}

/** The theme core takes for this token file, or null when it declares nothing. */
export function themeOf(css, options) {
    return readTokens(css, options).theme;
}

/**
 * The token file as plain CSS a page can load without Tailwind: each @theme
 * block becomes `:root { ... }`, and blocks nested in it are moved after it.
 */
export function plainCss(css) {
    if (typeof css !== 'string') throw new TypeError('plainCss: css must be a string');
    let out = '';
    for (const piece of scan(css)) {
        if (piece.kind === 'block' && THEME_PRELUDE_RE.test(stripComments(piece.prelude))) {
            const lead = piece.prelude.match(/^\s*/)[0];
            let decls = '';
            let hoisted = '';
            for (const inner of scan(piece.body)) {
                if (inner.kind === 'block') hoisted += `\n${inner.text.trim()}`;
                else decls += inner.text;
            }
            out += `${lead}:root {${decls}}${hoisted}`;
        } else {
            out += piece.text;
        }
    }
    return out;
}

/**
 * `tokensFor(projectId, ctx)` returns the project's token CSS, or null for
 * Tailwind's stock theme. It runs on every request for the project, so it
 * should answer from memory.
 */
export function createDesignTokensPlugin({ tokensFor, replaceDefaults = true, timeoutMs } = {}) {
    if (typeof tokensFor !== 'function') throw new TypeError('createDesignTokensPlugin: tokensFor must be a function');
    const memo = new Map();
    const themeFor = (css) => {
        let theme = memo.get(css);
        if (theme === undefined) {
            theme = themeOf(css, { replaceDefaults });
            if (memo.size >= MAX_MEMO) memo.delete(memo.keys().next().value);
            memo.set(css, theme);
        }
        return theme;
    };
    return {
        name: 'design-tokens',
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
        async resolveTheme(ctx) {
            const css = await tokensFor(ctx.projectId, ctx);
            if (css === null || css === undefined) return null;
            if (typeof css !== 'string') throw new TypeError('design-tokens: tokensFor must return a string or null');
            return themeFor(css);
        }
    };
}

export default createDesignTokensPlugin;
