import type { StoredPiece } from './model';

/** The asset type of a Treachery card: the cards a hand's public count is about. */
const TREACHERY_CARD = 'card-treachery';

/**
 * How many Treachery cards each faction holds, by faction id, with every listed faction present (zero when its hand holds none).
 * The rules make the size of a hand public, so every viewer sees these counts;
 * leaders, traitors, the alliance card and a faction's Extras in the same hand are not counted.
 */
export function treacheryHandCounts(
  inventories: Readonly<Partial<Record<string, readonly StoredPiece[]>>>,
  factionIds: readonly string[]
): Record<string, number> {
  return Object.fromEntries(
    factionIds.map((factionId) => [
      factionId,
      (inventories[factionId] ?? []).reduce(
        (total, piece) =>
          total +
          (piece.kind === 'card' ? piece.items.filter((item) => item.artwork?.type === TREACHERY_CARD).length : 0),
        0
      ),
    ])
  );
}

/**
 * The grid that gives each of `count` cells the largest size inside a `width` by `height` area, for cells `aspect` times as wide as tall.
 * Six cells in the card slot's portrait area lay out two by three.
 */
export function handCountGrid(count: number, aspect: number, width: number, height: number) {
  let best = { cols: 1, rows: Math.max(count, 1), size: 0 };
  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    const size = Math.min(width / cols / aspect, height / rows);
    if (size > best.size + 1e-6) {
      best = { cols, rows, size };
    }
  }
  return best;
}
