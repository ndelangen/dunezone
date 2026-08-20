/**
 * The Asset type registry — the one place the flat Asset type discriminators live.
 * The type is the unit of everything: URLs, slug uniqueness, and editors are all per type (see CONTEXT.md: Asset type, Asset category);
 * category is derived presentation-only grouping, so this registry is the client's contract for grouping, labels, and which types are live versus planned placeholders.
 */

const ASSET_CATEGORIES = ['cards', 'decks', 'tokens', 'boards'] as const;

type AssetCategory = (typeof ASSET_CATEGORIES)[number];

type AssetTypeStatus = 'live' | 'planned';

type AssetTypeDefinition = {
  category: AssetCategory;
  /** the full plural name — footnotes, aria labels */
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
  'token-round': { category: 'tokens', label: 'Round tokens', shortLabel: 'Round', status: 'live' },
  'token-gear': { category: 'tokens', label: 'Gear tokens', shortLabel: 'Gear', status: 'live' },
  'token-square': { category: 'tokens', label: 'Square tokens', shortLabel: 'Square', status: 'live' },
  'token-rectangle': { category: 'tokens', label: 'Rectangle tokens', shortLabel: 'Rectangle', status: 'live' },
  board: { category: 'boards', label: 'Boards', shortLabel: 'Boards', status: 'planned' },
} as const satisfies Record<string, AssetTypeDefinition>;

export type AssetType = keyof typeof ASSET_TYPES;

/** The Asset type is the URL vocabulary: `/assets/{type}/…` uses these discriminators verbatim. */
export function isAssetType(value: string): value is AssetType {
  return value in ASSET_TYPES;
}
