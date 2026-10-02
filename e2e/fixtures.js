import { test as base, expect } from '@playwright/test';

export const APP = '/rich-wind/lexical-demo/';
export const STORAGE_KEY = 'rw-lexical-demo-v4';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * Every test gets a fresh browser context, so localStorage starts empty. On top
 * of that this fixture:
 *  - blocks every non-local request, so the suite never depends on a CDN (the
 *    Suggestions row lazily loads an embedding model from one);
 *  - fails the test on an uncaught page error or a failed /api request
 *    (4xx, 5xx, including 429), unless the test lists the path in
 *    `allowedApiFailures`.
 */
export const test = base.extend({
  allowedApiFailures: [[], { option: true }],
  page: async ({ page }, use) => {
    await page.route((url) => !LOCAL_HOSTS.has(url.hostname), (route) => route.abort());
    await use(page);
  },
  issues: [async ({ page, allowedApiFailures }, use) => {
    const issues = [];
    page.on('pageerror', (err) => issues.push(`pageerror: ${err.message}`));
    page.on('response', (res) => {
      const url = new URL(res.url());
      if (!url.pathname.includes('/api/') || res.status() < 400) return;
      if (allowedApiFailures.some((p) => url.pathname.includes(p))) return;
      issues.push(`${res.request().method()} ${url.pathname}${url.search} -> ${res.status()}`);
    });
    await use(issues);
    // The demo fires deferred requests (shared-bundle refresh, clearing a deleted
    // page's classes on the core). The core is shared by all tests, so let them land
    // before the next test starts, or a late "clear" can empty the next test's theme.
    await page.waitForTimeout(700).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    expect(issues, 'page errors and failed /api requests').toEqual([]);
  }, { auto: true }],
});

export { expect };

/** Opens the demo and waits until the first compile finished and the theme is loaded. */
export async function openDemo(page) {
  await page.goto(APP);
  await expect(page.locator('.editor-input')).toBeVisible();
  await expect(page.locator('.rw-status')).toHaveText(/Compiled|Cached/);
  // Theme variables arrive in a second, deferred request: wait until every
  // --color-* the compiled CSS refers to is defined.
  await expect.poll(() => page.evaluate(() => {
    const css = document.getElementById('rw-editor-css')?.textContent || '';
    const names = [...new Set([...css.matchAll(/var\((--color-[a-z0-9-]+)/g)].map((m) => m[1]))];
    const cs = getComputedStyle(document.documentElement);
    const missing = names.filter((n) => !cs.getPropertyValue(n).trim());
    return missing.length || names.length ? missing.slice(0, 5).join(',') : 'no colors in css';
  }), { message: 'theme color variables resolve (missing ones listed)', timeout: 20_000 }).toBe('');
}

/** Activates a control from the keyboard (focus + Enter), for controls that move under the pointer on hover. */
export async function activate(locator) {
  await locator.focus();
  await locator.page().keyboard.press('Enter');
}

export function cssVar(page, name) {
  return page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
}

/** A top-level block (paragraph or heading) of the editor that contains `text`. */
export function block(page, text) {
  return page.locator('.editor-input > :is(p, h1, h2, h3, h4, h5, h6)', { hasText: text }).first();
}

/** An inline styled span (a tailwind-span node) that contains `text`. */
export function span(page, text) {
  return page.locator('.editor-input span[data-lexical-text]', { hasText: text }).first();
}

/** Computed style values of one element: `await styles(loc, 'display', 'color')`. */
export function styles(locator, ...props) {
  return locator.evaluate((el, list) => {
    const cs = getComputedStyle(el);
    return Object.fromEntries(list.map((p) => [p, cs.getPropertyValue(p)]));
  }, props);
}

/** Any CSS color as [r, g, b, a] (0-255, alpha 0-1), however the browser serialised it. */
export function rgba(page, cssColor) {
  return page.evaluate((c) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, Math.round((a / 255) * 100) / 100];
  }, cssColor);
}

/** True for a resolved, visible color: not empty, not transparent, no unresolved var(). */
export function isRealColor(value) {
  const v = String(value || '').trim();
  return v !== '' && v !== 'transparent' && v !== 'rgba(0, 0, 0, 0)' && !v.includes('var(');
}

export function classesOf(locator) {
  return locator.getAttribute('class').then((c) => (c || '').split(/\s+/).filter(Boolean));
}

export const makeItField = (page) => page.getByRole('textbox', { name: 'Make it' });
export const strip = (page) => page.locator('footer.rw-strip');
export const tab = (page, label) => page.locator('.page-tab', { hasText: label });

/** Types at the end of the block that contains `anchorText`. */
export async function typeAtEnd(page, anchorText, text) {
  await block(page, anchorText).click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
}

/** Waits until the debounced save has written something that includes `needle` to localStorage. */
export function savedState(page, needle) {
  return expect.poll(() => page.evaluate(([k, n]) => (localStorage.getItem(k) || '').includes(n), [STORAGE_KEY, needle]), { message: `localStorage ${STORAGE_KEY} contains ${needle}` }).toBe(true);
}
