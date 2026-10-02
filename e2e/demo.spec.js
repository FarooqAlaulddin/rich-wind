import {
  test, expect, openDemo, block, span, styles, rgba, isRealColor, cssVar, classesOf,
  makeItField, activate, strip, tab, typeAtEnd, savedState, APP, STORAGE_KEY,
} from './fixtures.js';

const editor = (page) => page.locator('.editor-input');

test.describe('load', () => {
  test('renders with no console errors and no failed /api requests', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    await openDemo(page);

    await expect(page.getByText('Rich Wind', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Block format' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Make it' })).toBeVisible();
    await expect(page.locator('.page-tab')).toHaveText([/Overview/, /How it works/, /Use it/]);
    await expect(page.locator('.page-tab.active')).toContainText('Overview');

    const css = await page.locator('style#rw-editor-css').evaluate((el) => el.textContent);
    expect(css.length).toBeGreaterThan(1000);
    expect(css).toContain('--color-indigo-500');

    // Let the deferred shared-bundle refresh settle before judging the console.
    await expect(page.locator('.rw-status')).toHaveText(/Compiled|Cached/);
    await page.waitForTimeout(800);
    expect(consoleErrors).toEqual([]);
  });

  test('landing panel shows before anything is selected and its try phrases fill the field', async ({ page }) => {
    await openDemo(page);
    const landing = page.getByRole('region', { name: 'How Rich Wind works' });
    await expect(landing).toBeVisible();
    // The explainer lists real classes from the page with the CSS they compiled to.
    await expect(landing.locator('.explain-row').first()).toContainText('->');
    await landing.getByRole('button', { name: 'background blue' }).click();
    await expect(makeItField(page)).toHaveValue('background blue');
    await expect(page.getByRole('group', { name: 'Matches' })).toContainText('bg-blue-500');
  });
});

