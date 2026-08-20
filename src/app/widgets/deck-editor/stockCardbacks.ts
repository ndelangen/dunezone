import type { CardBack } from '@shared/assets/schema';
import type { z } from 'zod';

import { backgroundPresets } from '@game/data/backgrounds';

export type CardbackData = z.infer<typeof CardBack>;

/**
 * The product's own cardbacks, defined in code rather than stored.
 *
 * Publication is uniform: a deck publishes its own cardback image whether the back came from here or was authored, so these only supply a render payload.
 * That is why the chosen key is never stored, and why `src/shared` and the server know nothing about this file.
 */
export const STOCK_CARDBACKS: { key: string; label: string; cardback: CardbackData }[] = [
  {
    key: 'treachery',
    label: 'Treachery',
    cardback: {
      name: 'Treachery',
      background: backgroundPresets.weapon,
      image: '/vector/icon/projectile.svg',
      imageScale: 0.55,
      imageOffset: [0, 10],
    },
  },
  {
    key: 'spice',
    label: 'Spice',
    cardback: {
      name: 'Spice',
      background: backgroundPresets.special,
      image: '/vector/icon/eye.svg',
      imageScale: 0.55,
      imageOffset: [0, 10],
    },
  },
  {
    key: 'traitor',
    label: 'Traitor',
    cardback: {
      name: 'Traitor',
      background: backgroundPresets.defense,
      image: '/vector/icon/traitor.svg',
      imageScale: 0.55,
      imageOffset: [0, 10],
    },
  },
];

/**
 * Value equality, since a stock back is only "chosen" while the stored composition still matches it exactly.
 *
 * Scalars compare field by field;
 * `colors` alone compares by stringify, because a colour element may be a gradient object and a round-tripped clone never satisfies reference equality.
 * Stringifying the whole background would be unsafe, since Zod's key order differs from this file's, but `colors` is an array whose element order is the contract, so its stringify is stable.
 * `sameBand` and the card editor's `sameBackground` follow the same split.
 */
function sameCardback(a: CardbackData, b: CardbackData): boolean {
  return (
    a.name === b.name &&
    a.image === b.image &&
    a.imageScale === b.imageScale &&
    a.imageOffset[0] === b.imageOffset[0] &&
    a.imageOffset[1] === b.imageOffset[1] &&
    a.background.image === b.background.image &&
    a.background.invert === b.background.invert &&
    a.background.definition === b.background.definition &&
    a.background.influence === b.background.influence &&
    JSON.stringify(a.background.colors) === JSON.stringify(b.background.colors)
  );
}

export function stockKeyFor(cardback: CardbackData): string | null {
  return STOCK_CARDBACKS.find((stock) => sameCardback(stock.cardback, cardback))?.key ?? null;
}
