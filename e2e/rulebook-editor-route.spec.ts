import { expect, test } from './coverage';

/* The browser-local fixture editor must not rotate an authenticated spec's refresh token. */
test.use({ storageState: { cookies: [], origins: [] } });

test('the local Rulebook editor keeps its A4 preview synchronized', async ({ page }) => {
  await page.goto('/rulesets/local-rules/rulebooks/starter/edit');

  await expect(page.getByRole('heading', { name: 'Edit starter' })).toBeVisible();
  await expect(page.getByText('It does not load from or save to the database.')).toBeVisible();

  const preview = page.getByRole('region', { name: 'Rulebook page preview' });
  await expect(preview).toBeVisible();

  await page.getByText('Edit page', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Text block' }).fill('A browser-local Rulebook revision.');

  await expect(preview).toContainText('A browser-local Rulebook revision.');
});

test('invalid formatted text stays literal in the preview', async ({ page }) => {
  await page.goto('/rulesets/local-rules/rulebooks/starter/edit');
  await page.getByText('Edit page', { exact: true }).click();

  const invalidText = '*bold _underline* still underline_';
  await page.getByRole('textbox', { name: 'Text block' }).fill(invalidText);

  const preview = page.getByRole('region', { name: 'Rulebook page preview' });
  await expect(preview.getByText(invalidText, { exact: true })).toBeVisible();
  await expect(preview.locator('strong')).toHaveCount(0);
});

test('selecting a Page enters Edit mode', async ({ page }) => {
  await page.goto('/rulesets/local-rules/rulebooks/starter/edit');

  await page.getByRole('button', { name: /Page 2/ }).click();

  await expect(page.getByRole('radio', { name: 'Edit page' })).toBeChecked();
  await expect(page.getByRole('heading', { name: 'Edit Page 2' })).toBeVisible();
});

test('fit height shows the full Page while fit width provides a materially larger scrolling preview', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/rulesets/local-rules/rulebooks/starter/edit');
  await page.getByRole('button', { name: /Page 2/ }).click();

  const previewScroller = page.getByRole('region', { name: 'Rulebook page preview' });
  const previewPage = page.getByRole('article', { name: 'Preview of Page 2' });
  await expect(previewPage).toBeVisible();
  const fitHeightBox = await previewPage.boundingBox();
  expect(fitHeightBox).not.toBeNull();
  if (!fitHeightBox) {
    throw new Error('The fit-height preview has no rendered bounds.');
  }
  expect(fitHeightBox.width).toBeGreaterThan(0);
  await expect
    .poll(() => previewScroller.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeLessThanOrEqual(1);

  await page.getByText('Fit width', { exact: true }).click();

  const fitWidthBox = await previewPage.boundingBox();
  expect(fitWidthBox).not.toBeNull();
  if (!fitWidthBox) {
    throw new Error('The fit-width preview has no rendered bounds.');
  }
  expect(fitWidthBox.width).toBeGreaterThan(0);
  expect(fitWidthBox.width / fitHeightBox.width).toBeGreaterThanOrEqual(1.3);
  await expect
    .poll(() => previewScroller.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);
});

test('a repeated text item can be added, edited, previewed, and removed', async ({ page }) => {
  await page.goto('/rulesets/local-rules/rulebooks/starter/edit');
  await page.getByRole('button', { name: /Page 2/ }).click();

  const preview = page.getByRole('region', { name: 'Rulebook page preview' });
  const items = page.getByRole('textbox', { name: /^repeated text block, item \d+$/ });
  const originalCount = await items.count();
  await page.getByRole('button', { name: 'Add item to repeated text block' }).click();

  await expect(items).toHaveCount(originalCount + 1);
  const addedItem = page.getByRole('textbox', {
    name: `repeated text block, item ${originalCount + 1}`,
  });
  await addedItem.fill('A newly repeated browser-local rule.');
  await expect(preview).toContainText('A newly repeated browser-local rule.');

  const removeItem = page.getByRole('button', {
    name: `Remove item ${originalCount + 1} from repeated text block`,
  });
  await removeItem.hover();
  await page.mouse.down();
  await page.waitForTimeout(5200);
  await page.mouse.up();
  await expect(items).toHaveCount(originalCount);
  await expect(preview).not.toContainText('A newly repeated browser-local rule.');
});

test('the narrow workspace scrolls beside a fixed two-column Page and changes fit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/rulesets/local-rules/rulebooks/starter/edit');
  await page.getByRole('button', { name: /Page 2/ }).click();

  const workspace = page.getByRole('region', { name: 'Rulebook editing workspace' });
  const scroller = workspace.getByRole('region', { name: 'Editor and preview' });
  await expect.poll(() => scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await scroller.focus();
  await expect(scroller).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

  const leftColumn = page.getByRole('group', { name: 'Left page column' });
  const rightColumn = page.getByRole('group', { name: 'Right page column' });
  const leftBox = await leftColumn.boundingBox();
  const rightBox = await rightColumn.boundingBox();
  expect(leftBox).not.toBeNull();
  expect(rightBox).not.toBeNull();
  expect(Math.round(rightBox?.y ?? 0)).toBe(Math.round(leftBox?.y ?? 0));
  expect(rightBox?.x ?? 0).toBeGreaterThan(leftBox?.x ?? 0);

  const previewPage = page.getByRole('article', { name: 'Preview of Page 2' });
  const fitHeightWidth = (await previewPage.boundingBox())?.width ?? 0;
  await page.getByText('Fit width', { exact: true }).click();

  await expect(page.getByRole('radio', { name: 'Fit width' })).toBeChecked();
  await expect(workspace).toHaveAttribute('data-fit', 'width');
  await expect
    .poll(async () => Math.round((await previewPage.boundingBox())?.width ?? 0))
    .not.toBe(Math.round(fitHeightWidth));

  const previewScroller = page.getByRole('region', { name: 'Rulebook page preview' });
  await previewScroller.focus();
  await expect(previewScroller).toBeFocused();
  await page.keyboard.press('PageDown');
  await expect.poll(() => previewScroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});