test.describe('sample pages are styled', () => {
  test('Overview', async ({ page }) => {
    await openDemo(page);

    // Project theme variables resolve to real values, not empty (past first-load race).
    for (const v of ['--color-indigo-500', '--color-violet-500', '--color-fuchsia-500', '--color-indigo-600', '--color-slate-900', '--spacing']) {
      expect(await cssVar(page, v), v).not.toBe('');
    }

    // Gradient headline: background-image is a real gradient and the text is transparent.
    const grad = span(page, 'did not exist');
    await expect.poll(async () => (await styles(grad, 'background-image'))['background-image']).toContain('linear-gradient');
    const g = await styles(grad, 'background-image', 'color', '-webkit-background-clip', 'background-clip');
    expect(g['background-image']).not.toContain('var(');
    expect(await rgba(page, g.color)).toEqual([0, 0, 0, 0]);
    expect(`${g['background-clip']} ${g['-webkit-background-clip']}`).toContain('text');

    // The h1 sized and weighted by its classes (md:text-6xl applies at 1440px).
    const h1 = block(page, 'Tailwind for markup that');
    expect(await h1.evaluate((el) => el.tagName)).toBe('H1');
    const h = await styles(h1, 'font-size', 'font-weight', 'color');
    expect(h['font-size']).toBe('60px');
    expect(h['font-weight']).toBe('800');
    expect(isRealColor(h.color)).toBe(true);

    // Chip: real background and text colors from the indigo theme, pill radius.
    const chip = block(page, 'Runtime Tailwind CSS compiler');
    const c = await styles(chip, 'background-color', 'color', 'border-top-left-radius', 'text-transform');
    expect(isRealColor(c['background-color'])).toBe(true);
    expect(isRealColor(c.color)).toBe(true);
    expect(c['text-transform']).toBe('uppercase');
    expect(parseFloat(c['border-top-left-radius'])).toBeGreaterThan(1000);

    // Call to action: indigo fill with a shadow.
    const cta = await styles(span(page, 'See how it works'), 'background-color', 'box-shadow', 'cursor');
    expect(isRealColor(cta['background-color'])).toBe(true);
    expect(cta['box-shadow']).not.toBe('none');
    expect(cta.cursor).toBe('pointer');

    // Cards container is a grid with the gradient surface; the card titles are filled.
    const cards = block(page, 'Honest output');
    const grid = await styles(cards, 'display', 'grid-auto-flow', 'background-image', 'border-top-left-radius');
    expect(grid.display).toBe('grid');
    expect(grid['grid-auto-flow']).toContain('column');
    expect(grid['background-image']).toContain('linear-gradient');
    expect(parseFloat(grid['border-top-left-radius'])).toBe(24);
    const title = await styles(span(page, 'Honest output'), 'background-color', 'padding-left', 'font-weight');
    expect(isRealColor(title['background-color'])).toBe(true);
    expect(title['padding-left']).toBe('20px');
    expect(title['font-weight']).toBe('700');

    // Nav bar: flex row with a bottom border.
    const nav = await styles(block(page, 'Rich WindOverview'), 'display', 'border-bottom-width');
    expect(nav.display).toBe('flex');
    expect(nav['border-bottom-width']).toBe('1px');
  });

  test('How it works', async ({ page }) => {
    await openDemo(page);
    await tab(page, 'How it works').getByRole('button').first().click();
    await expect(block(page, 'From class names to CSS')).toBeVisible();

    const h2 = block(page, 'From class names to CSS');
    expect(await h2.evaluate((el) => el.tagName)).toBe('H2');
    await expect.poll(async () => (await styles(h2, 'font-size'))['font-size']).toBe('36px');

    // A numbered step: flex row, round gradient badge with white text.
    const step = await styles(block(page, 'Send'), 'display', 'gap', 'margin-top');
    expect(step.display).toBe('flex');
    expect(step.gap).toBe('16px');
    const badge = span(page, '1');
    await expect.poll(async () => (await styles(badge, 'background-image'))['background-image']).toContain('linear-gradient');
    const b = await styles(badge, 'display', 'width', 'height', 'color', 'border-top-left-radius', 'font-weight');
    expect(b.display).toBe('grid');
    expect(b.width).toBe('36px');
    expect(b.height).toBe('36px');
    expect(await rgba(page, b.color)).toEqual([255, 255, 255, 1]);
    expect(parseFloat(b['border-top-left-radius'])).toBeGreaterThan(1000);

    // Pipeline row: flex, monospaced, with the pill colors from the theme.
    const row = await styles(block(page, 'page utilities'), 'display', 'flex-wrap', 'font-family');
    expect(row.display).toBe('flex');
    expect(row['flex-wrap']).toBe('wrap');
    expect(row['font-family']).toMatch(/mono/i);
    const pill = await styles(span(page, 'promoted'), 'background-color', 'padding-left');
    expect(isRealColor(pill['background-color'])).toBe(true);
    expect(pill['padding-left']).toBe('10px');

    // The rejected-typo callout: left rule and a struck-through example.
    const note = await styles(block(page, 'compiles to nothing'), 'border-left-width', 'background-color');
    expect(note['border-left-width']).toBe('4px');
    expect(isRealColor(note['background-color'])).toBe(true);
    const strike = await styles(span(page, 'text-blu-500'), 'text-decoration-line');
    expect(strike['text-decoration-line']).toContain('line-through');
  });

  test('Use it', async ({ page }) => {
    await openDemo(page);
    await tab(page, 'Use it').getByRole('button').first().click();
    await expect(block(page, 'Mount it, or call it directly')).toBeVisible();

    // Code block: dark background, light text, monospace, grid.
    const code = block(page, 'createCore');
    await expect.poll(async () => (await styles(code, 'background-color'))['background-color']).not.toBe('rgba(0, 0, 0, 0)');
    const c = await styles(code, 'display', 'background-color', 'color', 'font-family', 'overflow-x', 'border-top-left-radius');
    expect(c.display).toBe('grid');
    expect(c['font-family']).toMatch(/mono/i);
    expect(c['overflow-x']).toBe('auto');
    expect(c['border-top-left-radius']).toBe('16px');
    const bg = await rgba(page, c['background-color']);
    const fg = await rgba(page, c.color);
    expect(Math.max(...bg.slice(0, 3))).toBeLessThan(40);
    expect(Math.min(...fg.slice(0, 3))).toBeGreaterThan(200);

    // Color-coded code lines resolve real colors from the theme.
    const imp = await styles(span(page, 'import { createCore }'), 'color', 'white-space');
    expect(isRealColor(imp.color)).toBe(true);
    expect(imp['white-space']).toBe('pre');

    // Endpoint table: a two-column grid.
    const table = await styles(block(page, 'POST /api/compile'), 'display', 'grid-template-columns');
    expect(table.display).toBe('grid');
    expect(table['grid-template-columns'].split(' ')).toHaveLength(2);

    // Button-like paragraph: green fill, pill.
    const btn = await styles(block(page, 'Try it: type a class in the panel'), 'background-color', 'cursor', 'width');
    expect(isRealColor(btn['background-color'])).toBe(true);
    expect(btn.cursor).toBe('pointer');
  });
});

