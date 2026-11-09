import { toLiveQueryResult, useLiveQuery } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import { readAssetSupply } from './play';

/** The spice decks the spice deck tool offers: one per live ruleset that slots one, by ruleset name. */
export function useSpiceDeckChoices() {
  return toLiveQueryResult(useLiveQuery(api.spiceDeckTool.decks, {}));
}

/** A spice deck's cards and faces, as a game captures them. */
export async function readSpiceDeck(deck: { type: string; slug: string }) {
  return await readAssetSupply({ type: deck.type, slug: deck.slug });
}
