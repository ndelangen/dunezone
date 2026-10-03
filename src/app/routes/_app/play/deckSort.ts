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
  /* The cards between where the held card was and where it would land, the landing slot included. */
  const low = Math.min(from, target);
  const high = Math.max(from, target);
  const passed = index !== from && index >= low && index <= high;
  return passed ? Math.sign(from - target) * step : 0;
}