test.describe('pages', () => {
  test('switching tabs changes the content, keeps styles and shows the KB size', async ({ page }) => {
    await openDemo(page);
    // The visited page has a compiled size in its tab.
    await expect(tab(page, 'Overview').locator('.page-tab-kb')).toHaveText(/^\d+\.\d KB$/);

    await tab(page, 'How it works').getByRole('button').first().click();
    await expect(page.locator('.page-tab.active')).toContainText('How it works');
    await expect(block(page, 'From class names to CSS')).toBeVisible();
    await expect(block(page, 'Tailwind for markup that')).toHaveCount(0);
    await expect(tab(page, 'How it works').locator('.page-tab-kb')).toHaveText(/^\d+\.\d KB$/);
    await expect.poll(async () => (await styles(block(page, 'From class names to CSS'), 'font-size'))['font-size']).toBe('36px');

    await tab(page, 'Use it').getByRole('button').first().click();
    await expect(block(page, 'Mount it, or call it directly')).toBeVisible();
    await expect(block(page, 'From class names to CSS')).toHaveCount(0);
    await expect(tab(page, 'Use it').locator('.page-tab-kb')).toHaveText(/^\d+\.\d KB$/);

    await tab(page, 'Overview').getByRole('button').first().click();
    await expect(block(page, 'Tailwind for markup that')).toBeVisible();
    await expect.poll(async () => (await styles(span(page, 'did not exist'), 'background-image'))['background-image']).toContain('linear-gradient');
    // Every page now reports a size.
    await expect(page.locator('.page-tab-kb')).toHaveCount(3);
  });

  test('add a page and delete pages', async ({ page }) => {
    await openDemo(page);

    await page.getByRole('button', { name: 'Add page' }).click();
    await expect(page.locator('.page-tab')).toHaveCount(4);
    await expect(page.locator('.page-tab.active')).toContainText('Page 4');
    await expect(block(page, 'Start typing...')).toBeVisible();
    await expect(block(page, 'Tailwind for markup that')).toHaveCount(0);

    // The new page keeps what is typed into it, across a tab switch.
    await block(page, 'Start typing...').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Fresh page text');
    await expect(block(page, 'Fresh page text')).toBeVisible();
    await tab(page, 'Overview').getByRole('button').first().click();
    await expect(block(page, 'Tailwind for markup that')).toBeVisible();
    await tab(page, 'Page 4').getByRole('button').first().click();
    await expect(block(page, 'Fresh page text')).toBeVisible();

    // Delete the active page: focus falls back to the first remaining one.
    await page.getByTitle('Delete Page 4').click();
    await expect(page.locator('.page-tab')).toHaveText([/Overview/, /How it works/, /Use it/]);
    await expect(page.locator('.page-tab.active')).toContainText('Overview');
    await expect(block(page, 'Tailwind for markup that')).toBeVisible();

    // Delete inactive pages down to one: the last page cannot be deleted.
    await page.getByTitle('Delete How it works').click();
    await page.getByTitle('Delete Use it').click();
    await expect(page.locator('.page-tab')).toHaveCount(1);
    await expect(page.locator('.page-tab.active')).toContainText('Overview');
    await expect(page.locator('.page-tab-delete')).toHaveCount(0);
  });

  test('an added page survives a reload', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Add page' }).click();
    await expect(page.locator('.page-tab.active')).toContainText('Page 4');
    await savedState(page, 'page-4');
    await page.reload();
    await expect(page.locator('.page-tab')).toHaveCount(4);
    await expect(page.locator('.page-tab.active')).toContainText('Page 4');
  });
});

test.describe('persistence', () => {
  test('an edit survives a reload and Reset restores the sample pages', async ({ page }) => {
    await openDemo(page);
    await tab(page, 'Use it').getByRole('button').first().click();
    await expect(block(page, 'Mount it, or call it directly')).toBeVisible();
    await typeAtEnd(page, 'Mount it, or call it directly', ' EDITED');
    await expect(block(page, 'EDITED')).toBeVisible();
    await savedState(page, 'EDITED');

    await page.reload();
    await expect(page.locator('.rw-status')).toHaveText(/Compiled|Cached/);
    await expect(page.locator('.page-tab.active')).toContainText('Use it');
    await expect(block(page, 'Mount it, or call it directly EDITED')).toBeVisible();
    // Still styled after the reload.
    await expect.poll(async () => (await styles(block(page, 'Mount it, or call it directly EDITED'), 'font-size'))['font-size']).toBe('36px');

    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.locator('.page-tab.active')).toContainText('Overview');
    await expect(page.locator('.page-tab')).toHaveText([/Overview/, /How it works/, /Use it/]);
    await tab(page, 'Use it').getByRole('button').first().click();
    await expect(block(page, 'Mount it, or call it directly')).toBeVisible();
    await expect(block(page, 'EDITED')).toHaveCount(0);
  });

  test('Reset also drops added pages', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Add page' }).click();
    await expect(page.locator('.page-tab')).toHaveCount(4);
    await savedState(page, 'page-4');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.locator('.page-tab')).toHaveCount(3);
    await expect(page.locator('.page-tab.active')).toContainText('Overview');
    await expect(block(page, 'Tailwind for markup that')).toBeVisible();
  });
});

