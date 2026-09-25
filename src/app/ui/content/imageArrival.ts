/*
 * The page-wide half of a published image's arrival, an organ of `PublishedImage`.
 * It holds module state rather than a context, so the order works on any page without a caller mounting a provider.
 *
 * Reading order is counted in tiles.
 * A tile is the link an image sits in, such as a faction card or an asset pile, or the image itself when it sits in none, so a card's tokens share one place in the order.
 * Every image in flight joins the gate once it knows its place; a decoded image is revealed only when no image in its own tile or earlier in the order is still loading, so a page fills from the top instead of in network order.
 */

/** A decoded image waiting on an earlier one is revealed after this long anyway, so one slow image cannot hold the page. */
const MAX_WAIT_MS = 700;

/**
 * Tiles revealed close together arrive this far apart, one reading-order step after another.
 * The spacing carries from one pass to the next, so no tile waits longer than `MAX_WAIT_MS` for its turn, and the tiles that reach that bound land together.
 */
const STAGGER_MS = 40;

/** Rows are bucketed to this height, so the slight tilt of a fanned pile does not reorder a row. */
const ROW_PX = 24;

/*
 * Every src decoded during this page session.
 * Module scope survives client navigation, so returning to a page shows its images at once instead of replaying their arrival.
 */
const decoded = new Set<string>();

export function wasDecoded(src: string) {
  return decoded.has(src);
}

export function markDecoded(src: string) {
  decoded.add(src);
}

const unordered = new Map<HTMLElement, (order: number) => void>();
let nextOrder = 0;
let orderFrame = 0;

/** Places an image in reading order one frame after it mounts, once its neighbours have mounted too; the returned function withdraws it. */
export function requestOrder(element: HTMLElement, assign: (order: number) => void) {
  unordered.set(element, assign);
  if (!orderFrame) {
    orderFrame = requestAnimationFrame(assignOrders);
  }
  return () => {
    unordered.delete(element);
  };
}

function assignOrders() {
  orderFrame = 0;
  const tiles = new Map<Element, { row: number; left: number; assigns: ((order: number) => void)[] }>();
  for (const [element, assign] of unordered) {
    const tile = element.closest('a') ?? element;
    const known = tiles.get(tile);
    if (known) {
      known.assigns.push(assign);
      continue;
    }
    const rect = tile.getBoundingClientRect();
    tiles.set(tile, { row: Math.round((rect.top + window.scrollY) / ROW_PX), left: rect.left, assigns: [assign] });
  }
  unordered.clear();
  for (const tile of [...tiles.values()].sort((a, b) => a.row - b.row || a.left - b.left)) {
    const order = nextOrder++;
    for (const assign of tile.assigns) {
      assign(order);
    }
  }
}

type Entry = {
  order: number;
  reveal: (() => void) | null;
  forced: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
};

const gate = new Set<Entry>();
let lastRevealAt = 0;
let lastRevealOrder = -1;

function flush() {
  const entries = [...gate].sort((a, b) => a.order - b.order);
  /* An image still loading holds its own tile too, so a card's tokens arrive together. */
  const blockedFrom = Math.min(...entries.filter((entry) => !entry.reveal).map((entry) => entry.order));
  for (const entry of entries) {
    if (!entry.reveal || (entry.order >= blockedFrom && !entry.forced)) {
      continue;
    }
    gate.delete(entry);
    clearTimeout(entry.timer);
    const now = performance.now();
    const at =
      entry.order === lastRevealOrder
        ? lastRevealAt
        : Math.min(Math.max(now, lastRevealAt + STAGGER_MS), now + MAX_WAIT_MS);
    lastRevealAt = at;
    lastRevealOrder = entry.order;
    setTimeout(entry.reveal, at - now);
  }
}

/**
 * Joins the gate for an image in flight at its place in the order.
 * Call `ready` once the image is decoded, with what revealing it does.
 * Call `leave` when it no longer waits for anything, which is safe to repeat.
 */
export function joinArrival(order: number) {
  const entry: Entry = { order, reveal: null, forced: false, timer: undefined };
  gate.add(entry);
  return {
    ready(reveal: () => void) {
      entry.reveal = reveal;
      entry.timer = setTimeout(() => {
        entry.forced = true;
        flush();
      }, MAX_WAIT_MS);
      flush();
    },
    leave() {
      clearTimeout(entry.timer);
      if (gate.delete(entry)) {
        flush();
      }
    },
  };
}
