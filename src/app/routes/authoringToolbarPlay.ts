import { expect, within } from 'storybook/test';

/**
 * The shared body of the stories that hold an editor's authoring toolbar to one line at a phone, tablet, laptop and desktop width.
 *
 * Each story states its page, its width, the statuses the page shows, and whether the toolbar is narrow enough to fold them into one glyph.
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

function slotOf(row: Element, item: Element): Element {
  const slot = [...row.children].find((child) => child.contains(item));
  if (!slot) {
    throw new Error(`${nameOf(item)} sits in no slot of the bar.`);
  }
  return slot;
}

function nameOf(item: Element): string {
  return item.getAttribute('aria-label') ?? item.textContent ?? item.tagName;
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
  const elements = [...row.querySelectorAll(BAR_ITEMS)];
  /* A glyph inside a button is part of that button, not its neighbour. */
  const items = elements
    .filter((item) => !elements.some((other) => other !== item && other.contains(item)))
    .map((item) => ({ item, box: item.getBoundingClientRect() }))
    .filter(({ box }) => box.width > 0 && box.height > 0)
    .sort((first, second) => first.box.left - second.box.left);
  const tallest = Math.max(...items.map(({ box }) => box.height));
  /* One line: nothing stacks under anything else, so the row is no taller than its tallest item, and nothing runs past its edges. */
  expect(rowBox.height).toBeLessThanOrEqual(tallest + 1);
  for (const { item, box } of items) {
    expect(box.left, `${nameOf(item)} starts before the bar`).toBeGreaterThanOrEqual(rowBox.left - 1);
    expect(box.right, `${nameOf(item)} ends past the bar`).toBeLessThanOrEqual(rowBox.right + 1);
  }
  /* Side by side: each item starts where the one before it ends, or later, so nothing covers its neighbour. */
  for (const [index, { item, box }] of items.entries()) {
    const previous = items[index - 1];
    if (previous) {
      expect(box.left, `${nameOf(item)} overlaps ${nameOf(previous.item)}`).toBeGreaterThanOrEqual(
        previous.box.right - 0.5
      );
    }
  }
  /*
   * Unfolded, the bar has room for everything, so each item also sits inside its own slot.
   * Folded, the bar has run out of room and its centre gives way to the edges (Toolbar), so only overlap is ruled out there.
   */
  if (!folded) {
    for (const { item, box } of items) {
      const slot = slotOf(row, item).getBoundingClientRect();
      expect(box.left, `${nameOf(item)} leaves its slot`).toBeGreaterThanOrEqual(slot.left - 0.5);
      expect(box.right, `${nameOf(item)} leaves its slot`).toBeLessThanOrEqual(slot.right + 0.5);
    }
  }
}