test.describe('block format', () => {
  test('heading to paragraph and back keeps the Tailwind classes', async ({ page }) => {
    await openDemo(page);
    const select = page.getByRole('combobox', { name: 'Block format' });
    const h1 = block(page, 'Tailwind for markup that');
    const before = await classesOf(h1);
    expect(before).toEqual(expect.arrayContaining(['mt-4', 'text-4xl', 'font-extrabold', 'tracking-tight']));

    await page.locator('.editor-input h1 > span[data-lexical-text]').first().click();
    await expect(select).toHaveValue('h1');

    await select.selectOption('paragraph');
    const asP = page.locator('.editor-input > p', { hasText: 'Tailwind for markup that' });
    await expect(asP).toHaveCount(1);
    await expect(page.locator('.editor-input > h1')).toHaveCount(0);
    expect(await classesOf(asP)).toEqual(before);
    // The compiled style still applies to the paragraph.
    await expect.poll(async () => (await styles(asP, 'font-weight'))['font-weight']).toBe('800');
    // Inline styled children survive the conversion.
    await expect(span(page, 'did not exist')).toBeVisible();
    await expect(select).toHaveValue('paragraph');

    await select.selectOption('h2');
    const asH2 = page.locator('.editor-input > h2', { hasText: 'Tailwind for markup that' });
    await expect(asH2).toHaveCount(1);
    await expect(page.locator('.editor-input > p', { hasText: 'Tailwind for markup that' })).toHaveCount(0);
    expect(await classesOf(asH2)).toEqual(before);
    await expect(select).toHaveValue('h2');
  });
});

