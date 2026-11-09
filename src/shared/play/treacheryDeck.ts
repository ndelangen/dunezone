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

type DeckContents = NonNullable<NonNullable<RulesetCapture['decks']['treachery']>['contents']>;

type Definition = DeckContents['definitions'][number];

/* A card definition's name and the line under it, when it has both. */
function cardText(definition: Definition | undefined): { name: string; subName: string } | undefined {
  const { name, subName } = (definition?.data ?? {}) as { name?: unknown; subName?: unknown };
  return typeof name === 'string' && typeof subName === 'string' ? { name, subName } : undefined;
}

/*
 * Each captured item's own definition: the capture names an item for the member it copies (`member-<index>-<copy>`),
 * and that member names its asset, so two cards that share a name keep their own lines.
 */
function definitionOfItem(contents: DeckContents): (itemId: string) => Definition | undefined {
  const byId = new Map(contents.definitions.map((definition) => [definition.id, definition]));
  return (itemId) => {
    const index = /^member-(\d+)-/u.exec(itemId)?.[1];
    const assetId = index === undefined ? undefined : contents.members[Number(index)]?.assetId;
    return assetId === undefined ? undefined : byId.get(assetId);
  };
}

/* Every captured card that shows a face, with its own id and printed name. */
function deckFaces(contents: DeckContents): { id: string; face: string; name: string }[] {
  return contents.pieces
    .flatMap((piece) => piece.items)
    .flatMap(({ id, artwork }) => (artwork?.front ? [{ id, face: artwork.front, name: artwork.name ?? '' }] : []));
}

/** The captured Treachery deck's cards, one entry per distinct card with its copies; nothing when the game captured no deck. */
export function treacheryDeckCards(capture: RulesetCapture | undefined): TreacheryDeckCard[] | null {
  const contents = capture?.decks.treachery?.contents;
  if (!contents) {
    return null;
  }
  const definitionOf = definitionOfItem(contents);
  const cards = new Map<string, TreacheryDeckCard>();
  for (const { id, face, name } of deckFaces(contents)) {
    const definition = definitionOf(id);
    const key = definition?.id ?? face;
    const count = (cards.get(key)?.count ?? 0) + 1;
    cards.set(key, { key, name, detail: cardText(definition)?.subName ?? '', face, count });
  }
  return [...cards.values()];
}
