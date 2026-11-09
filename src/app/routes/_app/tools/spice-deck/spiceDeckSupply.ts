import type { AssetSupply } from '@shared/play/capture';
import { spiceBlowOf } from '@shared/play/spiceBlow';

import type { SpiceCardDef, SpiceDeckDef } from './spiceDeck';

/** A ruleset's spice deck as the picker lists it, before its cards are read. */
export type SpiceDeckChoice = Readonly<{ id: string; name: string; ruleset: string }>;

/* The spice a card blows: the amount the game reads off it, or the one stored on it when its territory is not drawn yet. */
function amountOf(type: string, data: unknown): number | undefined {
  const blow = spiceBlowOf(type, data);
  if (blow) {
    return blow.amount;
  }
  const stored =
    type === 'card-spice' && data && typeof data === 'object' ? (data as { amount?: unknown }).amount : undefined;
  return typeof stored === 'number' && stored > 0 ? stored : undefined;
}

/**
 * The deck as the tool plays it, from the catalogue's answer a game reads when it captures the deck.
 * A card that blows no spice, such as Shai-Hulud, is a worm to the tool.
 */
export function spiceDeckFromSupply(choice: SpiceDeckChoice, supply: AssetSupply): SpiceDeckDef {
  const cards: SpiceCardDef[] = supply.members.map(({ asset, front, count }) => {
    const amount = amountOf(asset.type, asset.data);
    return {
      key: asset.slug,
      name: asset.name,
      count,
      ...(front ? { face: front } : {}),
      ...(amount === undefined ? {} : { amount }),
    };
  });
  return {
    id: choice.id,
    name: choice.name,
    ruleset: choice.ruleset,
    ...(supply.back ? { back: supply.back } : {}),
    cards,
  };
}