test.describe('style panel', () => {
  test('adding a class from the search styles the element, and it can be removed', async ({ page }) => {
    await openDemo(page);
    const chip = block(page, 'Runtime Tailwind CSS compiler');
    await chip.click();
    const rows = page.getByRole('region', { name: 'Selected element' });
    await expect(rows.locator('.shelf-tag')).toHaveText('<p>');
    await expect(rows.getByText('bg-indigo-50', { exact: false }).first()).toBeVisible();
    await expect.poll(async () => isRealColor((await styles(chip, 'background-color'))['background-color'])).toBe(true);
    const before = (await styles(chip, 'background-color'))['background-color'];

    const field = makeItField(page);
    await field.fill('background rose');
    const cards = page.getByRole('group', { name: 'Matches' });
    await expect(cards.locator('.card-cls').first()).toHaveText('bg-rose-500');
    await field.press('Enter');

    // The background group is replaced, not stacked.
    await expect.poll(() => classesOf(chip)).toContain('bg-rose-500');
    expect(await classesOf(chip)).not.toContain('bg-indigo-50');
    await expect(field).toHaveValue('');
    // After the compile the computed background is the rose color.
    await expect.poll(async () => isRealColor((await styles(chip, 'background-color'))['background-color'])
      && (await styles(chip, 'background-color'))['background-color'] !== before).toBe(true);
    const after = (await styles(chip, 'background-color'))['background-color'];
    const [r, g, b] = await rgba(page, after);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
    // The class row shows the CSS Rich Wind compiled for it.
    const row = rows.locator('.crow', { hasText: 'bg-rose-500' });
    await expect(row).toContainText('background-color');
    await expect(row).toContainText('--color-rose-500');

    await rows.getByRole('button', { name: 'Remove bg-rose-500' }).click();
    await expect.poll(() => classesOf(chip)).not.toContain('bg-rose-500');
    await expect.poll(async () => (await styles(chip, 'background-color'))['background-color']).toBe('rgba(0, 0, 0, 0)');
  });

  test('keyboard: arrows move through the cards, hover previews, Enter applies, Esc clears', async ({ page }) => {
    await openDemo(page);
    const chip = block(page, 'Runtime Tailwind CSS compiler');
    await chip.click();
    const field = makeItField(page);
    await field.fill('background rose');
    const cards = page.getByRole('group', { name: 'Matches' });
    await expect(cards.locator('.card-cls').first()).toHaveText('bg-rose-500');

    // Down from the field lands on the first card; Right moves past its "why" button to the next card.
    await field.press('ArrowDown');
    await expect(cards.locator('.card').first().locator('.card-main')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(cards.locator('.card').first().locator('.card-why')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    const second = cards.locator('.card').nth(1);
    await expect(second.locator('.card-main')).toBeFocused();
    const secondClass = (await second.locator('.card-cls').textContent()).trim();
    expect(secondClass).toMatch(/^bg-rose-\d+$/);

    // Focus previews the class in the panel without touching the page.
    await expect(page.locator('.pending .prow.is-add')).toContainText(secondClass);
    expect(await classesOf(chip)).not.toContain(secondClass);

    await page.keyboard.press('Enter');
    await expect.poll(() => classesOf(chip)).toContain(secondClass);
    await expect(page.locator('.pending')).toHaveCount(0);

    // Esc clears a typed query.
    await field.fill('bold');
    await field.press('Escape');
    await expect(field).toHaveValue('');
  });

  test('"why" shows the CSS a card resolves to, and hover previews in the panel only', async ({ page }) => {
    await openDemo(page);
    const chip = block(page, 'Runtime Tailwind CSS compiler');
    await chip.click();
    await makeItField(page).fill('p-8');
    const cards = page.getByRole('group', { name: 'Matches' });
    const first = cards.locator('.card').first();
    await expect(first.locator('.card-cls')).toHaveText('p-8');
    await first.getByRole('button', { name: 'why' }).click();
    await expect(first.locator('.card-css')).toContainText('padding');

    const padBefore = (await styles(chip, 'padding-top'))['padding-top'];
    await first.locator('.card-main').hover();
    await expect(page.locator('.pending .prow.is-add')).toContainText('p-8');
    await page.mouse.move(0, 0);
    await expect(page.locator('.pending')).toHaveCount(0);
    expect((await styles(chip, 'padding-top'))['padding-top']).toBe(padBefore);
  });

  test('a variant scope prefixes the class (hover:)', async ({ page }) => {
    await openDemo(page);
    const chip = block(page, 'Runtime Tailwind CSS compiler');
    await chip.click();
    const scope = page.getByRole('toolbar', { name: 'Applies at' });
    await scope.getByRole('button', { name: 'hover', exact: true }).click();
    await expect(scope.getByRole('button', { name: 'hover', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.shelf-applies')).toContainText('hover');

    await makeItField(page).fill('background rose');
    await makeItField(page).press('Enter');
    await expect.poll(() => classesOf(chip)).toContain('hover:bg-rose-500');
    // The base background is untouched, the hover one is additional.
    expect(await classesOf(chip)).toContain('bg-indigo-50');
    await expect(page.getByRole('region', { name: 'Selected element' }).locator('.crow', { hasText: /bg-rose-500/ }).first()).toBeVisible();

    // Hovering the element swaps in the rose background once compiled.
    const base = (await styles(chip, 'background-color'))['background-color'];
    await expect.poll(async () => {
      await chip.hover();
      return (await styles(chip, 'background-color'))['background-color'];
    }).not.toBe(base);
  });

  test('Ctrl+K focuses the Make it field from the editor', async ({ page }) => {
    await openDemo(page);
    await block(page, 'Runtime Tailwind CSS compiler').click();
    await expect(editor(page)).toBeFocused();
    await page.keyboard.press('Control+k');
    await expect(makeItField(page)).toBeFocused();
  });

  test('Browse: space strip and color palette apply classes', async ({ page }) => {
    await openDemo(page);
    const chip = block(page, 'Runtime Tailwind CSS compiler');
    await chip.click();
    await page.getByRole('button', { name: 'Browse' }).click();

    await page.getByRole('tab', { name: 'Space' }).click();
    await activate(page.getByRole('group', { name: 'Change' }).getByRole('button', { name: 'p-8', exact: true }));
    await expect.poll(() => classesOf(chip)).toContain('p-8');
    await expect.poll(async () => (await styles(chip, 'padding-top'))['padding-top']).toBe('32px');

    await page.getByRole('tab', { name: 'Color' }).click();
    const palette = page.getByRole('group', { name: 'Change' });
    await activate(palette.getByRole('button', { name: 'Background', exact: true }));
    await activate(palette.getByRole('button', { name: 'emerald', exact: true }));
    const before = (await styles(chip, 'background-color'))['background-color'];
    await activate(palette.getByRole('button', { name: 'bg-emerald-600', exact: true }));
    await expect.poll(() => classesOf(chip)).toContain('bg-emerald-600');
    expect(await classesOf(chip)).not.toContain('bg-indigo-50');
    await expect.poll(async () => (await styles(chip, 'background-color'))['background-color']).not.toBe(before);
    const [r, g, b] = await rgba(page, (await styles(chip, 'background-color'))['background-color']);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  test('a phrase nobody understands changes nothing and offers a Suggestions row', async ({ page }) => {
    await openDemo(page);
    const chip = block(page, 'Runtime Tailwind CSS compiler');
    await chip.click();
    const before = await classesOf(chip);
    const field = makeItField(page);
    await field.fill('zzzqq');
    await expect(page.locator('.make-it .shelf-note')).toContainText('Try a class');
    await field.press('Enter');
    await expect(page.getByRole('group', { name: 'Suggestions' })).toBeAttached();
    expect(await classesOf(chip)).toEqual(before);
  });

  test('clicking an inline span targets it and shows its classes', async ({ page }) => {
    await openDemo(page);
    const inline = span(page, 'AI-written UI');
    await inline.click();
    const rows = page.getByRole('region', { name: 'Selected element' });
    await expect(rows.locator('.shelf-tag')).toHaveText('<span>');
    await expect(rows.locator('.crow')).toHaveCount((await classesOf(inline)).length);
    await expect(rows.locator('.crow', { hasText: 'font-semibold' })).toContainText('font-weight');
  });

  // Hover text sits on one fixed line, so previews never reflow the panel and
  // move a control out from under a still pointer (which made it flicker).
  test('no Browse control moves when the pointer rests on it, in any tab', async ({ page }) => {
    await openDemo(page);
    await block(page, 'Runtime Tailwind CSS compiler').click();
    await page.getByRole('button', { name: 'Browse' }).click();
    const moved = [];
    for (const tab of await page.getByRole('tab').allTextContents()) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      const controls = page.locator('.browse-body [data-nav]');
      const n = await controls.count();
      for (let i = 0; i < n; i++) {
        const control = controls.nth(i);
        const box = await control.boundingBox();
        if (!box || box.y < 0 || box.y + box.height > page.viewportSize().height) continue;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(60);
        const y = await control.evaluate((e) => e.getBoundingClientRect().y);
        if (Math.round(y - box.y) !== 0) moved.push(`${tab}: ${(await control.textContent()).trim()} moved ${Math.round(y - box.y)}px`);
      }
      await page.mouse.move(5, 5);
    }
    expect(moved).toEqual([]);
  });

  test('hovering a value shows from -> to on the status line', async ({ page }) => {
    await openDemo(page);
    await block(page, 'Runtime Tailwind CSS compiler').click();
    await page.getByRole('button', { name: 'Browse' }).click();
    await page.getByRole('tab', { name: 'Space' }).click();
    const status = page.locator('.make-it .shelf-status');
    await expect(status).toContainText('Hover a value');
    await page.getByRole('group', { name: 'Padding' }).getByRole('button', { name: 'p-8', exact: true }).hover();
    await expect(status).toHaveText(/-> p-8$/);
    await page.mouse.move(5, 5);
    await expect(status).toContainText('Hover a value');
  });

  test('the selected element shows readable text, variant prefixes, and the CSS of dark-theme classes', async ({ page }) => {
    await openDemo(page);
    const nav = block(page, 'Rich Wind');
    const box = await nav.boundingBox();
    // Its bottom padding: the middle of the row would land on an inline span.
    await nav.click({ position: { x: 4, y: box.height - 3 } });
    const rows = page.getByRole('region', { name: 'Selected element' });
    await expect(rows.locator('.shelf-snippet')).toHaveText(/^Rich Wind Overview How it works Use it/);
    const dark = rows.locator('.crow', { hasText: '[.theme-dark_&]:border-slate-700' });
    await expect(dark).toContainText('inside .theme-dark');
    await expect(dark).toContainText('border-color');
    await expect(rows.locator('.crow-msg')).toHaveCount(0);
  });
});

test.describe('editor animation', () => {
  test.use({ reducedMotion: 'no-preference' });

  // Records every Element.animate() call on editor content as { tag, props: { prop: [from, to] } }.
  const record = (page) => page.evaluate(() => {
    window.__anims = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, opts) {
      if (this.closest('.editor-input') && Array.isArray(frames) && frames.length === 2) {
        const props = {};
        for (const k of Object.keys(frames[0])) props[k] = [frames[0][k], frames[1][k]];
        window.__anims.push({ text: this.textContent.slice(0, 40), props });
      }
      return animate.call(this, frames, opts);
    };
  });
  const anims = (page) => page.evaluate(() => window.__anims);
  const settled = (loc) => loc.evaluate((e) => e.getAnimations().length === 0);

  test('hovering, applying and removing a class each ease the block into its new look', async ({ page }) => {
    await openDemo(page);
    const chip = block(page, 'Runtime Tailwind CSS compiler');
    await chip.click();
    const startPad = (await styles(chip, 'padding-top'))['padding-top'];
    await page.getByRole('button', { name: 'Browse' }).click();
    await page.getByRole('tab', { name: 'Space' }).click();
    await record(page);

    const p8 = page.getByRole('group', { name: 'Padding' }).getByRole('button', { name: 'p-8', exact: true });
    await p8.hover();
    await expect.poll(async () => (await anims(page)).some((a) => a.props.paddingTop?.[1] === '32px')).toBe(true);
    await expect.poll(() => settled(chip)).toBe(true);
    expect((await styles(chip, 'padding-top'))['padding-top']).toBe('32px');

    await p8.click();
    await expect.poll(() => classesOf(chip)).toContain('p-8');
    await page.mouse.move(5, 5);
    await expect.poll(() => settled(chip)).toBe(true);
    expect((await styles(chip, 'padding-top'))['padding-top']).toBe('32px');
    // The click commits what the hover showed: nothing plays back to the old padding first.
    expect((await anims(page)).filter((a) => a.props.paddingTop?.[1] === startPad)).toEqual([]);

    await page.evaluate(() => { window.__anims = []; });
    // Sample padding-top every frame while removing: it passes through values between the two ends.
    await page.evaluate((text) => {
      window.__pads = [];
      const t0 = performance.now();
      const tick = () => {
        // Found again each frame: Lexical may re-create the element on a class change.
        const el = [...document.querySelectorAll('.editor-input > *')].find((e) => e.textContent.includes(text));
        window.__pads.push(parseFloat(getComputedStyle(el).paddingTop));
        if (performance.now() - t0 < 800) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, 'Runtime Tailwind CSS compiler');
    await page.getByRole('region', { name: 'Selected element' }).getByRole('button', { name: 'Remove p-8' }).click();
    await expect.poll(() => classesOf(chip)).not.toContain('p-8');
    await expect.poll(async () => (await anims(page)).some((a) => a.props.paddingTop?.[0] === '32px')).toBe(true);
    await expect.poll(() => settled(chip)).toBe(true);
    expect((await styles(chip, 'padding-top'))['padding-top']).toBe(startPad);
    const end = parseFloat(startPad);
    const pads = await page.evaluate(() => window.__pads);
    expect(pads.some((v) => v > end && v < 32), `padding-top per frame: ${pads.join(' ')}`).toBe(true);
  });

  test('with reduced motion the change is immediate', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDemo(page);
    const chip = block(page, 'Runtime Tailwind CSS compiler');
    await chip.click();
    await page.getByRole('button', { name: 'Browse' }).click();
    await page.getByRole('tab', { name: 'Space' }).click();
    await record(page);
    const p8 = page.getByRole('group', { name: 'Padding' }).getByRole('button', { name: 'p-8', exact: true });
    await p8.hover();
    await p8.click();
    await expect.poll(() => classesOf(chip)).toContain('p-8');
    expect(await anims(page)).toEqual([]);
  });
});

test.describe('examples and rejected classes', () => {
  test('loading an example replaces the content and it is styled', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Examples' }).click();
    await expect(page.getByRole('menuitem')).not.toHaveCount(0);
    await page.getByRole('menuitem', { name: /Landing hero/ }).click();

    await expect(page.getByRole('menu')).toHaveCount(0);
    const h1 = block(page, 'Tailwind at runtime, no build step');
    await expect(h1).toBeVisible();
    await expect(block(page, 'Tailwind for markup that')).toHaveCount(0);
    await expect.poll(async () => (await styles(h1, 'background-image'))['background-image']).toContain('linear-gradient');
    const s = await styles(h1, 'font-size', 'font-weight', 'color');
    expect(await rgba(page, s.color)).toEqual([0, 0, 0, 0]);
    expect(s['font-weight']).toBe('800');
    const mark = await styles(span(page, 'Every class in this hero'), 'background-color', 'color');
    expect(isRealColor(mark['background-color'])).toBe(true);
    expect(isRealColor(mark.color)).toBe(true);
  });

  test('Escape closes the Examples menu', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Examples' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('unknown classes are reported as rejected and Remove strips them', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Examples' }).click();
    await page.getByRole('menuitem', { name: /AI pricing card/ }).click();
    const bad = span(page, 'auto-promoted utilities');
    await expect(bad).toBeVisible();
    expect(await classesOf(bad)).toContain('text-brand-500');

    const rejected = strip(page).locator('.rw-rejected');
    await expect(rejected).toContainText('2 rejected');

    // The block holding the bad rounded-xxl class is flagged in the panel.
    await block(page, 'Start free trial').click();
    const row = page.getByRole('region', { name: 'Selected element' }).locator('.crow.is-rejected');
    await expect(row).toContainText('rounded-xxl');

    // Valid classes still compile while the bad ones are reported.
    const price = block(page, '$24');
    await expect.poll(async () => (await styles(price, 'font-size'))['font-size']).toBe('48px');

    await rejected.getByRole('button', { name: 'Remove' }).click();
    await expect(strip(page).locator('.rw-rejected')).toHaveCount(0);
    expect(await classesOf(bad)).not.toContain('text-brand-500');
    expect(await classesOf(block(page, 'Start free trial'))).not.toContain('rounded-xxl');
    expect(await classesOf(block(page, 'Start free trial'))).toContain('bg-indigo-600');
  });

  test('Load example from the landing panel', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('region', { name: 'How Rich Wind works' }).getByRole('button', { name: /Load example/ }).click();
    await expect(block(page, 'Pro plan')).toBeVisible();
  });
});

test.describe('theme', () => {
  test('dark mode toggles the theme, the button label and the dark: styles, and persists', async ({ page }) => {
    await openDemo(page);
    const toggle = page.getByRole('button', { name: 'Toggle dark mode' });
    const html = page.locator('html');
    const brand = span(page, 'Rich Wind');
    await expect(toggle).toHaveText('Dark');
    await expect(html).not.toHaveClass(/theme-dark/);
    const light = await rgba(page, (await styles(brand, 'color'))['color']);

    await toggle.click();
    await expect(toggle).toHaveText('Light');
    await expect(html).toHaveClass(/theme-dark/);
    // text-slate-900 becomes text-white through the [.theme-dark_&] variant.
    await expect.poll(async () => rgba(page, (await styles(brand, 'color'))['color'])).toEqual([255, 255, 255, 1]);
    expect(light).not.toEqual([255, 255, 255, 1]);
    expect(await page.evaluate(() => localStorage.getItem('rw-lexical-theme'))).toBe('dark');

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/theme-dark/);
    await expect(page.getByRole('button', { name: 'Toggle dark mode' })).toHaveText('Light');

    await page.getByRole('button', { name: 'Toggle dark mode' }).click();
    await expect(page.locator('html')).not.toHaveClass(/theme-dark/);
    await expect(page.getByRole('button', { name: 'Toggle dark mode' })).toHaveText('Dark');
  });
});

