import { expect, test } from './coverage';

const editorPath = '/rulesets/local-rules/rulebooks/starter/edit';

test('the local Rulebook editor keeps its A4 preview synchronized', async ({ page }) => {
  await page.goto(editorPath);

  const preview = page.getByRole('region', { name: 'Rulebook page preview' });
  await expect(preview).toBeVisible();

  await page.getByRole('button', { name: /Edit Page 1/ }).click();
  await page.getByRole('textbox', { name: 'Text block' }).fill('A browser-local Rulebook revision.');

  await expect(preview).toContainText('A browser-local Rulebook revision.');
});

test('selecting a Page enters its Edit path', async ({ page }) => {
  await page.goto(editorPath);

  await page.getByRole('button', { name: /Page 2/ }).click();

  await expect(page.getByRole('article', { name: 'Preview of Page 2' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Edit Page 2/ })).toHaveAttribute('aria-expanded', 'true');
});

test('the fit toggle changes Page size while the document owns vertical scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(editorPath);

  const previewRegion = page.getByRole('region', { name: 'Rulebook page preview' });
  const previewPage = page.getByRole('article', { name: 'Preview of Page 1' });
  await expect(previewPage).toBeVisible();

  const fitHeightBox = await previewPage.boundingBox();
  expect(fitHeightBox).not.toBeNull();
  if (!fitHeightBox) {
    throw new Error('The fit-height preview has no rendered bounds.');
  }
  expect(fitHeightBox.width).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Switch preview to fit width' }).click();
  await expect(page.getByRole('button', { name: 'Switch preview to fit height' })).toBeVisible();

  const fitWidthBox = await previewPage.boundingBox();
  expect(fitWidthBox).not.toBeNull();
  if (!fitWidthBox) {
    throw new Error('The fit-width preview has no rendered bounds.');
  }
  expect(fitWidthBox.width).toBeGreaterThan(0);
  expect(fitWidthBox.width / fitHeightBox.width).toBeGreaterThanOrEqual(1.3);

  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight))
    .toBe(true);
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await previewRegion.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await previewPage.evaluate((element) => element.scrollTop)).toBe(0);
});

test('a repeated text item can be added, edited, previewed, and removed', async ({ page }) => {
  await page.goto(editorPath);
  await page.getByRole('button', { name: /Page 2/ }).click();

  const preview = page.getByRole('region', { name: 'Rulebook page preview' });
  const items = page.getByRole('textbox', { name: /^repeated text block, item \d+$/ });
  await expect(items.first()).toBeVisible();
  const originalCount = await items.count();
  await page.getByRole('button', { name: 'Add item to repeated text block' }).click();

  await expect(items).toHaveCount(originalCount + 1);
  const addedItem = page.getByRole('textbox', {
    name: `repeated text block, item ${originalCount + 1}`,
  });
  await addedItem.fill('A newly repeated browser-local rule.');
  await expect(preview).toContainText('A newly repeated browser-local rule.');

  await page.getByRole('button', { name: `Remove item ${originalCount + 1} from repeated text block` }).click();
  await expect(items).toHaveCount(originalCount);
  await expect(preview).not.toContainText('A newly repeated browser-local rule.');
});

test('only the narrow editor workspace scrolls horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto(editorPath);

  const workspace = page.getByRole('region', { name: 'Rulebook editor and preview' });
  await expect(workspace).toBeVisible();
  await expect.poll(() => workspace.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth === document.documentElement.clientWidth &&
          document.body.scrollWidth === document.body.clientWidth
      )
    )
    .toBe(true);

  const viewportWidth = page.viewportSize()?.width ?? 0;
  for (const landmark of [page.getByRole('banner'), page.getByRole('contentinfo')]) {
    const box = await landmark.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth);
    }
  }
  await expect(page.getByText('Starter state', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch preview to fit width' })).toBeVisible();

  await workspace.focus();
  await expect(workspace).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => workspace.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

  const previewPage = page.getByRole('article', { name: 'Preview of Page 1' });
  const fitHeightBox = await previewPage.boundingBox();
  expect(fitHeightBox).not.toBeNull();
  await page.getByRole('button', { name: 'Switch preview to fit width' }).click();
  await expect(page.getByRole('button', { name: 'Switch preview to fit height' })).toBeVisible();
  await expect
    .poll(async () => Math.round((await previewPage.boundingBox())?.width ?? 0))
    .not.toBe(Math.round(fitHeightBox?.width ?? 0));
});
