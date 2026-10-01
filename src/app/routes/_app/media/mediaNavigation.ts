import { mediaKinds, validateMediaSearch } from './mediaCatalogue';
import type { MediaSearch } from './mediaCatalogue';

export function mediaLocation(search: MediaSearch) {
  const { source, kind, group, q, ...rest } = search;
  const query = { ...rest, ...(group ? { group } : {}), ...(q ? { q } : {}) };
  if (source !== 'media') {
    return { to: '/media/$source' as const, params: { source }, search: query };
  }
  const category = mediaKinds.find((item) => item.value === kind);
  return category
    ? { to: '/media/$source/$kind' as const, params: { source: 'game', kind: category.slug }, search: query }
    : { to: '/media' as const, search: query };
}

export function mediaPathSearch(search: Partial<MediaSearch>, params: { source?: string; kind?: string }): MediaSearch {
  return {
    ...validateMediaSearch(search),
    source: params.source === 'topics' || params.source === 'lucide' ? params.source : 'media',
    kind: mediaKinds.find((item) => item.slug === params.kind)?.value ?? 'all',
  };
}

export function validateMediaQuery(input: unknown): Omit<Partial<MediaSearch>, 'source' | 'kind'> {
  const { source: _source, kind: _kind, group, q, ...rest } = validateMediaSearch(input);
  return { ...rest, ...(group ? { group } : {}), ...(q ? { q } : {}) };
}