test.describe('Rich Wind strip', () => {
  test('CSS view shows the page, shared and full CSS', async ({ page }) => {
    await openDemo(page);
    await expect(strip(page).locator('.rw-total')).toHaveText(/^\d+\.\d KB$/);
    await expect(strip(page).locator('.rw-split')).toContainText('shared');
    await strip(page).getByRole('button', { name: 'CSS', exact: true }).click();
    const code = strip(page).locator('.rw-code');
    await expect(code).toContainText('font-extrabold');
    await strip(page).getByRole('tab', { name: 'Shared' }).click();
    await expect(code).toContainText('--color-indigo-500');
    await strip(page).getByRole('tab', { name: 'Full CSS' }).click();
    await expect(code).toContainText('--color-indigo-500');
    await expect(code).toContainText('font-extrabold');
    await strip(page).getByRole('button', { name: 'CSS', exact: true }).click();
    await expect(strip(page).locator('.rw-code')).toHaveCount(0);
  });

  test('Export shows a standalone page, copies the CSS and downloads the file', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openDemo(page);
    await block(page, 'Runtime Tailwind CSS compiler').click();

    await page.getByRole('button', { name: 'Export', exact: true }).first().click();
    const code = strip(page).locator('.rw-code');
    await expect(code).toContainText('<!doctype html>');
    await expect(code).toContainText('richwind-loader.js');
    await expect(code).toContainText('richwind-reload.js');
    await expect(code).toContainText('data-project-id="lexical-demo"');
    await expect(code).toContainText('data-page-id="home"');
    // The page HTML, with its Tailwind classes, is in the export body.
    await expect(code).toContainText('Runtime Tailwind CSS compiler');
    await expect(code).toContainText('bg-indigo-50');
    await expect(code).toContainText('<h1');

    // Copy CSS puts the whole compiled stylesheet on the clipboard.
    await strip(page).getByRole('button', { name: 'Copy CSS' }).click();
    await expect(strip(page).getByRole('button', { name: 'Copied' })).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    const sheet = await page.locator('style#rw-editor-css').evaluate((el) => el.textContent);
    expect(clip).toBe(sheet);
    expect(clip).toContain('--color-indigo-500');
    expect(clip).toContain('font-extrabold');

    const download = page.waitForEvent('download');
    await strip(page).getByRole('button', { name: 'Download .html' }).click();
    expect((await download).suggestedFilename()).toBe('rich-wind-page.html');

    // The header and the strip share one toggle.
    await strip(page).getByRole('button', { name: 'Export', exact: true }).click();
    await expect(strip(page).locator('.rw-code')).toHaveCount(0);
  });

  test('the export follows the active page', async ({ page }) => {
    await openDemo(page);
    await tab(page, 'Use it').getByRole('button').first().click();
    await expect(block(page, 'Mount it, or call it directly')).toBeVisible();
    await strip(page).getByRole('button', { name: 'Export', exact: true }).click();
    const code = strip(page).locator('.rw-code');
    await expect(code).toContainText('data-page-id="contact"');
    await expect(code).toContainText('Mount it, or call it directly');
    await expect(code).not.toContainText('Tailwind for markup that');
  });
});

