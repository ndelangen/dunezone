import { catalogueEntries } from './mediaCatalogue';
import type { MediaEntry } from './mediaCatalogue';

export interface MediaTile {
  key: string;
  label: string;
  entry: MediaEntry;
  variants: MediaEntry[];
}

function artworkKey(entry: MediaEntry) {
  const path = entry.kind === 'decal' ? entry.value.replace(/-multicolor\.svg$/, '.svg') : entry.value;
  return `${entry.collection}:${path}`;
}

export function variantLabel(entry: MediaEntry) {
  return entry.value.endsWith('-multicolor.svg') ? 'Color' : 'Mono';
}

const variantsByArtwork = new Map<string, MediaEntry[]>();
for (const entry of catalogueEntries) {
  const key = artworkKey(entry);
  const variants = variantsByArtwork.get(key) ?? [];
  variants.push(entry);
  variantsByArtwork.set(key, variants);
}
for (const variants of variantsByArtwork.values()) {
  variants.sort((a, b) => Number(a.value.endsWith('-multicolor.svg')) - Number(b.value.endsWith('-multicolor.svg')));
}

/** A match in either version keeps both files available in the same tile. */
export function mediaTiles(entries: readonly MediaEntry[]): MediaTile[] {
  const tiles = new Map<string, MediaTile>();
  for (const entry of entries) {
    const key = artworkKey(entry);
    if (tiles.has(key)) {
      continue;
    }
    const variants = variantsByArtwork.get(key) ?? [entry];
    tiles.set(key, { key, label: variants[0]!.label, entry, variants });
  }
  return [...tiles.values()];
}
