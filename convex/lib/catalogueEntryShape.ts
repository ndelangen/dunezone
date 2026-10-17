import type { WithoutSystemFields } from 'convex/server';

import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';

/* The shape every catalogue kind writes, apart from the reconcile machinery in `catalogueEntries.ts`, so a kind's own module can build entries without importing the registry that imports it. */

export type CatalogueEntryFields = WithoutSystemFields<Doc<'catalogue_entries'>>;

export type CatalogueKind = {
  /** The entry this source should have right now, or null when it should be unlisted. */
  expected: (ctx: QueryCtx, sourceId: string) => Promise<CatalogueEntryFields | null>;
  /** The sources that should be listed, for the drift check's forward pass. */
  listedSourceIds: (ctx: QueryCtx, limit: number) => Promise<string[]>;
};

/** One line per searchable name, so a fuzzy search can score each name on its own, as it scored separate fields. */
export function catalogueSearchText(names: readonly string[]) {
  return names.map((name) => name.replaceAll('\n', ' ').trim()).join('\n');
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
