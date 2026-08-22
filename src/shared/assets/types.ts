/**
 * The Asset type registry, the one place the flat Asset type discriminators live.
 * The type is the unit of everything: URLs, slug uniqueness, and editors are all per type (see CONTEXT.md: Asset type, Asset category);
 * category is derived presentation-only grouping, so this registry is the client's contract for grouping, labels, and which types are live versus planned placeholders.
 */

const ASSET_CATEGORIES = ['cards', 'decks', 'tokens', 'boards'] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

type AssetTypeStatus = 'live' | 'planned';

type AssetTypeDefinition = {
  category: AssetCategory;
  /** the full plural name, footnotes, aria labels */
  label: string;
  /** what a pile wears inside an already-labelled group row */
  shortLabel: string;
  status: AssetTypeStatus;
};

export const ASSET_TYPES = {
  'card-treachery': { category: 'cards', label: 'Treachery cards', shortLabel: 'Treachery', status: 'live' },
  'card-spice': { category: 'cards', label: 'Spice cards', shortLabel: 'Spice', status: 'planned' },
  'card-custom': { category: 'cards', label: 'Custom cards', shortLabel: 'Custom', status: 'planned' },
  'card-leaderability': {
    category: 'cards',
    label: 'Leader ability cards',
    shortLabel: 'Leader ability',
    status: 'planned',
  },
  'card-storm': { category: 'cards', label: 'Storm cards', shortLabel: 'Storm', status: 'planned' },
  'card-stronghold': { category: 'cards', label: 'Stronghold cards', shortLabel: 'Stronghold', status: 'planned' },
  'card-nexus': { category: 'cards', label: 'Nexus cards', shortLabel: 'Nexus', status: 'planned' },
  deck: { category: 'decks', label: 'Decks', shortLabel: 'Decks', status: 'live' },
  'token-disc': { category: 'tokens', label: 'Disc tokens', shortLabel: 'Disc', status: 'live' },
  'token-tech': { category: 'tokens', label: 'Tech tokens', shortLabel: 'Tech', status: 'live' },
  'token-plate': { category: 'tokens', label: 'Plate tokens', shortLabel: 'Plate', status: 'live' },
  'token-enhance': { category: 'tokens', label: 'Enhance tokens', shortLabel: 'Enhance', status: 'live' },
  /* A container of tokens, so it groups with them rather than earning a fifth category (see CONTEXT.md: Asset category). */
  bundle: { category: 'tokens', label: 'Bundles', shortLabel: 'Bundles', status: 'live' },
  board: { category: 'boards', label: 'Boards', shortLabel: 'Boards', status: 'planned' },
} as const satisfies Record<string, AssetTypeDefinition>;

export type AssetType = keyof typeof ASSET_TYPES;

/**
 * Every Asset type, in the registry's own declaration order.
 * That order is curated rather than incidental, so a surface arranging types by category reads them from here instead of restating a list this registry already holds.
 */
export const ASSET_TYPE_KEYS = Object.keys(ASSET_TYPES) as AssetType[];

/**
 * Whether a deck can hold this type, which is the same question as whether "in decks" is a fact about it at all.
 * A deck holds cards and nothing else, enforced by `setMemberCount`'s `CONTAINER_KINDS`.
 * Shared because three layers ask it: the browse read skips its relation pass, the deck editor's picker offers only these, and a detail page shows its "In decks" card only for them.
 */
export function holdsDeckMembership(type: string): boolean {
  return isAssetType(type) && ASSET_TYPES[type].category === 'cards';
}

/** The Asset type is the URL vocabulary: `/assets/{type}/…` uses these discriminators verbatim. */
export function isAssetType(value: string): value is AssetType {
  return Object.hasOwn(ASSET_TYPES, value);
}
