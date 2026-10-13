import { mediaSubjects } from './mediaSubjects';

/*
 * The catalogue's search parameters, kept apart from the catalogue itself.
 * Route search validation runs in the router's entry chunk on every page, so this module must not import the
 * 500 KB media index: an `item` is kept by shape here, and the page shows nothing for one it does not know.
 */

export const indexedMediaKinds = [
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

export type MediaKind = (typeof indexedMediaKinds)[number]['value'];

export const mediaKinds = indexedMediaKinds.filter(
  ({ value }) => !['troop_modifier', 'background', 'texture', 'card', 'shield', 'web'].includes(value)
);

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
  const item = source === 'media' ? selectedMediaPath(search.item) : undefined;
  return {
    source,
    kind,
    group: searchText(search.group).trim().slice(0, 200),
    q: searchText(search.q).slice(0, 300),
    ...(mediaSubjects.some(({ value }) => value === search.subject) ? { subject: String(search.subject) } : {}),
    ...(search.browse === 'collection' ? { browse: 'collection' as const } : {}),
    ...(item ? { item } : {}),
  };
}

/** A selected asset is a site path; anything else is dropped. */
function selectedMediaPath(value: unknown) {
  const item = searchText(value);
  return item.startsWith('/') && item.length <= 300 ? item : undefined;
}
