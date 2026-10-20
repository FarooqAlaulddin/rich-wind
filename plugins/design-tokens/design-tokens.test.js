import { describe, it, expect } from 'vitest';
import { createCore, parseTheme } from '../../services/index.js';
import { createDesignTokensPlugin, readTokens, themeOf, plainCss } from './index.js';

const TOKENS = `
/* brand tokens */
@import "tailwindcss";
@theme {
  --color-ink: #111111;
  --color-paper: #fafafa; /* page */
  --font-display: "Inter", sans-serif;
  --font-weight-heavy: 850;
  --radius-card: 6px;
  --spacing: 0.25rem;
  --spacing-gutter: 1.5rem;
}
.note { color: var(--color-ink); }
`;

describe('readTokens', () => {
  it('reads @theme declarations and resets each namespace they name, never spacing', () => {
    const { theme, issues } = readTokens(TOKENS);
    expect(issues).toEqual([]);
    expect(theme.split('\n')).toEqual([
      '--color-*: initial;',
      '--font-*: initial;',
      '--font-weight-*: initial;',
      '--radius-*: initial;',
      '--color-ink: #111111;',
      '--color-paper: #fafafa;',
      '--font-display: "Inter", sans-serif;',
      '--font-weight-heavy: 850;',
      '--radius-card: 6px;',
      '--spacing: 0.25rem;',
      '--spacing-gutter: 1.5rem;'
    ]);
  });

  it('adds no resets when replaceDefaults is off', () => {
    const theme = themeOf(TOKENS, { replaceDefaults: false });
    expect(theme).not.toContain('initial');
    expect(theme).toContain('--color-ink: #111111;');
  });

  it('keeps an author reset rather than doubling it, and a global reset adds none', () => {
    expect(themeOf('@theme { --color-*: initial; --color-ink: #000; }').split('\n'))
      .toEqual(['--color-*: initial;', '--color-ink: #000;']);
    expect(themeOf('@theme { --*: initial; --color-ink: #000; }').split('\n'))
      .toEqual(['--*: initial;', '--color-ink: #000;']);
  });

  it('leaves an unknown namespace alone', () => {
    expect(themeOf('@theme { --brand-hue: 210; }')).toBe('--brand-hue: 210;');
  });

  it('returns null for a file with no @theme', () => {
    expect(themeOf(':root { --color-ink: #000; }')).toBeNull();
    expect(themeOf('')).toBeNull();
  });

  it('merges several @theme blocks and reads @theme static as @theme', () => {
    const { theme, issues } = readTokens('@theme { --color-a: #000; } @theme static { --color-b: #fff; }');
    expect(issues).toEqual([]);
    expect(theme).toContain('--color-a: #000;');
    expect(theme).toContain('--color-b: #fff;');
  });

  it('drops and reports everything core would refuse, so the theme always compiles', () => {
    const { theme, issues } = readTokens(`@theme inline {
      --color-ok: #123456;
      --color-bad: red} body { color: blue;
    }
    @theme {
      --color-at: @apply;
      --color-slash: \\61;
      --color-*: none;
      color: red;
      @keyframes spin { to { transform: rotate(1turn); } }
      --animate-spin: spin 1s linear infinite;
    }`);
    expect(issues.map((i) => i.code)).toEqual([
      'theme_option', 'refused', 'refused', 'refused', 'refused', 'nested_block'
    ]);
    expect(theme).toContain('--color-ok: #123456;');
    // As in CSS, the brace closes the block: the token is `red`, and the rule
    // after it is outside @theme.
    expect(theme).toContain('--color-bad: red;');
    expect(theme).not.toContain('blue');
    expect(theme).toContain('--animate-spin: spin 1s linear infinite;');
    expect(theme).not.toMatch(/[{}@\\]/);
  });

  it('is not fooled by braces or semicolons in strings and comments', () => {
    const { theme, issues } = readTokens(
      '/* @theme { --color-x: #000; } */ @theme { --font-q: "a;}b"; /* } */ --color-y: #fff; --font-r: "plain"; }'
    );
    // The quoted value stays one declaration here; core splits on every
    // semicolon, so it is refused whole and its neighbours survive.
    expect(issues.map((i) => i.code)).toEqual(['refused']);
    expect(theme).not.toContain('--color-x');
    expect(theme).not.toContain('--font-q');
    expect(theme).toContain('--color-y: #fff;');
    expect(theme).toContain('--font-r: "plain";');
  });

  it('hands core only what core accepts, except a file past the length limit', () => {
    const { theme, issues } = readTokens(`@theme { ${'--color-a: #000; '.repeat(3)} --color-b: x;y; }`);
    expect(issues.map((i) => i.code)).toEqual(['refused']);
    expect(() => parseTheme(theme)).not.toThrow();

    const long = readTokens(`@theme { ${Array.from({ length: 8000 }, (_, i) => `--color-c${i}: #000000;`).join(' ')} }`);
    expect(long.issues.map((i) => i.code)).toEqual(['refused']);
    expect(() => parseTheme(long.theme)).toThrow(expect.objectContaining({ code: 'INVALID_THEME' }));
  });

  it('reports an @theme that is never closed', () => {
    const { theme, issues } = readTokens('@theme { --color-ink: #000;');
    expect(issues.map((i) => i.code)).toEqual(['unclosed_block']);
    expect(theme).toContain('--color-ink: #000;');
  });
});

describe('plainCss', () => {
  it('turns @theme into :root and leaves the rest of the file as written', () => {
    const out = plainCss(TOKENS);
    expect(out).toContain(':root {');
    expect(out).not.toContain('@theme');
    expect(out).toContain('--color-ink: #111111;');
    expect(out).toContain('.note { color: var(--color-ink); }');
    expect(out).toContain('@import "tailwindcss";');
  });

  it('moves a block nested in @theme after it', () => {
    const out = plainCss('@theme { --animate-x: x 1s; @keyframes x { to { opacity: 0; } } }');
    expect(out).toMatch(/^:root \{ --animate-x: x 1s; \s*\}\n@keyframes x \{ to \{ opacity: 0; \} \}$/);
  });
});

describe('createDesignTokensPlugin', () => {
  it('requires tokensFor', () => {
    expect(() => createDesignTokensPlugin()).toThrow(TypeError);
  });

  it('gives each project the theme its token file declares', async () => {
    const files = new Map([['brand', TOKENS]]);
    const core = await createCore({
      plugins: createDesignTokensPlugin({ tokensFor: (projectId) => files.get(projectId) ?? null })
    });
    try {
      const classes = 'bg-ink text-paper font-display font-heavy font-bold rounded-card p-4 gap-2 px-gutter bg-red-500 font-sans';
      const brand = await core.compile({ projectId: 'brand', pageId: 'home', classes });
      // The file declares a font weight, so Tailwind's weights go with it.
      expect(brand.classes).toEqual([
        'bg-ink', 'font-display', 'font-heavy', 'gap-2', 'p-4', 'px-gutter', 'rounded-card', 'text-paper'
      ]);
      expect(brand.rejected.sort()).toEqual(['bg-red-500', 'font-bold', 'font-sans']);

      const stock = await core.compile({ projectId: 'other', pageId: 'home', classes });
      expect(stock.classes).toContain('bg-red-500');
      expect(stock.classes).not.toContain('bg-ink');
    } finally {
      await core.close();
    }
  });

  it('follows the token file when it changes', async () => {
    const files = new Map([['brand', '@theme { --color-ink: #111; }']]);
    const core = await createCore({
      plugins: createDesignTokensPlugin({ tokensFor: (projectId) => files.get(projectId) ?? null })
    });
    try {
      const first = await core.compile({ projectId: 'brand', pageId: 'home', classes: 'bg-ink bg-paper' });
      expect(first.classes).toEqual(['bg-ink']);
      files.set('brand', '@theme { --color-paper: #fafafa; }');
      const second = await core.compile({ projectId: 'brand', pageId: 'home', classes: 'bg-ink bg-paper' });
      expect(second.classes).toEqual(['bg-paper']);
      expect(second.hash).not.toBe(first.hash);
    } finally {
      await core.close();
    }
  });

  it('serves a file with problems instead of failing the project', async () => {
    const core = await createCore({
      plugins: createDesignTokensPlugin({
        tokensFor: () => '@theme { --color-ink: #111; --color-bad: url(x) @media; @keyframes k { to { top: 0; } } }'
      })
    });
    try {
      const out = await core.compile({ projectId: 'brand', pageId: 'home', classes: 'bg-ink bg-bad' });
      expect(out.classes).toEqual(['bg-ink']);
    } finally {
      await core.close();
    }
  });

  it('fails the request closed when tokensFor throws or returns a non-string', async () => {
    for (const tokensFor of [() => { throw new Error('disk gone'); }, () => 42]) {
      const core = await createCore({ plugins: createDesignTokensPlugin({ tokensFor }) });
      try {
        await expect(core.compile({ projectId: 'brand', pageId: 'home', classes: 'p-4' }))
          .rejects.toMatchObject({ code: 'INTERNAL' });
      } finally {
        await core.close();
      }
    }
  });
});
