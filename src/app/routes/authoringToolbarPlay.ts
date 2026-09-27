import { expect, within } from 'storybook/test';

/**
 * The shared body of the stories that hold an editor's authoring toolbar to one line at a phone, tablet, laptop and desktop width.
 *
 * Each story states its page, its width, the statuses that page shows at rest, and whether the toolbar is narrow enough to fold them into one glyph.
 * Pure helpers over the page, no fixtures and no decorators.
 */
const TIMEOUT = { timeout: 30_000 } as const;

/** The elements a reader sees in the bar: its controls and its status glyphs. */
const BAR_ITEMS = 'button, a, [role="img"]';

function lowestCommonAncestor(first: Element, second: Element): Element {
  const ancestors = new Set<Element>();
  for (let node: Element | null = first; node; node = node.parentElement) {
    ancestors.add(node);
  }
  for (let node: Element | null = second; node; node = node.parentElement) {
    if (ancestors.has(node)) {
      return node;
    }
  }
  throw new Error('Back and Reset share no ancestor.');
}

export async function expectToolbarStatusesOnOneLine(
  canvasElement: HTMLElement,
  { statuses, folded }: { statuses: string[]; folded: boolean }
) {
  const page = within(canvasElement.ownerDocument.body);
  const back = await page.findByRole('button', { name: 'Back' }, TIMEOUT);
  const reset = await page.findByRole('button', { name: 'Reset unsaved edits' }, TIMEOUT);

  if (folded) {
    expect(page.queryByRole('group', { name: 'Status' })).toBeNull();
    const mark = await page.findByRole('img', { name: `Status: ${statuses[0]}` }, TIMEOUT);
    await expect(mark).toHaveAccessibleDescription(statuses.join(' '));
  } else {
    const group = within(await page.findByRole('group', { name: 'Status' }, TIMEOUT));
    for (const wording of statuses) {
      await expect(group.findByRole('img', { name: wording }, TIMEOUT)).resolves.toBeVisible();
    }
  }

  await canvasElement.ownerDocument.fonts.ready;
  /* Back leads the bar and Reset sits among the actions, so the element holding both is the row the bar lays out. */
  const row = lowestCommonAncestor(back, reset);
  const rowBox = row.getBoundingClientRect();
  const items = [...row.querySelectorAll(BAR_ITEMS)]
    .map((item) => item.getBoundingClientRect())
    .filter((box) => box.width > 0 && box.height > 0);
  const tallest = Math.max(...items.map((box) => box.height));
  /* One line: nothing stacks under anything else, so the row is no taller than its tallest item, and nothing runs past its edges. */
  expect(rowBox.height).toBeLessThanOrEqual(tallest + 1);
  for (const box of items) {
    expect(box.left).toBeGreaterThanOrEqual(rowBox.left - 1);
    expect(box.right).toBeLessThanOrEqual(rowBox.right + 1);
  }
}
