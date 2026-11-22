import productFactions from '@app/routes/_app/play/product.stories.fixture/factions.json';

import type { WheelFaction, WheelRuleset } from './battleWheel';
import { BATTLE_WHEEL_STORAGE_KEY } from './useBattleWheel';
import type { WheelState } from './useBattleWheel';
import { wheelFactionFrom } from './wheelFaction';

/*
 * The battle wheel's story and test data: GF9's base six as Play's product fixture captures them from production,
 * read the way the tool reads a faction.
 */
const BASE_SIX = productFactions.map((row) => ({
  slug: row.slug,
  faction: wheelFactionFrom({
    faction: { id: row._id, slug: row.slug, name: row.data.name },
    data: row.data,
    token: null,
    cardbacks: { traitor: null, alliance: null },
    leaders: [],
  })!,
}));

/** A base game faction by its slug on Dune Zone. */
export const storyFaction = (slug: string): WheelFaction => BASE_SIX.find((known) => known.slug === slug)!.faction;

/* The four ways a Ruleset dials, for the engine's tests. */
export const STORY_RULESETS: readonly WheelRuleset[] = [
  { id: 'gf9', name: 'GF9', dialing: 'advanced' },
  { id: 'gf9-basic', name: 'GF9 basic game', dialing: 'basic' },
  { id: 'kiss', name: 'KISS', dialing: 'kiss' },
  { id: 'gf9-2-0', name: 'GF9 2.0', dialing: 'gf92' },
];

/*
 * A wheel already set up: the faction's first leader, unless none, and troops dialed per face in the faction's own order.
 * Its Ruleset is the page's default, as on a first visit.
 */
export function storyWheel(
  slug: string,
  { troops, spice = 0, leader = true }: Readonly<{ troops: readonly number[]; spice?: number; leader?: boolean }>
): WheelState {
  const faction = storyFaction(slug);
  return {
    rulesetId: null,
    faction,
    plan: {
      leaderId: leader ? faction.leaders[0]!.id : null,
      leaderX: 0,
      troops: Object.fromEntries(troops.map((count, index) => [faction.faces[index]!.id, count])),
      spice,
    },
  };
}

/** Opens the page on this wheel: the page reads it from this browser's storage, as a reload at the table would. */
export function seedStoredWheel(state: WheelState) {
  window.localStorage.setItem(BATTLE_WHEEL_STORAGE_KEY, JSON.stringify({ ...state, version: 1 }));
}

/** Opens the page with nothing kept: a first visit. */
export function clearStoredWheel() {
  window.localStorage.removeItem(BATTLE_WHEEL_STORAGE_KEY);
}
