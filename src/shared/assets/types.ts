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
  /** plural, as the landing's pile labels read */
  label: string;
  status: AssetTypeStatus;
};

export const ASSET_TYPES = {
  'card-treachery': { category: 'cards', label: 'Treachery cards', status: 'live' },
  'card-spice': { category: 'cards', label: 'Spice cards', status: 'planned' },
  'card-custom': { category: 'cards', label: 'Custom cards', status: 'planned' },
  'card-leaderability': { category: 'cards', label: 'Leader ability cards', status: 'planned' },
  'card-storm': { category: 'cards', label: 'Storm cards', status: 'planned' },
  deck: { category: 'decks', label: 'Decks', status: 'live' },
  'token-round': { category: 'tokens', label: 'Round tokens', status: 'live' },
  'token-gear': { category: 'tokens', label: 'Gear tokens', status: 'live' },
  'token-square': { category: 'tokens', label: 'Square tokens', status: 'live' },
  'token-rectangle': { category: 'tokens', label: 'Rectangle tokens', status: 'planned' },
  board: { category: 'boards', label: 'Boards', status: 'planned' },
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
