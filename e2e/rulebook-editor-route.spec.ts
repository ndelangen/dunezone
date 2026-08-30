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
  await expect(preview.getByRole('img', { name: 'Referenced Asset is unavailable' })).toBeVisible();

  await content.fill('Cross the *open desert* before the storm moves.');
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
  const text = structure.getByRole('link', {
    name: 'The storm closes the boundary between its two sectors.',
  });
  const storm = structure.getByRole('link', { name: 'Storm marker' });
  const originalUrl = page.url();

  await drag(text, movement, page);
  await expect
    .poll(() => rules.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label'))))
    .toEqual(['The storm closes the boundary between its two sectors.', 'Movement sequence']);
  expect(page.url()).toBe(originalUrl);

  await drag(text, storm, page);
  await expect(
    rules.getByRole('link', {
      name: 'The storm closes the boundary between its two sectors.',
    })
  ).toHaveCount(0);
  await expect(
    examples.getByRole('link', {
      name: 'The storm closes the boundary between its two sectors.',
    })
  ).toBeVisible();
  await drag(movement, examples, page, false);
  await expect(examples.locator('..')).toHaveCSS('opacity', '0.28');
  await page.mouse.up();
  await expect(rules.getByRole('link', { name: 'Movement sequence' })).toBeVisible();
  expect(page.url()).toBe(originalUrl);
});

