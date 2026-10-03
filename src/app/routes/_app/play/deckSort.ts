/*
 * Reordering a peeked deck by hand: the held card follows the pointer, and the cards it passes slide aside at once,
 * so the row always shows where the card will land before it is let go.
 */

/** The place a held card would land: the slot whose centre lies nearest the card's centre as it is carried. */
export function sortTarget(centers: readonly number[], from: number, offset: number): number {
  const carried = centers[from]! + offset;
  let nearest = from;
  for (const [index, center] of centers.entries()) {
    if (Math.abs(center - carried) < Math.abs(centers[nearest]! - carried)) {
      nearest = index;
    }
  }
  return nearest;
}

/** How far a card that is not held slides aside while the held card hovers over `target`: one place, toward the gap the held card left. */
export function sortShift(index: number, from: number, target: number, step: number): number {
  if (from < target && index > from && index <= target) {
    return -step;
  }
  if (target < from && index >= target && index < from) {
    return step;
  }
  return 0;
}
