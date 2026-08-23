import { expect, test } from './coverage';

/* The browser-local fixture editor must not rotate an authenticated spec's refresh token. */
test.use({ storageState: { cookies: [], origins: [] } });

const editorPath = '/rulesets/local-rules/rulebooks/starter/edit';

test('the local Rulebook editor keeps its preview synchronized', async ({ page }) => {
  await page.goto(editorPath);

  const preview = page.getByRole('region', { name: 'Rulebook page preview' });
  await expect(preview).toBeVisible();

  await page.getByRole('button', { name: /Edit Page 1/ }).click();
  await page.getByRole('textbox', { name: 'Text block' }).fill('A browser-local Rulebook revision.');

  await expect(preview).toContainText('A browser-local Rulebook revision.');
});

test('the fit toggle changes Page size while the document owns vertical scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(editorPath);

  const controlsRegion = page.getByRole('region', { name: 'Rulebook controls' });
  const previewRegion = page.getByRole('region', { name: 'Rulebook page preview' });
  const previewPage = page.getByRole('article', { name: 'Preview of Page 1' });
  await expect(previewPage).toBeVisible();

  const fitHeightBox = await previewPage.boundingBox();
  expect(fitHeightBox).not.toBeNull();
  if (!fitHeightBox) {
    throw new Error('The fit-height preview has no rendered bounds.');
  }
  expect(fitHeightBox.width).toBeGreaterThan(0);
  expect(fitHeightBox.width / fitHeightBox.height).toBeCloseTo(210 / 297, 2);

  for (const region of [controlsRegion, previewRegion]) {
    await expect
      .poll(() => region.evaluate((element) => element.scrollHeight - element.clientHeight))
      .toBeLessThanOrEqual(1);
  }

  const controlsBox = await controlsRegion.boundingBox();
  expect(controlsBox).not.toBeNull();
  if (!controlsBox) {
    throw new Error('The Rulebook controls have no rendered bounds.');
  }
  await page.mouse.move(controlsBox.x + 20, controlsBox.y + 20);

  let previousPageY = fitHeightBox.y;
  let previousWindowY = await page.evaluate(() => window.scrollY);
  let stickyPageY: number | undefined;
  for (let step = 0; step < 30; step += 1) {
    await page.mouse.wheel(0, 20);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(previousWindowY);
    const candidateBox = await previewPage.boundingBox();
    expect(candidateBox).not.toBeNull();
    if (!candidateBox) {
      throw new Error('The fit-height preview lost its rendered bounds while scrolling.');
    }
    if (Math.abs(candidateBox.y - previousPageY) <= 1) {
      stickyPageY = candidateBox.y;
      break;
    }
    previousPageY = candidateBox.y;
    previousWindowY = await page.evaluate(() => window.scrollY);
  }
  expect(stickyPageY).toBeDefined();
  expect(await controlsRegion.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await previewRegion.evaluate((element) => element.scrollTop)).toBe(0);

  const stickyFitHeightBox = await previewPage.boundingBox();
  expect(stickyFitHeightBox).not.toBeNull();
  if (!stickyFitHeightBox) {
    throw new Error('The sticky fit-height preview has no rendered bounds.');
  }
  expect(stickyFitHeightBox.y).toBeCloseTo(stickyPageY ?? Number.NaN, 0);
  expect(stickyFitHeightBox.y).toBeGreaterThanOrEqual(-1);
  expect(stickyFitHeightBox.y + stickyFitHeightBox.height).toBeLessThanOrEqual(901);

  await page.mouse.move(stickyFitHeightBox.x + stickyFitHeightBox.width / 2, stickyFitHeightBox.y + 20);
  const beforePinnedWheel = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 20);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforePinnedWheel);
  const pinnedFitHeightBox = await previewPage.boundingBox();
  expect(pinnedFitHeightBox).not.toBeNull();
  if (!pinnedFitHeightBox) {
    throw new Error('The pinned fit-height preview has no rendered bounds.');
  }
  expect(Math.abs(pinnedFitHeightBox.y - stickyFitHeightBox.y)).toBeLessThanOrEqual(1);
  expect(await controlsRegion.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await previewRegion.evaluate((element) => element.scrollTop)).toBe(0);

  await page.getByRole('button', { name: 'Switch preview to fit width' }).click();
  await expect(page.getByRole('button', { name: 'Switch preview to fit height' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  const fitWidthBox = await previewPage.boundingBox();
  expect(fitWidthBox).not.toBeNull();
  if (!fitWidthBox) {
    throw new Error('The fit-width preview has no rendered bounds.');
  }
  expect(fitWidthBox.width).toBeGreaterThan(0);
  expect(fitWidthBox.width / fitHeightBox.width).toBeGreaterThanOrEqual(1.3);

  const fitWidthRegionBox = await previewRegion.boundingBox();
  expect(fitWidthRegionBox).not.toBeNull();
  if (!fitWidthRegionBox) {
    throw new Error('The fit-width preview region has no rendered bounds.');
  }
  await page.mouse.move(fitWidthRegionBox.x + fitWidthRegionBox.width / 2, fitWidthRegionBox.y + 20);
  const beforeFitWidthWheel = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 40);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeFitWidthWheel);
  const afterFitWidthWheel = await page.evaluate(() => window.scrollY);
  const scrolledFitWidthBox = await previewPage.boundingBox();
  expect(scrolledFitWidthBox).not.toBeNull();
  if (!scrolledFitWidthBox) {
    throw new Error('The scrolled fit-width preview has no rendered bounds.');
  }
  expect(
    Math.abs(fitWidthBox.y - scrolledFitWidthBox.y - (afterFitWidthWheel - beforeFitWidthWheel))
  ).toBeLessThanOrEqual(1);
  expect(await controlsRegion.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await previewRegion.evaluate((element) => element.scrollTop)).toBe(0);
});

test('a repeated text item can be added, edited, previewed, and removed', async ({ page }) => {
  await page.goto(editorPath);
  await page.getByRole('button', { name: /Page 2/ }).click();

  await expect(page.getByRole('article', { name: 'Preview of Page 2' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Edit Page 2/ })).toHaveAttribute('aria-expanded', 'true');

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

test('only the narrow editor workspace scrolls horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(editorPath);

  const workspace = page.getByRole('region', { name: 'Rulebook editor and preview' });
  await expect(workspace).toBeVisible();
  const editingSection = page.getByRole('region', { name: 'Rulebook editing workspace' });
  const controls = page.getByRole('region', { name: 'Rulebook controls' });
  const preview = page.getByRole('region', { name: 'Rulebook page preview' });
  const [editingSectionBox, controlsBox, previewBox] = await Promise.all([
    editingSection.boundingBox(),
    controls.boundingBox(),
    preview.boundingBox(),
  ]);
  expect(editingSectionBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  if (!editingSectionBox || !controlsBox || !previewBox) {
    throw new Error('The narrow Rulebook workspace has no rendered bounds.');
  }
  const contentBottom = Math.max(controlsBox.y + controlsBox.height, previewBox.y + previewBox.height);
  const sectionBottom = editingSectionBox.y + editingSectionBox.height;
  expect(sectionBottom - contentBottom).toBeLessThan(350);
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