test('rail cross-region dragging previews placement without settling the Block before drop', async ({ page }) => {
  await page.goto(`${editorPath}#RULE/details`);

  const structure = rulebookStructure(page);
  const rules = structure.getByRole('list', { name: 'Rules' });
  const examples = structure.getByRole('list', { name: 'Examples' });
  const text = structure.getByRole('link', {
    name: 'The storm closes the boundary between its two sectors.',
  });
  const storm = structure.getByRole('link', { name: 'Storm marker' });
  const confirm = examples.locator('a[aria-label="Confirm that the destination is adjacent."]');

  await dragToVerticalRatio(text, storm, page, 0.15, false);

  await expect(structure.locator('[data-rail-drag-placeholder]')).toHaveCount(1);
  await expect(examples.locator('[data-rail-drag-placeholder]')).toHaveCount(1);
  await expect(examples.locator('a[aria-label="The storm closes the boundary between its two sectors."]')).toHaveCSS(
    'opacity',
    '0'
  );
  const expectedExampleOrder = [
    'The storm closes the boundary between its two sectors.',
    'Storm marker',
    'Confirm that the destination is adjacent.',
  ];
  await expect
    .poll(() =>
      examples.locator('a[aria-label]').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')))
    )
    .toEqual(expectedExampleOrder);
  await expect
    .poll(() =>
      page
        .getByRole('region', { name: 'Examples' })
        .getByRole('list')
        .getByRole('button')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('aria-label')?.replace(/^Edit /, '') ?? null)
        )
    )
    .toEqual(expectedExampleOrder);
  await expect(page.getByText('Saved draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  const expectedAdvancedExampleOrder = [
    'Storm marker',
    'Confirm that the destination is adjacent.',
    'The storm closes the boundary between its two sectors.',
  ];
  await movePointerToVerticalRatio(confirm, page, 0.85);
  await expect
    .poll(() =>
      examples.locator('a[aria-label]').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')))
    )
    .toEqual(expectedAdvancedExampleOrder);
  await expect
    .poll(() =>
      examples.locator('a[aria-label]').evaluateAll((links) =>
        links
          .map((link) => ({
            label: link.getAttribute('aria-label'),
            top: link.getBoundingClientRect().top,
          }))
          .sort((left, right) => left.top - right.top)
          .map(({ label }) => label)
      )
    )
    .toEqual(expectedAdvancedExampleOrder);
  await expect
    .poll(() =>
      page
        .getByRole('region', { name: 'Examples' })
        .getByRole('list')
        .getByRole('button')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('aria-label')?.replace(/^Edit /, '') ?? null)
        )
    )
    .toEqual(expectedAdvancedExampleOrder);
  await expect
    .poll(() =>
      renderedAriaLabelOrder(
        page.getByRole('region', { name: 'Examples' }).getByRole('list').getByRole('button'),
        'Edit '
      )
    )
    .toEqual(expectedAdvancedExampleOrder);
  await expect(page.getByText('Saved draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(structure.locator('[data-rail-drag-placeholder]')).toHaveCount(0);
  await expect(
    rules.getByRole('link', {
      name: 'The storm closes the boundary between its two sectors.',
    })
  ).toBeVisible();
  await expect(page.getByText('Saved draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  await dragToVerticalRatio(text, storm, page, 0.15, false);
  await page.mouse.up();
  await expect(structure.locator('[data-rail-drag-placeholder]')).toHaveCount(0);
  await expect(
    examples.getByRole('link', {
      name: 'The storm closes the boundary between its two sectors.',
    })
  ).toBeVisible();
  await expect
    .poll(() => examples.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label'))))
    .toEqual(expectedExampleOrder);
  await expect(page.getByText('Local changes')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
});

test('Page-details cross-region preview stays transient until drop', async ({ page }) => {
  await page.goto(`${editorPath}#RULE/details`);

  const rules = page.getByRole('region', { name: 'Rules' });
  const examples = page.getByRole('region', { name: 'Examples' });
  const text = rules.getByRole('button', {
    name: 'Edit The storm closes the boundary between its two sectors.',
  });
  const storm = examples.getByRole('button', { name: 'Edit Storm marker' });
  const confirm = examples.getByRole('button', {
    name: 'Edit Confirm that the destination is adjacent.',
  });
  const expectedExampleOrder = [
    'The storm closes the boundary between its two sectors.',
    'Storm marker',
    'Confirm that the destination is adjacent.',
  ];
  const detailExampleOrder = () =>
    examples
      .getByRole('list')
      .getByRole('button')
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute('aria-label')?.replace(/^Edit /, '') ?? null)
      );
  const railExampleOrder = () =>
    rulebookStructure(page)
      .getByRole('list', { name: 'Examples' })
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')));

  await dragToVerticalRatio(text, storm, page, 0.15, false);
  await expect.poll(detailExampleOrder).toEqual(expectedExampleOrder);
  await expect.poll(railExampleOrder).toEqual(expectedExampleOrder);
  for (let frame = 0; frame < 3; frame += 1) {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
  expect(await detailExampleOrder()).toEqual(expectedExampleOrder);
  expect(await railExampleOrder()).toEqual(expectedExampleOrder);
  await expect(page.getByText('Saved draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  const expectedAdvancedExampleOrder = [
    'Storm marker',
    'Confirm that the destination is adjacent.',
    'The storm closes the boundary between its two sectors.',
  ];
  await movePointerToVerticalRatio(confirm, page, 0.85);
  await expect.poll(detailExampleOrder).toEqual(expectedAdvancedExampleOrder);
  await expect.poll(railExampleOrder).toEqual(expectedAdvancedExampleOrder);
  await expect
    .poll(() => renderedAriaLabelOrder(examples.getByRole('list').getByRole('button'), 'Edit '))
    .toEqual(expectedAdvancedExampleOrder);
  await expect(page.getByText('Saved draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(
    rules.getByRole('button', {
      name: 'Edit The storm closes the boundary between its two sectors.',
    })
  ).toBeVisible();
  await expect(page.getByText('Saved draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  await page.reload();
  await expect(page.getByText('Saved draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  await dragToVerticalRatio(text, storm, page, 0.15, false);
  await page.mouse.up();
  await expect.poll(detailExampleOrder).toEqual(expectedExampleOrder);
  await expect.poll(railExampleOrder).toEqual(expectedExampleOrder);
  await expect(page.getByText('Local changes')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
});

test('cross-region previews reach the first and last slots in the rail and Page details', async ({ page }) => {
  const movedLabel = 'The storm closes the boundary between its two sectors.';
  const firstOrder = [movedLabel, 'Storm marker', 'Confirm that the destination is adjacent.'];
  const lastOrder = ['Storm marker', 'Confirm that the destination is adjacent.', movedLabel];

  await page.goto(`${editorPath}#RULE/details`);
  const structure = rulebookStructure(page);
  const railRules = structure.getByRole('list', { name: 'Rules' });
  const railExamples = structure.getByRole('list', { name: 'Examples' });
  const railText = railRules.getByRole('link', { name: movedLabel });
  const railStorm = railExamples.getByRole('link', { name: 'Storm marker' });
  const railOrder = () =>
    railExamples.locator('a[aria-label]').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')));

  await dragToVerticalRatio(railText, railStorm, page, 0.5, false);
  await movePointerToVerticalEdge(railExamples, page, 'end');
  await expect.poll(railOrder).toEqual(lastOrder);
  await movePointerToVerticalEdge(railExamples, page, 'start');
  await expect.poll(railOrder).toEqual(firstOrder);
  await page.keyboard.press('Escape');
  await page.mouse.up();

  const detailRules = page.getByRole('region', { name: 'Rules' });
  const detailExamples = page.getByRole('region', { name: 'Examples' });
  const detailList = detailExamples.getByRole('list');
  const detailText = detailRules.getByRole('button', {
    name: `Edit ${movedLabel}`,
  });
  const detailStorm = detailExamples.getByRole('button', {
    name: 'Edit Storm marker',
  });
  const detailOrder = () =>
    detailList
      .getByRole('button')
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute('aria-label')?.replace(/^Edit /, '') ?? null)
      );

  await dragToVerticalRatio(detailText, detailStorm, page, 0.5, false);
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
  const detailAdd = page.getByRole('button', { name: 'Add a Block to Rules' });
  const collapse = page.getByRole('button', { name: 'Collapse Rules' });
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

  const examples = page.getByRole('region', { name: 'Examples' });
  const storm = examples.getByRole('button', { name: 'Edit Storm marker' });
  const confirm = examples.getByRole('button', {
    name: 'Edit Confirm that the destination is adjacent.',
  });

  await dragToVerticalRatio(confirm, storm, page, 0.4, false);
  await expect
    .poll(async () => {
      const confirmBox = await confirm.locator('..').boundingBox();
      const stormBox = await storm.locator('..').boundingBox();
      return confirmBox && stormBox ? confirmBox.y < stormBox.y : false;
    })
    .toBe(true);
  await page.mouse.up();

  const expectedOrder = ['Confirm that the destination is adjacent.', 'Storm marker'];
  await expect
    .poll(() =>
      examples
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
        .getByRole('list', { name: 'Examples' })
        .getByRole('link')
        .evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')))
    )
    .toEqual(expectedOrder);
  await expect
    .poll(() =>
      page
        .getByRole('article', { name: 'Rulebook page: Movement' })
        .locator('[data-rulebook-region="examples"] [data-rulebook-block-id]')
        .evaluateAll((blocks) => blocks.map((block) => block.getAttribute('data-rulebook-block-id')))
    )
    .toEqual(['L5ST', 'ASST']);
});

test('Page details supports top, bottom, reversal, compatible, and full-region Block placement', async ({ page }) => {
  await page.goto(`${editorPath}#RULE/details`);

  const rules = page.getByRole('region', { name: 'Rules' });
  const examples = page.getByRole('region', { name: 'Examples' });
  const movement = rules.getByRole('button', {
    name: 'Edit Movement sequence',
  });
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

  await dragToVerticalRatio(text, storm, page, 0.15, false);
  const expectedExampleOrder = [
    'The storm closes the boundary between its two sectors.',
    'Storm marker',
    'Confirm that the destination is adjacent.',
  ];
  await expect
    .poll(() =>
      examples
        .getByRole('list')
        .getByRole('button')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('aria-label')?.replace(/^Edit /, '') ?? null)
        )
    )
    .toEqual(expectedExampleOrder);
  await page.mouse.up();
  await expect(
    rules.getByRole('button', {
      name: 'Edit The storm closes the boundary between its two sectors.',
    })
  ).toHaveCount(0);
  await expect(
    examples.getByRole('button', {
      name: 'Edit The storm closes the boundary between its two sectors.',
    })
  ).toBeVisible();
  await expect
    .poll(() =>
      examples
        .getByRole('list')
        .getByRole('button')
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute('aria-label')?.replace(/^Edit /, '') ?? null)
        )
    )
    .toEqual(expectedExampleOrder);
  await expect
    .poll(() =>
      rulebookStructure(page)
        .getByRole('list', { name: 'Examples' })
        .getByRole('link')
        .evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')))
    )
    .toEqual(expectedExampleOrder);

  await rules.getByRole('button', { name: 'Add a Block to Rules' }).click();
  await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
  await rulebookStructure(page).getByRole('link', { name: 'Page details' }).click();
  const newText = rules.getByRole('button', {
    name: 'Edit Replace this starter content with your text.',
  });
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
  const newText = structure.getByRole('link', {
    name: 'Replace this starter content with your text.',
  });
  const emptyExamples = structure.getByRole('list', { name: 'Examples' });
  await expect(emptyExamples.getByRole('link')).toHaveCount(0);
  await drag(newText, emptyExamples.locator('..'), page);
  await expect(
    emptyExamples.getByRole('link', {
      name: 'Replace this starter content with your text.',
    })
  ).toBeVisible();

  await structure.getByRole('link', { name: 'Page details' }).click();
  const rulesRegion = page.getByRole('region', { name: 'Rules', exact: true });
  const examplesRegion = page.getByRole('region', { name: 'Examples', exact: true });
  await expect(rulesRegion.getByRole('list').getByRole('button', { name: /^Edit / })).toHaveCount(0);
  await expect(rulesRegion.getByText('No Blocks in this region.')).toBeVisible();
  await expect(
    examplesRegion.getByRole('button', {
      name: /Edit Replace this starter content/,
    })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Collapse Examples' }).click();
  await expect(page.getByRole('button', { name: 'Expand Examples' })).toBeVisible();
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
  expect(Math.abs(sidebarBox.y - fitHeightBox.y)).toBeLessThanOrEqual(1);
  expect(sidebarBox.height).toBeGreaterThanOrEqual(fitHeightBox.height - 1);
  expect(sidebarSurfaceBox.height).toBeGreaterThanOrEqual(fitHeightBox.height - 1);
  await expect(preview).toHaveCSS('overflow', 'hidden');
  await expect
    .poll(async () => {
      const pageBox = await preview.boundingBox();
      const contentBox = await preview.locator(':scope > div').boundingBox();
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
