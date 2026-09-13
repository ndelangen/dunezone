/* Public history fixtures for #1149 across three turns.
 * These are invented game events using the prototype's public artwork snapshots.
 * No private bank totals, unrevealed plans, cancellations or messages enter this data.
 */
import type { BattlePlanFaceProps } from '@ui/content/BattlePlanFace';

import { CATALOGUE_FACTIONS } from '../drafting-prototype/catalogue.fixture';
import { leadersOf } from '../drafting-prototype/leaders.fixture';
import { PROFILES } from '../drafting-prototype/profiles.fixture';

export const HISTORY_VARIANTS = ['A', 'B', 'C'] as const;
export type HistoryVariant = (typeof HISTORY_VARIANTS)[number];
export const HISTORY_NAMES = { A: 'Journal', B: 'Index and detail', C: 'Beside the table' };
export const HISTORY_KINDS = ['all', 'seat', 'spice', 'phase', 'battle', 'vote', 'prediction'] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];
export const HISTORY_SCENARIOS = ['latest', 'filtered', 'older', 'battle', 'empty'] as const;
export type HistoryScenario = (typeof HISTORY_SCENARIOS)[number];
export const KIND_NAMES = {
  all: 'All events',
  seat: 'Seats',
  spice: 'Spice',
  phase: 'Phases',
  battle: 'Battles',
  vote: 'Votes',
  prediction: 'Predictions',
};
export const historyFaction = (slug: string) => CATALOGUE_FACTIONS.find((faction) => faction.slug === slug)!;
export const historyProfile = (slug: string) => PROFILES.find((profile) => profile.slug === slug)!;
export type RevealedPlan = {
  faction: string;
  face: BattlePlanFaceProps;
  cards: ('maulaPistol' | 'shield' | 'chaumas')[];
};
export type HistoryEntry = {
  id: string;
  kind: Exclude<HistoryKind, 'all'>;
  turn: number;
  phase: string;
  at: string;
  title: string;
  detail: string;
  actor?: string;
  factions?: string[];
  battle?: { plans: [RevealedPlan, RevealedPlan]; result: string | null; anchor: [number, number, number] };
};
function revealedPlan(slug: string, troops: number, spice: number, cards: RevealedPlan['cards']): RevealedPlan {
  const faction = historyFaction(slug);
  const leader = leadersOf(slug)[0];
  return {
    faction: slug,
    cards,
    face: {
      name: faction.name,
      background: faction.background,
      troopImage: slug === 'fremen' ? '/vector/troop/fremen.svg' : '/vector/troop/atreides.svg',
      leader: { ...leader, logo: faction.logo, background: faction.background },
      troops,
      spice,
      strength: (troops - spice) * 0.5 + spice,
    },
  };
}
const plans: [RevealedPlan, RevealedPlan] = [
  revealedPlan('fremen', 6, 4, ['maulaPistol', 'shield']),
  revealedPlan('house-atreides', 5, 3, ['chaumas', 'shield']),
];
export const HISTORY_ENTRIES: readonly HistoryEntry[] = [
  {
    id: 'e18',
    kind: 'phase',
    turn: 3,
    phase: 'Spice collection',
    at: '2026-09-13T14:32:00Z',
    title: 'Spice collection began',
    detail: 'The table advanced from Battle to Spice collection.',
    actor: 'thialfi',
  },
  {
    id: 'e17',
    kind: 'battle',
    turn: 3,
    phase: 'Battle',
    at: '2026-09-13T14:26:00Z',
    title: 'Fremen defeated House Atreides',
    detail: 'Both combatants agreed: Fremen won.',
    factions: ['fremen', 'house-atreides'],
    battle: { plans, result: 'Fremen won', anchor: [-1.2, 0.03, 0.7] },
  },
  {
    id: 'e16',
    kind: 'spice',
    turn: 3,
    phase: 'Battle',
    at: '2026-09-13T14:12:00Z',
    title: '4 spice moved onto the table',
    detail: 'Fremen bank → stack on the table. Withdrawal: 4 spice.',
    actor: 'thialfi',
    factions: ['fremen'],
  },
  {
    id: 'e15',
    kind: 'seat',
    turn: 3,
    phase: 'Shipment and movement',
    at: '2026-09-13T13:58:00Z',
    title: 'Twaffle took seat 2',
    detail: 'Vacant seat → Twaffle. Approved by Thialfi. Assignment round 1; House Atreides stays in seat 2.',
    actor: 'twaffle',
    factions: ['house-atreides'],
  },
  {
    id: 'e14',
    kind: 'prediction',
    turn: 3,
    phase: 'Shipment and movement',
    at: '2026-09-13T13:46:00Z',
    title: 'A prediction was revealed',
    detail: 'Bene Gesserit predicted Fremen to win on turn 3.',
    factions: ['fremen'],
  },
  {
    id: 'e13',
    kind: 'phase',
    turn: 3,
    phase: 'Storm',
    at: '2026-09-13T13:10:00Z',
    title: 'Turn 3 began',
    detail: 'The table advanced to Storm.',
    actor: 'thialfi',
  },
  {
    id: 'e12',
    kind: 'spice',
    turn: 2,
    phase: 'Mentat pause',
    at: '2026-09-12T20:41:00Z',
    title: '3 pending spice settled',
    detail: 'House Atreides pending bribe → House Atreides bank. Settlement: 3 spice.',
    actor: 'twaffle',
    factions: ['house-atreides'],
  },
  {
    id: 'e11',
    kind: 'vote',
    turn: 2,
    phase: 'Mentat pause',
    at: '2026-09-12T20:38:00Z',
    title: 'Seat 4 removal vote ended',
    detail: 'Removal declined. Final ballots: 2 remove, 3 retain, 1 abstain. Seat 4 stayed occupied.',
  },
  {
    id: 'e10',
    kind: 'battle',
    turn: 2,
    phase: 'Battle',
    at: '2026-09-12T20:16:00Z',
    title: 'Fremen and House Atreides agreed on no winner',
    detail: 'Both combatants agreed: no winner.',
    factions: ['fremen', 'house-atreides'],
    battle: {
      plans: [revealedPlan('fremen', 4, 2, ['shield']), revealedPlan('house-atreides', 3, 1, ['chaumas'])],
      result: 'No winner',
      anchor: [0.9, 0.03, -0.6],
    },
  },
  {
    id: 'e9',
    kind: 'spice',
    turn: 2,
    phase: 'Shipment and movement',
    at: '2026-09-12T19:52:00Z',
    title: '3 spice collected as a bribe',
    detail: 'Fremen stack on the table → House Atreides pending bribe. Collection: 3 spice.',
    actor: 'twaffle',
    factions: ['fremen', 'house-atreides'],
  },
  {
    id: 'e8',
    kind: 'seat',
    turn: 2,
    phase: 'Bidding',
    at: '2026-09-12T19:21:00Z',
    title: '[deleted user] left seat 2',
    detail: 'Account deletion. Occupied seat → vacant seat. Assignment round 1; House Atreides stayed in seat 2.',
    factions: ['house-atreides'],
  },
  {
    id: 'e7',
    kind: 'phase',
    turn: 2,
    phase: 'Storm',
    at: '2026-09-12T18:40:00Z',
    title: 'Turn 2 began',
    detail: 'The table advanced to Storm.',
    actor: 'thialfi',
  },
  {
    id: 'e6',
    kind: 'spice',
    turn: 1,
    phase: 'Spice collection',
    at: '2026-09-11T21:08:00Z',
    title: '6 spice collected from the table',
    detail: 'Stack on the table → Fremen bank. Collection: 6 spice.',
    actor: 'thialfi',
    factions: ['fremen'],
  },
  {
    id: 'e5',
    kind: 'phase',
    turn: 1,
    phase: 'Battle',
    at: '2026-09-11T20:45:00Z',
    title: 'Battle began',
    detail: 'The table advanced to Battle.',
    actor: 'twaffle',
  },
  {
    id: 'e4',
    kind: 'vote',
    turn: 1,
    phase: 'Revival',
    at: '2026-09-11T20:18:00Z',
    title: 'Seat 5 removal vote ended',
    detail: 'Removal declined. Final ballots: 1 remove, 4 retain, 1 abstain. Seat 5 stayed occupied.',
  },
  {
    id: 'e3',
    kind: 'spice',
    turn: 1,
    phase: 'Bidding',
    at: '2026-09-11T20:04:00Z',
    title: '2 spice moved onto the table',
    detail: 'House Atreides bank → stack on the table. Withdrawal: 2 spice.',
    actor: 'twaffle',
    factions: ['house-atreides'],
  },
  {
    id: 'e2',
    kind: 'seat',
    turn: 1,
    phase: 'Storm',
    at: '2026-09-11T19:32:00Z',
    title: 'Thialfi took seat 1',
    detail: 'Vacant seat → Thialfi. Approved by Twaffle. Assignment round 1; Fremen assigned to seat 1.',
    actor: 'thialfi',
    factions: ['fremen'],
  },
  {
    id: 'e1',
    kind: 'phase',
    turn: 1,
    phase: 'Storm',
    at: '2026-09-11T19:30:00Z',
    title: 'Turn 1 began',
    detail: 'The table advanced to Storm.',
    actor: 'thialfi',
  },
];
