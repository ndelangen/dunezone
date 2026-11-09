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

/* A Shai-Hulud, or a card the rules resolve as one, such as Great Maker, names a worm on its face or its subtitle. */
const WORM = /shai[\s-]?hulud|sandworm|great maker/i;

const subNameOf = (data: unknown) => {
  const subName = data && typeof data === 'object' ? (data as { subName?: unknown }).subName : undefined;
  return typeof subName === 'string' ? subName : '';
};

function namesWorm(name: string, data: unknown): boolean {
  return WORM.test(name) || WORM.test(subNameOf(data));
}

/* A Discovery blow places spice too, but first destroys what is in its territory and places a Discovery token: the players follow the card. */
const DISCOVERY = /discovery/i;

const namesDiscovery = (data: unknown) => DISCOVERY.test(subNameOf(data));

/* A card the players follow rather than read as plain spice or a worm: one that blows no spice and names no worm, or a Discovery blow. */
const isSpecial = (amount: number | undefined, name: string, data: unknown) =>
  namesDiscovery(data) || (amount === undefined && !namesWorm(name, data));

function assertPlayable(choice: SpiceDeckChoice, supply: AssetSupply) {
  /* A deck read in part would leave cards out and get the odds wrong, so it is not played at all. */
  if (supply.membersTruncated) {
    throw new Error(`The ${choice.name} has more cards than the catalogue sends at once.`);
  }
  /* A card with no face could not be shown on its pile or in a peek, so a deck missing one is not played. */
  if (supply.members.some((member) => !member.front)) {
    throw new Error(`The ${choice.name} has a card whose face is not published yet.`);
  }
}

/**
 * The deck as the tool plays it, from the catalogue's answer a game reads when it captures the deck.
 * A card that blows no spice is Shai-Hulud when it names a worm;
 * any other, such as Sandtrout, is a special card the players follow, and so is a Discovery blow, spice or not.
 * Throws for a deck the catalogue sent only in part.
 */
export function spiceDeckFromSupply(choice: SpiceDeckChoice, supply: AssetSupply): SpiceDeckDef {
  assertPlayable(choice, supply);
  const cards: SpiceCardDef[] = supply.members.map(({ asset, front, count }) => {
    const amount = amountOf(asset.type, asset.data);
    return {
      /* Slugs are unique per asset type, and a deck may hold cards of several types, so the catalogue id names the card. */
      key: asset.id,
      name: asset.name,
      count,
      ...(front ? { face: front } : {}),
      ...(amount === undefined ? {} : { amount }),
      ...(isSpecial(amount, asset.name, asset.data) ? { special: true } : {}),
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
