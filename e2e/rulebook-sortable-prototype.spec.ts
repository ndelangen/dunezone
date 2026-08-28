import { expect, test } from './coverage';

test.use({ storageState: { cookies: [], origins: [] } });

const prototypePath = '/rulesets/prototype/rulebooks/prototype/edit';

test('a Block keeps one candidate position during midpoint pointer jitter', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(prototypePath);

  const sourceHandle = page.getByRole('button', { name: 'Move Block 1', exact: true });
  const sourceRow = sourceHandle.locator('xpath=ancestor::li');
  const targetRow = page
    .getByRole('button', { name: 'Move Block 2', exact: true })
    .locator('xpath=ancestor::li');
  const sourceBox = await sourceRow.boundingBox();
  const handleBox = await sourceHandle.boundingBox();
  const targetBox = await targetRow.boundingBox();

  if (!sourceBox || !handleBox || !targetBox) {
    throw new Error('The sortable prototype rows have no rendered bounds.');
  }

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  const sourceCenter = sourceBox.y + sourceBox.height / 2;
  const targetCenter = targetBox.y + targetBox.height / 2;
  const midpointPointerY = startY + targetCenter - sourceCenter;
  const sampledTargetYs: number[] = [];

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 240, midpointPointerY, { steps: 8 });

  const previewBox = await page.getByTestId('summary-drag-preview').boundingBox();
  if (!previewBox) {
    throw new Error('The drag preview has no rendered bounds.');
  }
  expect(Math.abs(previewBox.x - sourceBox.x)).toBeLessThan(2);

  for (const offset of [-3, 3, -3, 3, -3]) {
    await page.mouse.move(startX, midpointPointerY + offset, { steps: 4 });
    await page.waitForTimeout(30);
    const box = await targetRow.boundingBox();
    if (!box) {
      throw new Error('Block 2 lost its rendered bounds during the drag.');
    }
    sampledTargetYs.push(box.y);
  }

  await page.mouse.up();

  expect(Math.max(...sampledTargetYs) - Math.min(...sampledTargetYs)).toBeLessThan(8);
});

test('a compatible Block can move into another Block region', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(prototypePath);

  const sourceHandle = page.getByRole('button', { name: 'Move Block 1', exact: true });
  const targetHandle = page.getByRole('button', { name: 'Move Block 7', exact: true });
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHandle.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error('The cross-region drag handles have no rendered bounds.');
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 20,
  });
  await page.mouse.up();

  const rulesRegion = page.getByRole('region', { name: 'Rules', exact: true });
  await expect(rulesRegion.getByRole('link', { name: 'Block 1 text', exact: true })).toBeVisible();
});

test('an incompatible Block stays in its current Block region', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(prototypePath);

  const sourceHandle = page.getByRole('button', { name: 'Move Block 2', exact: true });
  const targetHandle = page.getByRole('button', { name: 'Move Block 7', exact: true });
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHandle.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error('The incompatible drag handles have no rendered bounds.');
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 20,
  });
  await page.mouse.up();

  const openingRegion = page.getByRole('region', { name: 'Opening', exact: true });
  const rulesRegion = page.getByRole('region', { name: 'Rules', exact: true });
  await expect(openingRegion.getByRole('link', { name: 'Block 2 callout', exact: true })).toBeVisible();
  await expect(rulesRegion.getByRole('link', { name: 'Block 2 callout', exact: true })).toHaveCount(0);
});
