// Evidence script for the V1 plan's settled decisions (see ../README.md).
// Reproduces:
//   1. Compile cost of adversarial inputs that stay INSIDE the existing caps
//      (maxClassChars 10000, maxClassCount 1500, maxHtmlChars 50000).
//      Recorded result 2026-08-18: worst case ~10ms compile + ~7ms build.
//   2. The brace-expansion probe: brace tokens are rejected by candidatesToCss
//      (the pre-validation gate), so they never reach @source inline().
//   3. HTML scanner prose noise: plain words become failed candidates, which is
//      why the `rejected` response field uses explicit `classes` input only.
// Run from the repo root: node v1_milestone/evidence/compile-bench.mjs
import { compile, __unstable__loadDesignSystem } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const servicesDir = path.resolve(__dirname, '../../services');

// Mirrors services/index.js
const ESCAPE_BACKSLASH_RE = /\\/g;
const ESCAPE_QUOTE_RE = /"/g;
const UNSAFE_CLASS_CHAR_RE = /[);\n\r\0]/;

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
    const t0 = performance.now();
    const compiled = await compile(inputCss, { base: servicesDir, onDependency: () => {} });
    const t1 = performance.now();
    const css = compiled.build(classes);
    const t2 = performance.now();
    return { compileMs: t1 - t0, buildMs: t2 - t1, cssLen: css.length };
}

function capClasses(classes, maxChars = 10000, maxCount = 1500) {
    const out = [];
    let chars = 0;
    for (const c of classes) {
        if (out.length >= maxCount) break;
        if (chars + c.length + 1 > maxChars) break;
        out.push(c);
        chars += c.length + 1;
    }
    return out;
}

const scenarios = {
    baseline_100_normal() {
        const base = ['p-4', 'text-red-500', 'flex', 'items-center', 'gap-2', 'rounded-lg', 'shadow-md', 'bg-white', 'hover:bg-gray-50', 'md:p-8'];
        return capClasses(Array.from({ length: 100 }, (_, i) => base[i % base.length] + (i > 9 ? `-${i}` : '')));
    },
    max_count_arbitrary_values() {
        return capClasses(Array.from({ length: 1500 }, (_, i) => `w-[${i}px]`));
    },
    stacked_variants() {
        const stack = 'sm:md:lg:xl:2xl:dark:hover:focus:active:disabled:first:last:odd:even';
        return capClasses(Array.from({ length: 200 }, (_, i) => `${stack}:p-${i % 96}`));
    },
    arbitrary_selector_variants() {
        return capClasses(Array.from({ length: 150 }, (_, i) => `[&:nth-child(${i}n+${i})]:[color:rgb(${i},0,0)]`));
    },
    arbitrary_properties_big() {
        return capClasses(Array.from({ length: 300 }, (_, i) => `[--v${i}:calc(${i}*1px+${i}%)]`));
    },
    nested_calc_bomb() {
        const inner = 'calc(1px_+_calc(2px_+_calc(3px_+_calc(4px_+_calc(5px_+_6px)))))';
        return capClasses(Array.from({ length: 40 }, (_, i) => `w-[calc(${i}px_+_${inner})]`));
    },
    variant_group_explosion() {
        const variants = ['hover', 'focus', 'active', 'disabled', 'dark', 'sm', 'md', 'lg'];
        const out = [];
        for (const a of variants) for (const b of variants) for (const c of variants) {
            if (a !== b && b !== c && a !== c) out.push(`${a}:${b}:${c}:underline`);
        }
        return capClasses(out);
    }
};

console.log('--- 1. Adversarial compile cost within input caps ---');
for (const [name, make] of Object.entries(scenarios)) {
    const classes = make();
    const r = await generateCssForClasses(classes);
    console.log(`${name}: n=${classes.length} compile=${r.compileMs.toFixed(0)}ms build=${r.buildMs.toFixed(0)}ms css=${r.cssLen}b`);
}

console.log('--- 2. Brace-expansion probe ---');
const ds = await __unstable__loadDesignSystem('@import "tailwindcss/theme.css";', { base: servicesDir });
const braceToken = '{hover:,focus:}p-1';
console.log(`candidatesToCss("${braceToken}") ->`, JSON.stringify(ds.candidatesToCss([braceToken])), '(null = rejected by the validation gate)');
const bomb = Array.from({ length: 16 }, () => '{a-,b-}').join('') + 'p-1';
const bombInput = ['@layer theme, base, components, utilities;', '@import "tailwindcss/utilities";', `@source inline("${bomb}");`].join('\n');
const tb0 = performance.now();
const bombCompiled = await compile(bombInput, { base: servicesDir, onDependency: () => {} });
const bombCss = bombCompiled.build([]);
console.log(`force-fed 2^16 brace expansion: ${(performance.now() - tb0).toFixed(0)}ms, css=${bombCss.length}b (invalid candidates die cheap)`);

console.log('--- 3. HTML scanner prose noise ---');
const prose = 'The quick brown fox jumps over the lazy dog and considers flex table center block hidden static '.repeat(400);
const html = `<div class="p-4 text-red-500">${prose}</div>`.slice(0, 50000);
const scanner = new Scanner({ sources: [] });
const candidates = scanner.scanFiles([{ content: html, extension: 'html' }]);
const cssResults = ds.candidatesToCss(candidates);
const invalid = candidates.filter((_, i) => cssResults[i] === null);
console.log(`candidates=${candidates.length} invalid=${invalid.length} sampleInvalid=${JSON.stringify(invalid.slice(0, 8))}`);
console.log('conclusion: rejected must be computed from explicit classes input only.');
