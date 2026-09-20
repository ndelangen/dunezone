import type { Locator, Page } from '@playwright/test';

import { expect, test } from './coverage';
import { seedRulebookEditor } from './rulebook-fixture';

/* This spec owns its authenticated session.
 * The taller viewport keeps deliberate placement drags outside Dnd Kit's bottom-edge auto-scroll zone. */
test.use({
  storageState: '.playwright/user-a-rulebook.json',
  viewport: { width: 1280, height: 1000 },
});

let editorPath: string;
test.beforeEach(async () => {
  editorPath = (await seedRulebookEditor()).path;
});
test.afterEach(async ({ context }) => {
  await context.storageState({ path: '.playwright/user-a-rulebook.json' });
});

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

async function dragToVerticalRatio(source: Locator, target: Locator, page: Page, targetRatio: number, release = true) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error('A drag source or target has no rendered bounds.');
  }
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * targetRatio, {
    steps: 12,
  });
  if (release) {
    await page.mouse.up();
    await expect(page.locator('[data-rail-dragging="true"]')).toHaveCount(0);
  }
}

async function movePointerToVerticalRatio(target: Locator, page: Page, targetRatio: number) {
  await target.scrollIntoViewIfNeeded();
  const targetBox = await target.boundingBox();
  if (!targetBox) {
    throw new Error('A drag target has no rendered bounds.');
  }
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * targetRatio, {
    steps: 12,
  });
}

async function movePointerToVerticalEdge(target: Locator, page: Page, edge: 'start' | 'end') {
  await target.scrollIntoViewIfNeeded();
  const targetBox = await target.boundingBox();
  if (!targetBox) {
    throw new Error('A drag target has no rendered bounds.');
  }
  const inset = Math.min(2, targetBox.height / 4);
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    edge === 'start' ? targetBox.y + inset : targetBox.y + targetBox.height - inset,
    { steps: 12 }
  );
}

function rulebookStructure(page: Page) {
  return page.getByRole('complementary', { name: 'Rulebook structure' });
}

function renderedAriaLabelOrder(locator: Locator, prefix = '') {
  return locator.evaluateAll(
    (elements, labelPrefix) =>
      elements
        .map((element) => ({
          label: (element.getAttribute('aria-label') ?? '').replace(labelPrefix, '') || null,
          top: element.getBoundingClientRect().top,
        }))
        .sort((left, right) => left.top - right.top)
        .map(({ label }) => label),
    prefix
  );
}

