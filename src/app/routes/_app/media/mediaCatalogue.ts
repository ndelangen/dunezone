import {
  BACKGROUND,
  DECAL,
  GENERIC,
  ICON,
  LEADERS,
  LOGO,
  PLANET,
  TEXTURE,
  TROOP,
  TROOP_MODIFIER,
} from '@shared/assetIds';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';

import metadata from './media-index.json';
import { mediaSubjects } from './mediaSubjects';

const indexedMediaKinds = [
  { value: 'decal', slug: 'decals', label: 'Decals' },
  { value: 'generic', slug: 'symbols', label: 'General symbols' },
  { value: 'logo', slug: 'emblems', label: 'Emblems' },
  { value: 'icon', slug: 'icons', label: 'Game icons' },
  { value: 'troop', slug: 'troops', label: 'Troops' },
  { value: 'troop_modifier', slug: 'troop-modifiers', label: 'Troop modifiers' },
  { value: 'background', slug: 'patterns', label: 'Patterns' },
  { value: 'leader', slug: 'leaders', label: 'Leader portraits' },
  { value: 'planet', slug: 'planets', label: 'Planets' },
  { value: 'texture', slug: 'textures', label: 'Textures' },
  { value: 'cover', slug: 'covers', label: 'Rulebook covers' },
  { value: 'card', slug: 'cards', label: 'Card layers' },
  { value: 'shield', slug: 'shields', label: 'Shield layers' },
  { value: 'web', slug: 'website', label: 'Website artwork' },
] as const;

type MediaKind = (typeof indexedMediaKinds)[number]['value'];

export const mediaKinds = indexedMediaKinds.filter(
  ({ value }) => !['troop_modifier', 'background', 'texture', 'card', 'shield', 'web'].includes(value)
);

export interface MediaEntry {
  value: string;
  label: string;
  collection: string;
  description: string;
  tags: readonly string[];
  subjects: readonly string[];
  glyphPreview: boolean;
  kind: MediaKind;
}

const indexedPaths = (prefix: string) => Object.keys(metadata).filter((path) => path.startsWith(prefix));

const assetsByKind: Record<MediaKind, readonly string[]> = {
  decal: DECAL.options,
  generic: GENERIC.options,
  logo: LOGO.options,
  icon: ICON.options,
  troop: TROOP.options,
  troop_modifier: TROOP_MODIFIER.options,
  background: [...BACKGROUND.options, ...indexedPaths('/image/background/')],
  cover: indexedPaths('/image/rulebook-cover/'),
  card: indexedPaths('/image/card/'),
  shield: indexedPaths('/image/shield/'),
  web: indexedPaths('/web/'),
  leader: LEADERS.options,
  planet: PLANET.options,
  texture: TEXTURE.options,
};

export const mediaEntries: MediaEntry[] = indexedMediaKinds.flatMap(({ value: kind }) =>
  stockAssetOptions(assetsByKind[kind]).map(({ keywords: _collectionKeywords, ...entry }) => ({
    ...entry,
    kind,
    ...(['cover', 'card', 'shield', 'web'].includes(kind)
      ? { collection: indexedMediaKinds.find((item) => item.value === kind)!.label }
      : {}),
    ...metadata[entry.value as keyof typeof metadata],
  }))
);

export const catalogueEntries = mediaEntries.filter((entry) => mediaKinds.some((kind) => kind.value === entry.kind));

const entriesByValue = new Map(mediaEntries.map((entry) => [entry.value, entry]));

export interface MediaSearch {
  source: 'media' | 'topics' | 'lucide';
  kind: MediaKind | 'all';
  group: string;
  q: string;
  item?: string;
  subject?: string;
  browse?: 'collection';
}

function searchRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
}

function searchText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function validateMediaSearch(input: unknown): MediaSearch {
  const search = searchRecord(input);
  const source = search.source === 'topics' || search.source === 'lucide' ? search.source : 'media';
  const kind = mediaKinds.find(({ value }) => value === search.kind)?.value ?? 'all';
  const item = typeof search.item === 'string' && entriesByValue.has(search.item) ? search.item : undefined;
  return {
    source,
    kind,
    group: searchText(search.group).trim().slice(0, 200),
    q: searchText(search.q).slice(0, 300),
    ...(mediaSubjects.some(({ value }) => value === search.subject) ? { subject: String(search.subject) } : {}),
    ...(search.browse === 'collection' ? { browse: 'collection' as const } : {}),
    ...(source === 'media' && item ? { item } : {}),
  };
}
