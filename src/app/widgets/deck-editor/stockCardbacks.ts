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
 * Field by field rather than `JSON.stringify`, because a cardback that round-tripped through the database is a clone of its stock original with Zod's key order rather than this file's.
 * The card editor's background comparison learned the same lesson.
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
    a.background.colors[0] === b.background.colors[0] &&
    a.background.colors[1] === b.background.colors[1]
  );
}

export function stockKeyFor(cardback: CardbackData): string | null {
  return STOCK_CARDBACKS.find((stock) => sameCardback(stock.cardback, cardback))?.key ?? null;
}
