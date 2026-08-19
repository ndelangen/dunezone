/**
 * The Asset type registry — the one place the flat Asset type discriminators live.
 * Category is always derived from the type (see CONTEXT.md: Asset type, Asset category);
 * the server stays category-agnostic and queries by type, so this registry is the client's contract for grouping, labels, and which types are live versus planned placeholders.
 */

export const ASSET_CATEGORIES = ['cards', 'decks', 'tokens', 'boards'] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export type AssetTypeStatus = 'live' | 'planned';

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
  'token-rectangle': { category: 'tokens', label: 'Rectangle tokens', shortLabel: 'Rectangle', status: 'planned' },
  board: { category: 'boards', label: 'Boards', shortLabel: 'Boards', status: 'planned' },
} as const satisfies Record<string, AssetTypeDefinition>;

export type AssetType = keyof typeof ASSET_TYPES;

export function isAssetCategory(value: string): value is AssetCategory {
  return (ASSET_CATEGORIES as readonly string[]).includes(value);
}

export function categoryOfType(type: string): AssetCategory | null {
  const definition = (ASSET_TYPES as Record<string, AssetTypeDefinition>)[type];
  return definition?.category ?? null;
}

export function typesInCategory(category: AssetCategory): AssetType[] {
  return (Object.keys(ASSET_TYPES) as AssetType[]).filter((type) => ASSET_TYPES[type].category === category);
}

export function liveTypesInCategory(category: AssetCategory): AssetType[] {
  return typesInCategory(category).filter((type) => ASSET_TYPES[type].status === 'live');
}
