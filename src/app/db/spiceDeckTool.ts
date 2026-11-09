import { toLiveQueryResult, useLiveQuery } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import { readAssetSupply } from './play';

/**
 * The spice decks the spice deck tool offers: one per live ruleset that slots one, by ruleset name.
 * Not held warm: only the deck picker reads it, and a table in play should hold no catalogue subscription once the picker closes.
 */
export function useSpiceDeckChoices() {
  return toLiveQueryResult(useLiveQuery(api.spiceDeckTool.decks, {}, { hold: false }));
}

/** A spice deck's cards and faces, as a game captures them. */
export async function readSpiceDeck(deck: { type: string; slug: string }) {
  return await readAssetSupply({ type: deck.type, slug: deck.slug });
}
