/**
 * PROTOTYPE seed data for wayfinder ticket #512.
 * THROWAWAY.
 *
 * One real treachery card exists, and both the questions under evaluation — how dense the browse page should be, and what a detail page owes a reader — need a catalogue to answer.
 * Shared by the browse route and the detail route so a tile and the page it leads to describe the same card.
 *
 * Deck membership is seeded here too, and is likewise fiction: `asset_relations` (convex/schema.ts:103) is schema-only, and its `by_to_kind` index — bought for exactly the card-to-decks lookup — has nothing reading or writing it.
 */
import type { AssetListEntry } from '@app/db/assets';
import { backgroundPresets } from '@game/data/backgrounds';

const MOCK_NAMES = [
  ['Lasgun', 'Weapon - Projectile', 'weapon'],
  ['Shield', 'Defense - Projectile', 'defense'],
  ['Crysknife', 'Weapon - Projectile', 'weapon'],
  ['Maula Pistol', 'Weapon - Projectile', 'weapon'],
  ['Slip Tip', 'Weapon - Poison', 'weapon'],
  ['Stunner', 'Weapon - Poison', 'weapon'],
  ['Chaumas', 'Weapon - Poison', 'weapon'],
  ['Snooper', 'Defense - Poison', 'defense'],
  ['Chaumurky', 'Weapon - Poison', 'weapon'],
  ['Gom Jabbar', 'Weapon - Poison', 'weapon'],
  ['Shield Snooper', 'Defense - Both', 'defense'],
  ['Karama', 'Special', 'special'],
  ['Truthtrance', 'Special', 'special'],
  ['Family Atomics', 'Special', 'special'],
  ['Weather Control', 'Special', 'special'],
  ['Baliset', 'Worthless', 'worthless'],
  ['Kulon', 'Worthless', 'worthless'],
  ['Trip to Gamont', 'Worthless', 'worthless'],
] as const;

const MOCK_OWNERS = ['stilgar', 'gurney', 'irulan', 'Central'];

const HEADS: Record<string, { head: object; striped: object }> = {
  weapon: { head: backgroundPresets.weapon, striped: backgroundPresets.stripedWeapon },
  defense: { head: backgroundPresets.defense, striped: backgroundPresets.stripedDefense },
  special: { head: backgroundPresets.special, striped: backgroundPresets.stripedSpecial },
  worthless: { head: backgroundPresets.worthless, striped: backgroundPresets.stripedWorthless },
};

const ICONS = ['/vector/icon/projectile.svg', '/vector/icon/poison.svg', '/vector/icon/karama.svg'];

const RULES_TEXT: Record<string, string> = {
  weapon:
    'Play as part of your Battle Plan.\nKills opponent’s leader before battle is resolved.\n\nYou may keep this card if you win this battle.',
  defense:
    'Play as part of your Battle Plan.\nProtects your leader from this kind of attack.\n\nYou may keep this card if you win this battle.',
  special: 'Play as instructed on the card.\nThis card has no effect in battle.',
  worthless:
    'Play as part of your Battle Plan.\nThis card has no effect in battle, but may be played as though it were a weapon or defense.',
};

export const mockEntries = (): AssetListEntry[] =>
  MOCK_NAMES.map(([name, subName, kind], i) => {
    const preset = HEADS[kind] ?? HEADS.weapon!;
    return {
      id: `mock-${i}` as AssetListEntry['id'],
      type: 'card-treachery',
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      created_at: `2026-08-${String(2 + (i % 17)).padStart(2, '0')}T10:00:00.000Z`,
      updated_at: `2026-08-${String(2 + (i % 17)).padStart(2, '0')}T10:00:00.000Z`,
      owner: {
        id: `owner-${i % MOCK_OWNERS.length}` as never,
        slug: MOCK_OWNERS[i % MOCK_OWNERS.length] as string,
        username: MOCK_OWNERS[i % MOCK_OWNERS.length] as string,
        avatar_url: null,
      },
      data: {
        name,
        subName,
        head: preset.head,
        icon: [preset.striped, ICONS[i % ICONS.length]],
        decals: [],
        text: RULES_TEXT[kind] ?? RULES_TEXT.weapon,
      },
    } as AssetListEntry;
  });

/* ------------------------------ deck membership ------------------------------ */

export type DeckRef = { id: string; slug: string; name: string };

const MOCK_DECKS: Record<string, string> = {
  'base-treachery': 'Base Treachery',
  'ixian-tleilaxu': 'Ixian & Tleilaxu',
  'choam-richese': 'CHOAM & Richese',
  'tourney-standard': 'Tourney Standard 2026',
  'duel-draft': 'Duel Draft',
  'spice-harvest-mix': 'Spice Harvest Mix',
  'stilgars-house-mix': "Stilgar's House Mix",
};

/** Card slug to deck slugs. Lopsided on purpose: four cards in nothing, most in one or two, Karama in six to stress every layout. */
const MOCK_MEMBERSHIP: Record<string, string[]> = {
  lasgun: ['base-treachery', 'tourney-standard'],
  shield: ['base-treachery', 'tourney-standard', 'duel-draft'],
  crysknife: ['base-treachery'],
  'maula-pistol': ['base-treachery'],
  'slip-tip': [],
  stunner: ['base-treachery', 'duel-draft'],
  chaumas: ['base-treachery'],
  snooper: ['base-treachery', 'tourney-standard'],
  chaumurky: ['base-treachery'],
  'gom-jabbar': [],
  'shield-snooper': ['ixian-tleilaxu'],
  karama: ['base-treachery', 'tourney-standard', 'duel-draft', 'ixian-tleilaxu', 'choam-richese', 'spice-harvest-mix'],
  truthtrance: ['base-treachery', 'tourney-standard'],
  'family-atomics': ['base-treachery'],
  'weather-control': ['base-treachery', 'choam-richese'],
  baliset: [],
  kulon: ['stilgars-house-mix'],
  'trip-to-gamont': [],
};

export const decksOf = (entry: Pick<AssetListEntry, 'slug'>): DeckRef[] =>
  (MOCK_MEMBERSHIP[entry.slug] ?? []).map((slug) => ({
    id: `deck-${slug}`,
    slug,
    name: MOCK_DECKS[slug] ?? slug,
  }));

/** The browse-tile treatment: a count, or nothing at all — a grid of tiles each announcing zero is noise. */
export const deckCountLabel = (decks: DeckRef[]) =>
  decks.length === 0 ? null : `${decks.length} ${decks.length === 1 ? 'deck' : 'decks'}`;

/** The ledger treatment: names, because the row is full-width and can afford them. */
export const deckLabel = (decks: DeckRef[]) => {
  switch (true) {
    case decks.length === 0:
      return null;
    case decks.length <= 2:
      return decks.map((deck) => deck.name).join(', ');
    default:
      return `${decks[0]!.name}, ${decks[1]!.name} +${decks.length - 2}`;
  }
};
