import { STORYBOOK_NOW } from '@db/storybook';
import productFactions from '@app/routes/_app/play/product.stories.fixture/factions.json';

import { PREDICTION_LOCKET_STORAGE_KEY } from './usePredictionLocket';
import type { LocketFaction, LocketState } from './usePredictionLocket';

/* The prediction locket's story data: GF9's base six as Play's product fixture captures them from production. */

/** A base game faction by its slug on Dune Zone, as the locket keeps it. */
export function storyFaction(slug: string): LocketFaction {
  const row = productFactions.find((known) => known.slug === slug)!;
  return { id: row._id, name: row.data.name, emblem: row.data.emblem, background: row.data.background };
}

/** Opens the page on this locket: the page reads it from this browser's storage, as a reload at the table would. */
export function seedStoredLocket(state: LocketState) {
  window.localStorage.setItem(PREDICTION_LOCKET_STORAGE_KEY, JSON.stringify({ ...state, version: 1 }));
}

/** Opens the page with nothing kept: a first visit. */
export function clearStoredLocket() {
  window.localStorage.removeItem(PREDICTION_LOCKET_STORAGE_KEY);
}

/** A prediction locked two hours before the story's clock reads now. */
export function storyLocked(slug: string, turn: number, revealed: boolean): LocketState {
  return {
    faction: null,
    turn: null,
    locked: { faction: storyFaction(slug), turn, lockedAt: STORYBOOK_NOW - 2 * 3_600_000, revealed },
  };
}