test.describe('layout', () => {
  test('page tabs, the add button and the block select share a vertical center', async ({ page }) => {
    await openDemo(page);
    const centers = () => page.evaluate(() => {
      const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
      return [
        ...[...document.querySelectorAll('.page-tab')].map((el) => ['tab', mid(el)]),
        ['add', mid(document.querySelector('.page-tab-add'))],
        ['select', mid(document.querySelector('.block-select'))],
      ];
    });
    const spread = (list) => Math.max(...list.map((c) => c[1])) - Math.min(...list.map((c) => c[1]));

    let list = await centers();
    expect(list.map((c) => c[0])).toEqual(['tab', 'tab', 'tab', 'add', 'select']);
    expect(spread(list)).toBeLessThanOrEqual(1);

    // Still aligned with a longer tab row.
    await page.getByRole('button', { name: 'Add page' }).click();
    await expect(page.locator('.page-tab')).toHaveCount(4);
    list = await centers();
    expect(spread(list)).toBeLessThanOrEqual(1);
  });
});

test.describe('boot', () => {
  test('the app is served from the production bundle under its base path', async ({ page }) => {
    const res = await page.goto(APP);
    expect(res.status()).toBe(200);
    const scripts = await page.locator('script[type="module"]').evaluateAll((els) => els.map((e) => e.src));
    expect(scripts.some((s) => /\/assets\/index-[\w-]+\.js$/.test(s))).toBe(true);
    // The production bundle has to talk to the local core, never the hosted one.
    const external = [];
    page.on('request', (r) => { if (!['localhost', '127.0.0.1'].includes(new URL(r.url()).hostname)) external.push(r.url()); });
    await page.reload();
    await expect(page.locator('.rw-status')).toHaveText(/Compiled|Cached/);
    expect(external).toEqual([]);
    expect(STORAGE_KEY).toBe('rw-lexical-demo-v4');
  });
});