test('the URL owns Page, Control-region, and Block navigation', async ({ page }) => {
  await page.goto(editorPath);
  await expect(page).toHaveURL(/#CHAP\/details$/);

  const structure = rulebookStructure(page);
  await expect(page.getByRole('article', { name: 'Rulebook page: Welcome to Arrakis' })).toBeVisible();
  await structure.getByRole('link', { name: 'Movement', exact: true }).click();
  await expect(page).toHaveURL(/#RULE\/details$/);
  await expect(page.getByRole('article', { name: 'Rulebook page: Movement' })).toBeVisible();
  await expect(structure.getByRole('link', { name: 'Page details' })).toHaveAttribute('aria-current', 'page');

  /* Control regions live on a Cover, so the journey adds one and reaches its footer region by URL. */
  await structure.getByRole('button', { name: 'Add Page', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Cover', exact: true }).click();
  const coverHash = new URL(page.url()).hash;
  expect(coverHash).toMatch(/^#[A-Z0-9]{4}\/details$/);
  const coverId = coverHash.slice(1, 5);
  await structure.getByRole('link', { name: 'Cover footer' }).click();
  await expect(page).toHaveURL(new RegExp(`#${coverId}/footer$`));
  await expect(page.getByRole('switch', { name: 'Show cover footer' })).toBeVisible();

  await structure.getByRole('link', { name: 'Movement', exact: true }).click();
  await expect(page).toHaveURL(/#RULE\/details$/);

  await structure.getByRole('link', { name: 'Movement sequence' }).click();
  await expect(page).toHaveURL(/#RULE\/MVVE$/);
  await expect(page.getByRole('textbox', { name: 'Content' })).toHaveValue(
    'Choose a force, choose an adjacent destination, then resolve the move.'
  );

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Content' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#RULE\/details$/);
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
  await expect(page.getByRole('article', { name: 'Rulebook page: Advanced movement' })).toBeVisible();
  await anchor.fill('advanced-movement');
  await expect(page.getByText('Local changes')).toBeVisible();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeDisabled();
  await expect(page.getByText('Saved draft')).toBeVisible();
});

test('Block edits and invalid local text update the safe rendered preview', async ({ page }) => {
  await page.goto(`${editorPath}#RULE/TEXT`);

  const preview = page.getByRole('article', { name: 'Rulebook page: Movement' });
  const content = page.getByRole('textbox', { name: 'Content' });
  const save = page.getByRole('button', { name: 'Save' });
  await expect(preview.getByRole('img', { name: 'No source selected' })).toBeVisible();

  await content.fill('Cross the *open desert* before the illustration moves.');
  await expect(preview.getByText('open desert')).toHaveCSS('font-weight', '700');
  await expect(save).toBeEnabled();

  await content.fill('An *unfinished draft <script>alert(1)</script>');
  await expect(preview).toContainText('An *unfinished draft <script>alert(1)</script>');
  await expect(preview.locator('script')).toHaveCount(0);
  await expect(save).toBeDisabled();
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

  await drag(source, target, page, false);
  await expect(source).toHaveAttribute('data-rail-drag-placeholder', 'true');
  await expect
    .poll(() => target.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42))
    .not.toBe(0);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(source).not.toHaveAttribute('data-rail-drag-placeholder');
  await expect
    .poll(() => pages.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label'))))
    .toEqual(['Welcome to Arrakis', 'Movement', 'Markers and tokens']);
  await expect
    .poll(() => target.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42))
    .toBe(0);
  await drag(source, target, page);
  await expect
    .poll(() => pages.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label'))))
    .toEqual(['Movement', 'Welcome to Arrakis', 'Markers and tokens']);
  expect(page.url()).toBe(originalUrl);
  await expect
    .poll(() => target.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42))
    .toBe(0);
  await source.focus();
  await page.keyboard.press('Space');
  await expect(source).toHaveAttribute('data-rail-drag-placeholder', 'true');
  /* The keyboard sensor installs its document listener after activation. */
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowDown');
  await expect
    .poll(() => target.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42))
    .not.toBe(0);
  await page.keyboard.press('Space');
  await expect
    .poll(() => pages.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label'))))
    .toEqual(['Welcome to Arrakis', 'Movement', 'Markers and tokens']);
  expect(page.url()).toBe(originalUrl);
});

test('Blocks sort within a rail region and move between rail regions', async ({ page }) => {
  await page.goto(`${editorPath}#RULE/details`);

  const structure = rulebookStructure(page);
  const column1 = structure.getByRole('list', { name: 'Column 1', exact: true });
  const column2 = structure.getByRole('list', { name: 'Column 2', exact: true });
  const movement = structure.getByRole('link', { name: 'Movement sequence' });
  const text = structure.getByRole('link', {
    name: 'The storm closes the boundary between its two sectors.',
  });
  const illustration = structure.getByRole('link', { name: 'Referenced illustration' });
  const originalUrl = page.url();

  await drag(text, movement, page);
  await expect
    .poll(() => column1.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label'))))
    .toEqual(['The storm closes the boundary between its two sectors.', 'Movement sequence']);
  expect(page.url()).toBe(originalUrl);

  await drag(text, illustration, page);
  await expect(
    column1.getByRole('link', {
      name: 'The storm closes the boundary between its two sectors.',
    })
  ).toHaveCount(0);
  await expect(
    column2.getByRole('link', {
      name: 'The storm closes the boundary between its two sectors.',
    })
  ).toBeVisible();
  /* Every fixed-catalogue region accepts every Block kind, so the second column takes a Block released below its last item. */
  const confirm = column2.getByRole('link', { name: 'Confirm that the destination is adjacent.' });
  await dragToVerticalRatio(movement, confirm, page, 0.85);
  await expect(column1.getByRole('link')).toHaveCount(0);
  await expect(column2.getByRole('link')).toHaveCount(4);
  await expect(column2.getByRole('link').last()).toHaveAttribute('aria-label', 'Movement sequence');
  expect(page.url()).toBe(originalUrl);
});

test('rail cross-region dragging previews placement without settling the Block before drop', async ({ page }) => {
  await page.goto(`${editorPath}#RULE/details`);

  const structure = rulebookStructure(page);
  const column1 = structure.getByRole('list', { name: 'Column 1', exact: true });
  const column2 = structure.getByRole('list', { name: 'Column 2', exact: true });
  const text = structure.getByRole('link', {
    name: 'The storm closes the boundary between its two sectors.',
  });
  const illustration = structure.getByRole('link', { name: 'Referenced illustration' });
  const confirm = column2.locator('a[aria-label="Confirm that the destination is adjacent."]');

  await dragToVerticalRatio(text, illustration, page, 0.15, false);

  await expect(structure.locator('[data-rail-drag-placeholder]')).toHaveCount(1);
  await expect(column2.locator('[data-rail-drag-placeholder]')).toHaveCount(1);
  await expect(column2.locator('a[aria-label="The storm closes the boundary between its two sectors."]')).toHaveCSS(
    'opacity',
    '0'
  );
  const expectedColumn2Order = [
    'The storm closes the boundary between its two sectors.',
    'Referenced illustration',
    'Confirm that the destination is adjacent.',
  ];
  await expect
    .poll(() =>
      column2.locator('a[aria-label]').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')))
    )
    .toEqual(expectedColumn2Order);
  await expect
    .poll(() =>
      page
        .getByRole('region', { name: 'Column 2', exact: true })
        .getByRole('list')
        .getByRole('button')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('aria-label')?.replace(/^Edit /, '') ?? null)
        )
    )
    .toEqual(expectedColumn2Order);
  await expect(page.getByText('Saved draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  const expectedAdvancedColumn2Order = [
    'Referenced illustration',
    'Confirm that the destination is adjacent.',
    'The storm closes the boundary between its two sectors.',
  ];
  await movePointerToVerticalRatio(confirm, page, 0.85);
  await expect
    .poll(() =>
      column2.locator('a[aria-label]').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')))
    )
    .toEqual(expectedAdvancedColumn2Order);
  await expect
    .poll(() =>
      column2.locator('a[aria-label]').evaluateAll((links) =>
        links
          .map((link) => ({
            label: link.getAttribute('aria-label'),
            top: link.getBoundingClientRect().top,
          }))
          .sort((left, right) => left.top - right.top)
          .map(({ label }) => label)
      )
    )
    .toEqual(expectedAdvancedColumn2Order);
  await expect
    .poll(() =>
      page
        .getByRole('region', { name: 'Column 2', exact: true })
        .getByRole('list')
        .getByRole('button')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('aria-label')?.replace(/^Edit /, '') ?? null)
        )
    )
    .toEqual(expectedAdvancedColumn2Order);
  await expect
    .poll(() =>
      renderedAriaLabelOrder(
        page.getByRole('region', { name: 'Column 2', exact: true }).getByRole('list').getByRole('button'),
        'Edit '
      )
    )
    .toEqual(expectedAdvancedColumn2Order);
  await expect(page.getByText('Saved draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(structure.locator('[data-rail-drag-placeholder]')).toHaveCount(0);
  await expect(
    column1.getByRole('link', {
      name: 'The storm closes the boundary between its two sectors.',
    })
  ).toBeVisible();
  await expect(page.getByText('Saved draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  await dragToVerticalRatio(text, illustration, page, 0.15, false);
  await page.mouse.up();
  await expect(structure.locator('[data-rail-drag-placeholder]')).toHaveCount(0);
  await expect(
    column2.getByRole('link', {
      name: 'The storm closes the boundary between its two sectors.',
    })
  ).toBeVisible();
  await expect
    .poll(() => column2.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label'))))
    .toEqual(expectedColumn2Order);
  await expect(page.getByText('Local changes')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
});

test('Page-details cross-region preview stays transient until drop', async ({ page }) => {
  await page.goto(`${editorPath}#RULE/details`);

  const column1 = page.getByRole('region', { name: 'Column 1', exact: true });
  const column2 = page.getByRole('region', { name: 'Column 2', exact: true });
  const text = column1.getByRole('button', {
    name: 'Edit The storm closes the boundary between its two sectors.',
  });
  const illustration = column2.getByRole('button', { name: 'Edit Referenced illustration' });
  const confirm = column2.getByRole('button', {
    name: 'Edit Confirm that the destination is adjacent.',
  });
  const expectedColumn2Order = [
    'The storm closes the boundary between its two sectors.',
    'Referenced illustration',
    'Confirm that the destination is adjacent.',
  ];
  const detailColumn2Order = () =>
    column2
      .getByRole('list')
      .getByRole('button')
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute('aria-label')?.replace(/^Edit /, '') ?? null)
      );
  const railColumn2Order = () =>
    rulebookStructure(page)
      .getByRole('list', { name: 'Column 2', exact: true })
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')));

  await dragToVerticalRatio(text, illustration, page, 0.15, false);
  await expect.poll(detailColumn2Order).toEqual(expectedColumn2Order);
  await expect.poll(railColumn2Order).toEqual(expectedColumn2Order);
  for (let frame = 0; frame < 3; frame += 1) {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
  expect(await detailColumn2Order()).toEqual(expectedColumn2Order);
  expect(await railColumn2Order()).toEqual(expectedColumn2Order);
  await expect(page.getByText('Saved draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  const expectedAdvancedColumn2Order = [
    'Referenced illustration',
    'Confirm that the destination is adjacent.',
    'The storm closes the boundary between its two sectors.',
  ];
  await movePointerToVerticalRatio(confirm, page, 0.85);
  await expect.poll(detailColumn2Order).toEqual(expectedAdvancedColumn2Order);
  await expect.poll(railColumn2Order).toEqual(expectedAdvancedColumn2Order);
  await expect
    .poll(() => renderedAriaLabelOrder(column2.getByRole('list').getByRole('button'), 'Edit '))
    .toEqual(expectedAdvancedColumn2Order);
  await expect(page.getByText('Saved draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(
    column1.getByRole('button', {
      name: 'Edit The storm closes the boundary between its two sectors.',
    })
  ).toBeVisible();
  await expect(page.getByText('Saved draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  await page.reload();
  await expect(page.getByText('Saved draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  await dragToVerticalRatio(text, illustration, page, 0.15, false);
  await page.mouse.up();
  await expect.poll(detailColumn2Order).toEqual(expectedColumn2Order);
  await expect.poll(railColumn2Order).toEqual(expectedColumn2Order);
  await expect(page.getByText('Local changes')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
});

test('cross-region previews reach the first and last slots in the rail and Page details', async ({ page }) => {
  const movedLabel = 'The storm closes the boundary between its two sectors.';
  const firstOrder = [movedLabel, 'Referenced illustration', 'Confirm that the destination is adjacent.'];
  const lastOrder = ['Referenced illustration', 'Confirm that the destination is adjacent.', movedLabel];

  await page.goto(`${editorPath}#RULE/details`);
  const structure = rulebookStructure(page);
  const railColumn1 = structure.getByRole('list', { name: 'Column 1', exact: true });
  const railColumn2 = structure.getByRole('list', { name: 'Column 2', exact: true });
  const railText = railColumn1.getByRole('link', { name: movedLabel });
  const railIllustration = railColumn2.getByRole('link', { name: 'Referenced illustration' });
  const railOrder = () =>
    railColumn2.locator('a[aria-label]').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')));

  await dragToVerticalRatio(railText, railIllustration, page, 0.5, false);
  await movePointerToVerticalEdge(railColumn2, page, 'end');
  await expect.poll(railOrder).toEqual(lastOrder);
  await movePointerToVerticalEdge(railColumn2, page, 'start');
  await expect.poll(railOrder).toEqual(firstOrder);
  await page.keyboard.press('Escape');
  await page.mouse.up();

  const detailColumn1 = page.getByRole('region', { name: 'Column 1', exact: true });
  const detailColumn2 = page.getByRole('region', { name: 'Column 2', exact: true });
  const detailList = detailColumn2.getByRole('list');
  const detailText = detailColumn1.getByRole('button', {
    name: `Edit ${movedLabel}`,
  });
  const detailIllustration = detailColumn2.getByRole('button', {
    name: 'Edit Referenced illustration',
  });
  const detailOrder = () =>
    detailList
      .getByRole('button')
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute('aria-label')?.replace(/^Edit /, '') ?? null)
      );

  await dragToVerticalRatio(detailText, detailIllustration, page, 0.5, false);
  await movePointerToVerticalEdge(detailList, page, 'end');
  await expect.poll(detailOrder).toEqual(lastOrder);
  await movePointerToVerticalEdge(detailList, page, 'start');
  await expect.poll(detailOrder).toEqual(firstOrder);
  await page.keyboard.press('Escape');
  await page.mouse.up();
});

test('rail add and Page-details disclosure controls keep their accepted action semantics', async ({ page }) => {
  await page.goto(`${editorPath}#RULE/details`);

  const structure = rulebookStructure(page);
  const railAdd = structure.getByRole('button', { name: 'Add Block' });
  const detailAdd = page.getByRole('button', { name: 'Add a Block to Column 1' });
  const collapse = page.getByRole('button', { name: 'Collapse Column 1' });
  const detailText = page.getByRole('button', {
    name: 'Edit The storm closes the boundary between its two sectors.',
  });
  const detailMovement = page.getByRole('button', {
    name: 'Edit Movement sequence',
  });
  const detailMovementRow = detailMovement.locator('..');
  const restingBorderColor = await detailMovementRow.evaluate((element) => getComputedStyle(element).borderColor);

  for (const add of [railAdd, detailAdd]) {
    await expect(add).toHaveAttribute('data-variant', 'light');
    await expect(add).toHaveAttribute('data-size', 'sm');
  }
  await expect(collapse).toHaveAttribute('style', /--mantine-color-gray-light-hover/);

  await drag(detailText, detailMovement, page, false);
  await expect
    .poll(() => detailMovementRow.evaluate((element) => getComputedStyle(element).borderColor))
    .toBe(restingBorderColor);
  await page.mouse.up();
});

test('Page-details same-region preview and release keep the same Block order', async ({ page }) => {
  await page.goto(`${editorPath}#RULE/details`);

  const column2 = page.getByRole('region', { name: 'Column 2', exact: true });
  const illustration = column2.getByRole('button', { name: 'Edit Referenced illustration' });
  const confirm = column2.getByRole('button', {
    name: 'Edit Confirm that the destination is adjacent.',
  });

  await dragToVerticalRatio(confirm, illustration, page, 0.4, false);
  await expect
    .poll(async () => {
      const confirmBox = await confirm.locator('..').boundingBox();
      const stormBox = await illustration.locator('..').boundingBox();
      return confirmBox && stormBox ? confirmBox.y < stormBox.y : false;
    })
    .toBe(true);
  await page.mouse.up();

  const expectedOrder = ['Confirm that the destination is adjacent.', 'Referenced illustration'];
  await expect
    .poll(() =>
      column2
        .getByRole('list')
        .getByRole('button')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('aria-label')?.replace(/^Edit /, '') ?? null)
        )
    )
    .toEqual(expectedOrder);
  await expect
    .poll(() =>
      rulebookStructure(page)
        .getByRole('list', { name: 'Column 2', exact: true })
        .getByRole('link')
        .evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')))
    )
    .toEqual(expectedOrder);
  await expect
    .poll(() =>
      page
        .getByRole('article', { name: 'Rulebook page: Movement' })
        .locator('[data-rulebook-region="column2"] [data-rulebook-block-id]')
        .evaluateAll((blocks) => blocks.map((block) => block.getAttribute('data-rulebook-block-id')))
    )
    .toEqual(['L5ST', 'ASST']);
});

test('Page details supports top, bottom, reversal and cross-region Block placement', async ({ page }) => {
  await page.goto(`${editorPath}#RULE/details`);

  const column1 = page.getByRole('region', { name: 'Column 1', exact: true });
  const column2 = page.getByRole('region', { name: 'Column 2', exact: true });
  const movement = column1.getByRole('button', {
    name: 'Edit Movement sequence',
  });
  const text = column1.getByRole('button', {
    name: 'Edit The storm closes the boundary between its two sectors.',
  });
  const illustration = column2.getByRole('button', { name: 'Edit Referenced illustration' });
  const originalUrl = page.url();
  const column1BlockNames = () =>
    column1
      .getByRole('list')
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));

  await drag(text, movement, page);
  await expect
    .poll(column1BlockNames)
    .toEqual(['Edit The storm closes the boundary between its two sectors.', 'Edit Movement sequence']);

  await drag(text, movement, page);
  await expect
    .poll(column1BlockNames)
    .toEqual(['Edit Movement sequence', 'Edit The storm closes the boundary between its two sectors.']);

  await dragThrough(text, [movement, text], page);
  await expect
    .poll(column1BlockNames)
    .toEqual(['Edit Movement sequence', 'Edit The storm closes the boundary between its two sectors.']);

  await dragToVerticalRatio(text, illustration, page, 0.15, false);
  const expectedColumn2Order = [
    'The storm closes the boundary between its two sectors.',
    'Referenced illustration',
    'Confirm that the destination is adjacent.',
  ];
  await expect
    .poll(() =>
      column2
        .getByRole('list')
        .getByRole('button')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('aria-label')?.replace(/^Edit /, '') ?? null)
        )
    )
    .toEqual(expectedColumn2Order);
  await page.mouse.up();
  await expect(
    column1.getByRole('button', {
      name: 'Edit The storm closes the boundary between its two sectors.',
    })
  ).toHaveCount(0);
  await expect(
    column2.getByRole('button', {
      name: 'Edit The storm closes the boundary between its two sectors.',
    })
  ).toBeVisible();
  await expect
    .poll(() =>
      column2
        .getByRole('list')
        .getByRole('button')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('aria-label')?.replace(/^Edit /, '') ?? null)
        )
    )
    .toEqual(expectedColumn2Order);
  await expect
    .poll(() =>
      rulebookStructure(page)
        .getByRole('list', { name: 'Column 2', exact: true })
        .getByRole('link')
        .evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')))
    )
    .toEqual(expectedColumn2Order);

  await column1.getByRole('button', { name: 'Add a Block to Column 1' }).click();
  await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('A rule that moves to the second column.');
  await rulebookStructure(page).getByRole('link', { name: 'Page details' }).click();
  const newText = column1.getByRole('button', {
    name: 'Edit A rule that moves to the second column.',
  });
  /* Every fixed-catalogue region accepts every Block kind, so the second column reports the drag as compatible and takes the Block on release. */
  await drag(newText, illustration, page, false);
  await expect(column2).toHaveAttribute('data-drop-eligibility', 'compatible');
  await page.mouse.up();
  await expect(column2.getByRole('button', { name: 'Edit A rule that moves to the second column.' })).toBeVisible();
  await expect(newText).toHaveCount(0);
  expect(page.url()).toBe(originalUrl);
});

test('an empty compatible rail region accepts a Block and Page-details regions remain separately sortable', async ({
  page,
}) => {
  await page.goto(`${editorPath}#RULE/details`);

  const structure = rulebookStructure(page);
  await structure.getByRole('button', { name: 'Add Page' }).click();
  await page.getByRole('menuitem', { name: 'Two equal columns' }).click();
  await expect(page).toHaveURL(/#[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}\/details$/);

  await structure.getByRole('button', { name: 'Add Block' }).click();
  await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('A rule moved to the second column.');
  const newText = structure.getByRole('link', {
    name: 'A rule moved to the second column.',
  });
  const emptyColumn2 = structure.getByRole('list', { name: 'Column 2' });
  await expect(emptyColumn2.getByRole('link')).toHaveCount(0);
  await drag(newText, emptyColumn2.locator('..'), page);
  await expect(
    emptyColumn2.getByRole('link', {
      name: 'A rule moved to the second column.',
    })
  ).toBeVisible();

  await structure.getByRole('link', { name: 'Page details' }).click();
  const column1Region = page.getByRole('region', { name: 'Column 1', exact: true });
  const column2Region = page.getByRole('region', { name: 'Column 2', exact: true });
  await expect(column1Region.getByRole('list').getByRole('button', { name: /^Edit / })).toHaveCount(0);
  await expect(column1Region.getByText('No Blocks in this region.')).toBeVisible();
  await expect(
    column2Region.getByRole('button', {
      name: 'Edit A rule moved to the second column.',
    })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Collapse Column 2' }).click();
  await expect(page.getByRole('button', { name: 'Expand Column 2' })).toBeVisible();
});

test('the rendered preview stays aligned, contained, and only the narrow workspace scrolls horizontally', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(editorPath);

  const layout = page.locator('[data-document-editor-layout]');
  const sidebar = rulebookStructure(page);
  const sidebarSurface = sidebar.locator(':scope > div');
  const preview = page.getByRole('article', { name: 'Rulebook page: Welcome to Arrakis' });
  await expect(layout).toHaveAttribute('data-fit', 'height');
  await expect
    .poll(async () => {
      const [previewBox, currentSidebarBox] = await Promise.all([preview.boundingBox(), sidebar.boundingBox()]);
      return previewBox && currentSidebarBox ? Math.abs(currentSidebarBox.y - previewBox.y) : Number.POSITIVE_INFINITY;
    })
    .toBeLessThanOrEqual(1);
  const fitHeightBox = await preview.boundingBox();
  const sidebarBox = await sidebar.boundingBox();
  const sidebarSurfaceBox = await sidebarSurface.boundingBox();
  expect(fitHeightBox).not.toBeNull();
  expect(sidebarBox).not.toBeNull();
  expect(sidebarSurfaceBox).not.toBeNull();
  if (!fitHeightBox || !sidebarBox || !sidebarSurfaceBox) {
    throw new Error('The Rulebook editor surfaces have no rendered bounds.');
  }
  expect(fitHeightBox.width / fitHeightBox.height).toBeCloseTo(210 / 297, 2);
  expect(sidebarBox.height).toBeGreaterThanOrEqual(fitHeightBox.height - 1);
  expect(sidebarSurfaceBox.height).toBeGreaterThanOrEqual(fitHeightBox.height - 1);
  await expect(preview).toHaveCSS('overflow', 'hidden');
  await expect
    .poll(async () => {
      const pageBox = await preview.boundingBox();
      const contentBox = await preview.locator(':scope > .rulebookPageContent').boundingBox();
      return pageBox && contentBox ? contentBox.y + contentBox.height <= pageBox.y + pageBox.height + 1 : false;
    })
    .toBe(true);

  await page.setViewportSize({ width: 320, height: 700 });
  const workspace = page.getByRole('region', {
    name: 'Rulebook editor and preview',
  });
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

test('Pages and Blocks can be deleted and the last Page can be replaced', async ({ page }) => {
  await page.goto(`${editorPath}#RULE/TEXT`);
  const structure = rulebookStructure(page);
  const removeBlock = page.getByRole('button', { name: 'Delete Block', exact: true });
  await removeBlock.focus();
  await page.keyboard.down(' ');
  await expect(
    structure.getByLabel('The storm closes the boundary between its two sectors.', { exact: true })
  ).toHaveCount(0, { timeout: 8000 });
  await page.keyboard.up(' ');
  await expect(page).toHaveURL(/#RULE\/details$/);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
  await page.reload();
  await expect(
    structure.getByLabel('The storm closes the boundary between its two sectors.', { exact: true })
  ).toHaveCount(0);
  for (let remaining = 3; remaining > 0; remaining -= 1) {
    const removePage = page.getByRole('button', { name: 'Delete Page', exact: true });
    await removePage.focus();
    await page.keyboard.down(' ');
    if (remaining > 1) {
      await expect(structure.getByRole('navigation', { name: 'Pages', exact: true }).getByRole('link')).toHaveCount(
        remaining - 1,
        { timeout: 8000 }
      );
    } else {
      await expect(page.getByText('This Rulebook has no Pages.', { exact: true })).toBeVisible({ timeout: 8000 });
    }
    await page.keyboard.up(' ');
  }
  await page.getByRole('button', { name: 'Add Page', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Cover', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Show Dune logo', exact: true })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
  await page.reload();
  await expect(structure.getByRole('navigation', { name: 'Pages', exact: true }).getByRole('link')).toHaveCount(1);
  await expect(page.getByRole('switch', { name: 'Show Dune logo', exact: true })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Supporting text', exact: true })).toBeVisible();
});
