import type { Locator, Page } from '@playwright/test';

import { expect, test } from './coverage';

/* The browser-local fixture editor must not rotate an authenticated spec's refresh token. */
test.use({ storageState: { cookies: [], origins: [] } });

const editorPath = '/rulesets/local-rules/rulebooks/starter/edit';

async function dragThrough(source: Locator, targets: readonly Locator[], page: Page, release = true) {
  await source.scrollIntoViewIfNeeded();
  for (const target of targets) {
    await target.scrollIntoViewIfNeeded();
  }
  const sourceBox = await source.boundingBox();
  const targetBoxes = await Promise.all(targets.map((target) => target.boundingBox()));
  if (!sourceBox || targetBoxes.some((box) => box === null)) {
    throw new Error('A drag source or target has no rendered bounds.');
  }
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.mouse.down();
  for (const targetBox of targetBoxes) {
    if (!targetBox) {
      continue;
    }
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  }
  if (release) {
    await page.mouse.up();
    await expect(page.locator('[data-rail-dragging="true"]')).toHaveCount(0);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
}

async function drag(source: Locator, target: Locator, page: Page, release = true) {
  await dragThrough(source, [target], page, release);
}

function rulebookStructure(page: Page) {
  return page.getByRole('complementary', { name: 'Rulebook structure' });
}

test('the URL owns Page, Control-region, and Block navigation', async ({ page }) => {
  await page.goto(editorPath);
  await expect(page).toHaveURL(/#CHAP\/details$/);

  const structure = rulebookStructure(page);
  await structure.getByRole('link', { name: 'Movement', exact: true }).click();
  await expect(page).toHaveURL(/#RULE\/details$/);
  await expect(structure.getByRole('link', { name: 'Page details' })).toHaveAttribute('aria-current', 'page');

  await structure.getByRole('link', { name: 'Page guidance' }).click();
  await expect(page).toHaveURL(/#RULE\/guidance$/);
  await expect(page.getByRole('textbox', { name: 'Eyebrow' })).toHaveValue('Rules page');

  await structure.getByRole('link', { name: 'Movement sequence' }).click();
  await expect(page).toHaveURL(/#RULE\/MVVE$/);
  await expect(page.getByRole('textbox', { name: 'Content' })).toHaveValue(
    'Choose a force, choose an adjacent destination, then resolve the move.'
  );

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Content' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#RULE\/guidance$/);
  await page.goForward();
  await expect(page).toHaveURL(/#RULE\/MVVE$/);

  await page.goto(`${editorPath}#RULE/not-a-leaf`);
  await expect(page).toHaveURL(/#RULE\/details$/);
  await page.goto(`${editorPath}#RULE/TEXT`);
  await expect(page.getByRole('textbox', { name: 'Content' })).toHaveValue(
    'The storm closes the boundary between its two sectors.'
  );
});

test('draft edits stay live and diagnostics block Save', async ({ page }) => {
  await page.goto(`${editorPath}#RULE/details`);

  const title = page.getByRole('textbox', { name: 'Title' });
  const anchor = page.getByRole('textbox', { name: 'Anchor' });
  const save = page.getByRole('button', { name: 'Save' });
  await anchor.fill('Not a valid anchor');
  await expect(save).toBeDisabled();
  await expect(page.getByText('Use lowercase letters, numbers, and single hyphens')).toBeVisible();

  await title.fill('Advanced movement');
  await expect(page.getByLabel('Rulebook preview placeholder')).toContainText('Advanced movement');
  await anchor.fill('advanced-movement');
  await expect(page.getByText('Local changes')).toBeVisible();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeDisabled();
  await expect(page.getByText('Saved draft')).toBeVisible();
});

test('Pages sort vertically in the root rail without changing the active URL', async ({ page }) => {
  await page.goto(`${editorPath}#RULE/details`);

  const structure = rulebookStructure(page);
  const pages = structure.getByRole('navigation', { name: 'Pages' });
  const source = pages.getByLabel('Movement', { exact: true });
  const target = pages.getByLabel('Welcome to Arrakis');
  const originalUrl = page.url();
  const sourceBox = await source.boundingBox();
  if (!sourceBox) {
    throw new Error('The Page rail item has no rendered bounds.');
  }
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width + 90, sourceBox.y + sourceBox.height / 2 + 8, { steps: 6 });
  await expect
    .poll(() => source.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41))
    .toBe(0);
  await page.mouse.up();

  await drag(source, target, page);
  await expect
    .poll(() => pages.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label'))))
    .toEqual(['Movement', 'Welcome to Arrakis', 'Markers and tokens']);
  expect(page.url()).toBe(originalUrl);
});

test('Blocks sort and move between compatible rail regions while incompatible regions fade', async ({ page }) => {
  await page.goto(`${editorPath}#RULE/details`);

  const structure = rulebookStructure(page);
  const rules = structure.getByRole('list', { name: 'Rules' });
  const examples = structure.getByRole('list', { name: 'Examples' });
  const movement = structure.getByRole('link', { name: 'Movement sequence' });
  const text = structure.getByRole('link', { name: 'The storm closes the boundary between its two sectors.' });
  const storm = structure.getByRole('link', { name: 'Storm marker' });
  const originalUrl = page.url();

  await drag(text, movement, page);
  await expect
    .poll(() => rules.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label'))))
    .toEqual(['The storm closes the boundary between its two sectors.', 'Movement sequence']);
  expect(page.url()).toBe(originalUrl);

  await drag(text, storm, page);
  await expect(rules.getByRole('link', { name: 'The storm closes the boundary between its two sectors.' })).toHaveCount(
    0
  );
  await expect(
    examples.getByRole('link', { name: 'The storm closes the boundary between its two sectors.' })
  ).toBeVisible();

  await drag(movement, examples, page, false);
  await expect(examples.locator('..')).toHaveCSS('opacity', '0.28');
  await page.mouse.up();
  await expect(rules.getByRole('link', { name: 'Movement sequence' })).toBeVisible();
  expect(page.url()).toBe(originalUrl);
});

test('Page details supports top, bottom, reversal, compatible, and full-region Block placement', async ({ page }) => {
  await page.goto(`${editorPath}#RULE/details`);

  const rules = page.getByRole('region', { name: 'Rules' });
  const examples = page.getByRole('region', { name: 'Examples' });
  const movement = rules.getByRole('button', { name: 'Edit Movement sequence' });
  const text = rules.getByRole('button', {
    name: 'Edit The storm closes the boundary between its two sectors.',
  });
  const storm = examples.getByRole('button', { name: 'Edit Storm marker' });
  const originalUrl = page.url();
  const ruleBlockNames = () =>
    rules
      .getByRole('list')
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));

  await drag(text, movement, page);
  await expect
    .poll(ruleBlockNames)
    .toEqual(['Edit The storm closes the boundary between its two sectors.', 'Edit Movement sequence']);

  await drag(text, movement, page);
  await expect
    .poll(ruleBlockNames)
    .toEqual(['Edit Movement sequence', 'Edit The storm closes the boundary between its two sectors.']);

  await dragThrough(text, [movement, text], page);
  await expect
    .poll(ruleBlockNames)
    .toEqual(['Edit Movement sequence', 'Edit The storm closes the boundary between its two sectors.']);

  await drag(text, storm, page);
  await expect(
    rules.getByRole('button', { name: 'Edit The storm closes the boundary between its two sectors.' })
  ).toHaveCount(0);
  await expect(
    examples.getByRole('button', { name: 'Edit The storm closes the boundary between its two sectors.' })
  ).toBeVisible();

  await rules.getByRole('button', { name: 'Add a Block to Rules' }).click();
  await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
  await rulebookStructure(page).getByRole('link', { name: 'Page details' }).click();
  const newText = rules.getByRole('button', { name: 'Edit Replace this starter content with your text.' });
  await drag(newText, storm, page, false);
  await expect(examples).toHaveAttribute('data-drop-eligibility', 'incompatible');
  await page.mouse.up();
  await expect(newText).toBeVisible();
  expect(page.url()).toBe(originalUrl);
});

test('an empty compatible rail region accepts a Block and Page-details regions remain separately sortable', async ({
  page,
}) => {
  await page.goto(`${editorPath}#RULE/details`);

  const structure = rulebookStructure(page);
  await structure.getByRole('button', { name: 'Add Page' }).click();
  await page.getByRole('menuitem', { name: 'Rules page' }).click();
  await expect(page).toHaveURL(/#[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}\/details$/);

  await structure.getByRole('button', { name: 'Add Block' }).click();
  await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
  const newText = structure.getByRole('link', { name: 'Replace this starter content with your text.' });
  const emptyExamples = structure.getByRole('list', { name: 'Examples' });
  await expect(emptyExamples.getByRole('link')).toHaveCount(0);
  await drag(newText, emptyExamples.locator('..'), page);
  await expect(emptyExamples.getByRole('link', { name: 'Replace this starter content with your text.' })).toBeVisible();

  await structure.getByRole('link', { name: 'Page details' }).click();
  const rulesRegion = page.getByRole('region', { name: 'Rules' });
  const examplesRegion = page.getByRole('region', { name: 'Examples' });
  await expect(rulesRegion.getByRole('list')).toHaveCount(0);
  await expect(examplesRegion.getByRole('button', { name: /Edit Replace this starter content/ })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse Examples' }).click();
  await expect(page.getByRole('button', { name: 'Expand Examples' })).toBeVisible();
});

test('the neutral preview stays aligned and only the narrow workspace scrolls horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(editorPath);

  const layout = page.locator('[data-document-editor-layout]');
  const sidebar = rulebookStructure(page);
  const preview = page.getByLabel('Rulebook preview placeholder');
  await expect(layout).toHaveAttribute('data-fit', 'height');
  const fitHeightBox = await preview.boundingBox();
  const sidebarBox = await sidebar.boundingBox();
  expect(fitHeightBox).not.toBeNull();
  expect(sidebarBox).not.toBeNull();
  if (!fitHeightBox || !sidebarBox) {
    throw new Error('The Rulebook editor surfaces have no rendered bounds.');
  }
  expect(fitHeightBox.width / fitHeightBox.height).toBeCloseTo(210 / 297, 2);
  expect(Math.abs(sidebarBox.y - fitHeightBox.y)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('article', { name: 'Rulebook page preview' })).toHaveCount(0);

  await page.setViewportSize({ width: 320, height: 700 });
  const workspace = page.getByRole('region', { name: 'Rulebook editor and preview' });
  await expect.poll(() => layout.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth === document.documentElement.clientWidth &&
          document.body.scrollWidth === document.body.clientWidth
      )
    )
    .toBe(true);
  await workspace.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => layout.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});
