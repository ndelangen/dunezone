/**
 * A ruleset's asset slots: the named positions it fills with decks and token bundles.
 *
 * Slots are **curatorial labels**, per «Ruleset deck-slot residual semantics».
 * A deck slot demands a deck and nothing finer, since a deck is not subtyped, and an empty slot is a legal state rather than a missing one.
 *
 * `holds` is the Asset type a slot accepts.
 * Which kind that is stays a rule of the link mutation rather than a column on the row: a `kind` column would be a second source of truth able to disagree with `slot`, which is why «Ruleset slot table generalises to assets» refused one.
 *
 * The literal union on `ruleset_asset_slots` in `convex/schema.ts` must list exactly these five.
 * A drift test asserts it, since the schema cannot import this and stay a schema.
 */
export const RULESET_ASSET_SLOTS = {
  treachery: { holds: 'deck', single: true, label: 'Treachery deck', noun: 'a deck' },
  spice: { holds: 'deck', single: true, label: 'Spice deck', noun: 'a deck' },
  custom: { holds: 'deck', single: false, label: 'Custom decks', noun: 'decks' },
  techToken: { holds: 'bundle', single: true, label: 'Tech token bundle', noun: 'a token bundle' },
  customTokens: { holds: 'bundle', single: false, label: 'Custom token bundles', noun: 'token bundles' },
} as const satisfies Record<string, { holds: string; single: boolean; label: string; noun: string }>;

export type RulesetAssetSlot = keyof typeof RULESET_ASSET_SLOTS;

/** Presentation order. Single-asset slots first, since they are the ones a ruleset is expected to fill. */
export const RULESET_ASSET_SLOT_ORDER = [
  'treachery',
  'spice',
  'techToken',
  'custom',
  'customTokens',
] as const satisfies readonly RulesetAssetSlot[];
