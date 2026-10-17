import type { WithoutSystemFields } from 'convex/server';

import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import type { CatalogueSort } from './catalogueOrder';

/* The shape every catalogue kind writes, apart from the reconcile machinery in `catalogueEntries.ts`, so a kind's own module can build entries without importing the registry that imports it. */

export type CatalogueEntryFields = WithoutSystemFields<Doc<'catalogue_entries'>>;

/** What a source lists as, once; it is written into the `'all'` list and into the list of each of its facets. */
export type CatalogueSourceFields = Omit<CatalogueEntryFields, 'partition'>;

export type CatalogueKind = {
  /** The orders this kind's lists offer; each is one aggregate namespace per list. */
  sorts: readonly CatalogueSort[];
  /** The entry this source should have right now, or null when it should be unlisted. */
  expected: (ctx: QueryCtx, sourceId: string) => Promise<CatalogueSourceFields | null>;
  /** The sources that should be listed, for the drift check's forward pass. */
  listedSourceIds: (ctx: QueryCtx, limit: number) => Promise<string[]>;
};

/** Every searchable name in one field, which Convex's search index tokenizes into words. */
export function catalogueSearchText(names: readonly string[]) {
  return names
    .map((name) => name.replaceAll('\n', ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** The name the default order compares: trimmed and case-folded, so "atreides" and "Atreides" sort together. */
export function catalogueNameKey(name: string) {
  return name.trim().toLocaleLowerCase('en');
}

/** A stored ISO date as epoch milliseconds; 0 when it does not parse, which every newest-first order puts last. */
export function catalogueTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
