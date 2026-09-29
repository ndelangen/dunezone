import { expect, within } from 'storybook/test';

/**
 * The shared body of the stories that hold an editor's authoring toolbar to one line at a phone, tablet, laptop and desktop width.
 *
 * Each story states its page, its width, and the words Save's description carries: its state, then any note the page adds.
 * The bar carries no status marks (Norbert, 2026-09-29), so a phone keeps it one row by folding whole runs of actions into More actions, never by wrapping.
 * Pure helpers over the page, no fixtures and no decorators.
 */
const TIMEOUT = { timeout: 30_000 } as const;

/** The elements a reader sees in the bar: its controls. */
const BAR_ITEMS = 'button, a';

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
  throw new Error('Back and Save share no ancestor.');
}

interface BarItem {
  item: Element;
  box: DOMRect;
}

function nameOf(item: Element): string {
  return item.getAttribute('aria-label') ?? item.textContent ?? item.tagName;
}

function slotOf(row: Element, item: Element): Element {
  const slot = [...row.children].find((child) => child.contains(item));
  if (!slot) {
    throw new Error(`${nameOf(item)} sits in no slot of the bar.`);
  }
  return slot;
}

/** The bar's visible items from left to right, each counted once: a glyph inside a button is part of that button, not its neighbour. */
function barItems(row: Element): BarItem[] {
  const elements = [...row.querySelectorAll(BAR_ITEMS)];
  return elements
    .filter((item) => !elements.some((other) => other !== item && other.contains(item)))
    .map((item) => ({ item, box: item.getBoundingClientRect() }))
    .filter(({ box }) => box.width > 0 && box.height > 0)
    .sort((first, second) => first.box.left - second.box.left);
}

/** One line: nothing stacks under anything else, so the row is no taller than its tallest item, and nothing runs past its edges. */
function expectOneLine(row: Element, items: BarItem[]) {
  const rowBox = row.getBoundingClientRect();
  expect(rowBox.height).toBeLessThanOrEqual(Math.max(...items.map(({ box }) => box.height)) + 1);
  for (const { item, box } of items) {
    expect(box.left, `${nameOf(item)} starts before the bar`).toBeGreaterThanOrEqual(rowBox.left - 1);
    expect(box.right, `${nameOf(item)} ends past the bar`).toBeLessThanOrEqual(rowBox.right + 1);
  }
}

/** Side by side: each item starts where the one before it ends, or later, so nothing covers its neighbour. */
function expectNoOverlap(items: BarItem[]) {
  items.slice(1).forEach(({ item, box }, index) => {
    const previous = items[index];
    expect(box.left, `${nameOf(item)} overlaps ${nameOf(previous.item)}`).toBeGreaterThanOrEqual(
      previous.box.right - 0.5
    );
  });
}

function expectEachInItsSlot(row: Element, items: BarItem[]) {
  for (const { item, box } of items) {
    const slot = slotOf(row, item).getBoundingClientRect();
    expect(box.left, `${nameOf(item)} leaves its slot`).toBeGreaterThanOrEqual(slot.left - 0.5);
    expect(box.right, `${nameOf(item)} leaves its slot`).toBeLessThanOrEqual(slot.right + 0.5);
  }
}

/** An editor's Save, which stands last among its editing actions whatever the page names it. */
export async function findSave(canvasElement: HTMLElement): Promise<HTMLElement> {
  const page = within(canvasElement.ownerDocument.body);
  const actions = await page.findByRole('group', { name: 'Editing actions' }, TIMEOUT);
  const save = within(actions).getAllByRole('button').at(-1);
  if (!save) {
    throw new Error('The editing actions hold no Save.');
  }
  return save;
}

export async function expectToolbarOnOneLine(
  canvasElement: HTMLElement,
  { saveDescribes }: { saveDescribes: string[] }
) {
  const page = within(canvasElement.ownerDocument.body);
  const back = await page.findByRole('button', { name: 'Back' }, TIMEOUT);
  const save = await findSave(canvasElement);
  for (const words of saveDescribes) {
    await expect(save).toHaveAccessibleDescription(expect.stringContaining(words));
  }

  await canvasElement.ownerDocument.fonts.ready;
  /* Back leads the bar and Save ends it, so the element holding both is the row the bar lays out. */
  const row = lowestCommonAncestor(back, save);
  const items = barItems(row);
  expect(row.querySelector('[role="img"]'), 'the bar carries no status marks').toBeNull();
  expectOneLine(row, items);
  expectNoOverlap(items);
  /*
   * With room for everything, each item also sits inside its own slot.
   * Once runs have folded into More actions the bar has run out of room and its centre gives way to the edges (Toolbar), so only overlap is ruled out there.
   */
  if (!within(row as HTMLElement).queryByRole('button', { name: 'More actions' })) {
    expectEachInItsSlot(row, items);
  }
}
