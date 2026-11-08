import { z } from 'zod';

import type { RulesetCapture } from './capture';

/**
 * One card of the game's Treachery deck as the Treachery tracker reads it (#150): its name, the line under the name
 * ("Weapon - Projectile"), its published face and how many copies the deck holds.
 * What the deck holds is public, as the printed deck list is at a physical table.
 */
const treacheryDeckCardSchema = z.object({
  /* As long as the capture's own fields: a check tighter than the capture would refuse a legal deck and drop the page from its table. */
  key: z.string().min(1),
  name: z.string(),
  detail: z.string(),
  face: z.string().url(),
  count: z.number().int().positive(),
});
export type TreacheryDeckCard = z.infer<typeof treacheryDeckCardSchema>;
export const treacheryDeckSchema = z.array(treacheryDeckCardSchema);

/** The captured Treachery deck's cards, one entry per distinct face with its copies; nothing when the game captured no deck. */
export function treacheryDeckCards(capture: RulesetCapture | undefined): TreacheryDeckCard[] | null {
  const contents = capture?.decks.treachery?.contents;
  if (!contents) {
    return null;
  }
  const details = new Map<string, string>();
  for (const definition of contents.definitions) {
    const data = definition.data as { name?: unknown; subName?: unknown } | null;
    if (data && typeof data.name === 'string' && typeof data.subName === 'string') {
      details.set(data.name, data.subName);
    }
  }
  const cards = new Map<string, TreacheryDeckCard>();
  for (const item of contents.pieces.flatMap((piece) => piece.items)) {
    const front = item.artwork?.front;
    if (!front) {
      continue;
    }
    const name = item.artwork?.name ?? '';
    const known = cards.get(front);
    cards.set(
      front,
      known
        ? { ...known, count: known.count + 1 }
        : { key: front, name, detail: details.get(name) ?? '', face: front, count: 1 }
    );
  }
  return [...cards.values()];
}
