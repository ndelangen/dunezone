import decks from '@shared/play/fixtures/dreamrulesDecks.json';

import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';

import { newTracker, trackerReducer } from './tracker';
import type { CardDef, CardKind, TrackerAction, TrackerState } from './tracker';

const href = (path: string) => new URL(path, location.origin).href;

/* Each Dreamrules card's subtitle, as printed on its face. */
const DETAIL: Readonly<Record<string, string>> = {
  'Supplies!': 'Special - Instant',
  Shield: 'Defense - Projectile',
  Snooper: 'Defense - Poison',
  Baliset: 'Worthless',
  'Jubba Cloak': 'Worthless',
  'Kull Wahad': 'Worthless',
  Kulon: 'Worthless',
  'La La La': 'Worthless',
  'Trip to Gamont': 'Worthless',
  'Gom Jabbar': 'Weapon - Poison',
  Chaumas: 'Weapon - Poison',
  Chaumurky: 'Weapon - Poison',
  'Basilia Weapon': 'Weapon - Poison',
  'Ellaca Drug': 'Weapon - Poison',
  Stunner: 'Weapon - Projectile',
  'Slip Tip': 'Weapon - Projectile',
  'Maula Pistol': 'Weapon - Projectile',
  Crysknife: 'Weapon - Projectile',
  'Hunter Seeker': 'Weapon - Projectile',
  Lasgun: 'Weapon - Special',
  'Weirding Way': 'Weapon - Special',
  Chemistry: 'Defense - Poison - Special',
  'Cheap Hero': 'Special - Leader',
  'Cheap Heroine': 'Special - Leader',
  Karama: 'Special - Instant',
  'Truth Trance': 'Special - Instant',
  Mercenaries: 'Special - Battle',
  Hajr: 'Special - Movement',
  'Weather Control': 'Special - Instant',
  'Tleilaxu Ghola': 'Special - Instant',
  'Family Atomics': 'Special - Storm phase',
  'Orange Catholic Bible': 'Worthless - Special',
  'Break Conditioning': 'Special - Battle',
};

const kindOf = (detail: string): CardKind => detail.split(' - ')[0]!.toLowerCase() as CardKind;

/** The Dreamrules Treachery deck as dune.zone publishes it: 33 cards, 45 copies. */
export const DREAMRULES_DECK: readonly CardDef[] = decks.treachery.cards.map((card) => {
  const detail = DETAIL[card.name] ?? 'Special';
  return {
    key: card.file.replace(/\.jpg$/, ''),
    name: card.name,
    kind: kindOf(detail),
    detail,
    face: href(`/play-fixtures/dreamrules/${card.file}`),
    count: card.count,
  };
});

const token = (id: string, name: string, color: string): FactionToken => ({
  id,
  name,
  color,
  src: href(`/play-fixtures/product/${id}-token.jpg`),
});

/** The six factions of the story game in seat order; the viewer plays House Atreides. */
export const FACTIONS: readonly FactionToken[] = [
  token('house-atreides', 'House Atreides', '#4a4c08'),
  token('house-harkonnen', 'House Harkonnen', '#151315'),
  token('emperor', 'Emperor', '#be1010'),
  token('spacing-guild', 'Spacing Guild', '#dc5317'),
  token('fremen', 'Fremen', '#e4942e'),
  token('bene-gesserit', 'Bene Gesserit', '#253b82'),
];

/**
 * Turn 2 of a Dreamrules game, at the first card of the second auction.
 * Setup dealt one unknown card to everyone and two to Harkonnen;
 * Atreides knows its own Shield.
 * In turn 1 Atreides saw six cards for bid: Harkonnen bought the Crysknife (and drew its unknown bonus card), the Emperor a Snooper, Atreides the Karama, Fremen Weather Control, the Bene Gesserit Chaumas, and the Guild a Snooper it has since played and discarded.
 * Hunter Seeker is up for bid now: Atreides has seen it, and nobody owns it yet.
 */
export function midGameTracker(): TrackerState {
  /* A card comes up for bid in turn 1 and the faction named wins it. */
  const bought = (card: string, faction: string): Step[] => [
    { kind: 'bid', card, turn: 1 },
    (tracker) => ({ kind: 'win', sighting: tracker.seen[0]!.id, faction }),
  ];
  const steps: Step[] = [
    { kind: 'add', faction: 'house-atreides', card: 'shield#1' },
    { kind: 'add', faction: 'house-harkonnen', card: null },
    { kind: 'add', faction: 'house-harkonnen', card: null },
    { kind: 'add', faction: 'emperor', card: null },
    { kind: 'add', faction: 'spacing-guild', card: null },
    { kind: 'add', faction: 'fremen', card: null },
    { kind: 'add', faction: 'bene-gesserit', card: null },
    ...bought('crysknife#1', 'house-harkonnen'),
    { kind: 'add', faction: 'house-harkonnen', card: null },
    ...bought('snooper#2', 'emperor'),
    ...bought('karama#1', 'house-atreides'),
    ...bought('weather-control#1', 'fremen'),
    ...bought('chaumas#1', 'bene-gesserit'),
    ...bought('snooper#1', 'spacing-guild'),
    { kind: 'place', card: 'snooper#1', at: 'discard' },
    { kind: 'bid', card: 'hunter-seeker#1', turn: 2 },
  ];
  const state = steps.reduce(
    (tracker, step) => trackerReducer(tracker, typeof step === 'function' ? step(tracker) : step),
    newTracker(
      DREAMRULES_DECK,
      FACTIONS.map((faction) => faction.id)
    )
  );
  return { ...state, notes: { emperor: 'No projectile defense: lost a leader to a Maula Pistol in turn 1' } };
}

/* A step of the story's game: an action, or one built from the tracker so far, such as a win naming the newest auction. */
type Step = TrackerAction | ((tracker: TrackerState) => TrackerAction);
