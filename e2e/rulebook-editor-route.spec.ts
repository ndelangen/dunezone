import { expect, test } from './coverage';

/* The browser-local fixture editor must not rotate an authenticated spec's refresh token. */
test.use({ storageState: { cookies: [], origins: [] } });

const editorPath = '/rulesets/local-rules/rulebooks/starter/edit';

test('collapsed icons select Blocks directly and formatted edits reach the preview', async ({ page }) => {
  await page.goto(editorPath);

  const preview = page.getByRole('article', { name: 'Rulebook page preview' });
  await expect(preview).toContainText('Movement sequence');

  await page.getByRole('button', { name: /Storm marker\. Asset figure/ }).click();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Storm marker');
  await page.getByRole('textbox', { name: 'Title' }).fill('Storm sector marker');
  await expect(preview).toContainText('Storm sector marker');

  const content = page.getByRole('textbox', { name: 'Content' });
  await content.fill('An *unfinished draft');
  await expect(page.getByText('Line 1, column 4: Bold starts here but has no closing *.')).toBeVisible();
  await expect(preview).toContainText('An *unfinished draft');

  await content.fill('A **formatted** marker rule.');
  await expect(preview.getByText('formatted')).toHaveJSProperty('tagName', 'STRONG');
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeDisabled();
});

test('Page and Block add menus expose only layout-compatible choices', async ({ page }) => {
  await page.goto(editorPath);

  await page.getByRole('button', { name: 'Open pages' }).click();
  const addPage = page.getByRole('button', { name: 'Add page' });
  await expect(addPage).toBeVisible();
  await expect.poll(async () => (await addPage.boundingBox())?.width ?? 0).toBeGreaterThan(150);
  await addPage.click();
  const pageMenu = page.getByRole('menu', { name: 'Add page' });
  await expect(pageMenu.getByRole('menuitem')).toHaveCount(3);
  await pageMenu.getByRole('menuitem', { name: 'Visual reference' }).click();

  const preview = page.getByRole('article', { name: 'Rulebook page preview' });
  await expect(preview).toContainText('Visual reference / 04');
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Selected Asset');

  await page.getByRole('button', { name: 'Add block' }).click();
  const blockMenu = page.getByRole('menu', { name: 'Add block' });
  await expect(blockMenu.getByRole('menuitem', { name: 'Asset figure' })).toBeVisible();
  await expect(blockMenu.getByRole('menuitem', { name: 'Worked example' })).toBeVisible();
  await expect(blockMenu.getByRole('menuitem', { name: 'Rule group' })).toHaveCount(0);
  await blockMenu.getByRole('menuitem', { name: 'Worked example' }).click();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Worked example');
  await expect(preview).toContainText('Explain one example step by step.');
});

test('Page and Block icon rails reorder their current draft', async ({ page }) => {
  await page.goto(editorPath);

  const drag = async (source: ReturnType<typeof page.getByRole>, target: ReturnType<typeof page.getByRole>) => {
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) {
      throw new Error('A sortable icon has no rendered bounds.');
    }
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
    await page.mouse.up();
  };

  await drag(
    page.getByRole('button', { name: /Welcome to Arrakis\. Page 1/ }),
    page.getByRole('button', { name: /Movement\. Page 2/ })
  );
  await expect(page.getByRole('button', { name: /Movement\. Page 1/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Welcome to Arrakis\. Page 2/ })).toBeVisible();

  const blocks = page.getByRole('region', { name: 'Blocks panel' });
  await drag(
    blocks.getByRole('button', { name: /Storm marker\. Asset figure/ }),
    blocks.getByRole('button', { name: /Movement sequence\. Rule group/ })
  );
  const blockButtons = blocks.getByRole('button', { name: /Drag to reorder or click to select/ });
  await expect.poll(() => blockButtons.first().getAttribute('aria-label')).toContain('Storm marker');
  const blockLabels = await blockButtons.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-label'))
  );
  expect(blockLabels[0]).toContain('Storm marker');
});

test('the A4 preview and Sidebar stay aligned without nested scroll traps', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(editorPath);

  const layout = page.locator('[data-document-editor-layout]');
  const sidebar = page.getByRole('complementary', { name: 'Rulebook outline and controls' });
  const preview = page.getByRole('article', { name: 'Rulebook page preview' });
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
  expect(sidebarBox.height).toBeGreaterThanOrEqual(fitHeightBox.height - 1);
  expect(fitHeightBox.height).toBeLessThanOrEqual(833);
  expect(await sidebar.evaluate((element) => getComputedStyle(element).overflowY)).not.toMatch(/auto|scroll/);

  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await sidebar.evaluate((element) => element.scrollTop)).toBe(0);

  await page.getByRole('button', { name: 'Fit width' }).click();
  await expect(page.getByRole('button', { name: 'Fit height' })).toBeVisible();
  await expect(layout).toHaveAttribute('data-fit', 'width');
  const fitWidthBox = await preview.boundingBox();
  expect(fitWidthBox).not.toBeNull();
  if (!fitWidthBox) {
    throw new Error('The fit-width A4 preview has no rendered bounds.');
  }
  expect(fitWidthBox.width / fitWidthBox.height).toBeCloseTo(210 / 297, 2);
  expect(fitWidthBox.width).toBeGreaterThan(fitHeightBox.width);
});

test('only the narrow editor workspace scrolls horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(editorPath);

  const workspace = page.getByRole('region', { name: 'Rulebook editor and preview' });
  const layout = page.locator('[data-document-editor-layout]');
  await expect(workspace).toBeVisible();
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
  await expect(workspace).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => layout.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});
