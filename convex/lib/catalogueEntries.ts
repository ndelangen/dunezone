import type { Triggers } from 'convex-helpers/server/triggers';

import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { canonicalJson } from './canonicalJson';
import type { CatalogueEntryFields, CatalogueKind } from './catalogueEntryShape';
import { factionCatalogueKind } from './factionCatalogue';

/**
 * Catalogue read models (`catalogue_entries`): one slim row per listed entity, rebuilt from the canonical rows at will.
 * A kind is one `CatalogueKind` here plus its trigger registration below;
 * the reconcile, the backfill and the drift check are shared.
 */
export const CATALOGUE_KINDS = {
  faction: factionCatalogueKind,
} as const satisfies Record<string, CatalogueKind>;

export type CatalogueKindName = keyof typeof CATALOGUE_KINDS;

export function isCatalogueKindName(kind: string): kind is CatalogueKindName {
  return Object.hasOwn(CATALOGUE_KINDS, kind);
}

/* More than one entry per source is drift; a reconcile removes the extras it can see. */
const DUPLICATE_ENTRY_LIMIT = 8;

/** Field for field, through `canonicalJson`, so a field added to the entry is compared without touching this. */
export function sameCatalogueEntry(entry: CatalogueEntryFields | null, expected: CatalogueEntryFields | null) {
  if (!entry || !expected) {
    return entry === expected;
  }
  return canonicalJson(entry) === canonicalJson(expected);
}

function entryFields({ _id, _creationTime, ...fields }: Doc<'catalogue_entries'>): CatalogueEntryFields {
  return fields;
}

async function entriesFor(ctx: QueryCtx, kind: CatalogueKindName, sourceId: string) {
  return await ctx.db
    .query('catalogue_entries')
    .withIndex('by_kind_source', (q) => q.eq('kind', kind).eq('source_id', sourceId))
    .take(DUPLICATE_ENTRY_LIMIT);
}

/**
 * Brings one source's entry in line with its canonical rows: insert, replace or delete, writing only when something differs.
 * Idempotent and order-free, so the triggers, the backfill and any repair all call it.
 */
export async function reconcileCatalogueEntry(ctx: MutationCtx, kind: CatalogueKindName, sourceId: string) {
  const [expected, entries] = await Promise.all([
    CATALOGUE_KINDS[kind].expected(ctx, sourceId),
    entriesFor(ctx, kind, sourceId),
  ]);
  const [kept, ...extras] = entries;
  for (const stale of expected ? extras : entries) {
    await ctx.db.delete(stale._id);
  }
  if (!expected) {
    return;
  }
  if (!kept) {
    await ctx.db.insert('catalogue_entries', expected);
  } else if (!sameCatalogueEntry(entryFields(kept), expected)) {
    await ctx.db.replace(kept._id, expected);
  }
}

/**
 * Every writer of a kind's source tables keeps its entries exact in its own transaction.
 * A faction's entry reads the faction and its links;
 * which linked rulesets are live is resolved when the catalogue is read, so a ruleset's own writes reach no entry.
 */
export function registerCatalogueTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  triggers.register('factions', async (ctx, change) => {
    await reconcileCatalogueEntry(ctx, 'faction', change.id);
  });
  triggers.register('ruleset_factions', async (ctx, change) => {
    for (const factionId of new Set([change.oldDoc?.faction_id, change.newDoc?.faction_id])) {
      if (factionId) {
        await reconcileCatalogueEntry(ctx, 'faction', factionId);
      }
    }
  });
}

export type CatalogueDrift = {
  scanned: { sources: number; entries: number };
  /** A listed source without an entry. */
  missing: string[];
  /** An entry that differs from what its source says now. */
  stale: string[];
  /** A source with more than one entry. */
  duplicated: string[];
  /** An entry whose source should not be listed. */
  orphaned: Id<'catalogue_entries'>[];
};

/** Compares one kind's entries with the canonical rows, both ways, within one bounded scan of each. */
export async function catalogueDrift(ctx: QueryCtx, kind: CatalogueKindName, limit: number): Promise<CatalogueDrift> {
  const definition = CATALOGUE_KINDS[kind];
  const [sourceIds, entries] = await Promise.all([
    definition.listedSourceIds(ctx, limit),
    ctx.db
      .query('catalogue_entries')
      .withIndex('by_kind', (q) => q.eq('kind', kind))
      .take(limit),
  ]);
  const entriesBySource = new Map<string, Doc<'catalogue_entries'>[]>();
  for (const entry of entries) {
    entriesBySource.set(entry.source_id, [...(entriesBySource.get(entry.source_id) ?? []), entry]);
  }
  const drift: CatalogueDrift = {
    scanned: { sources: sourceIds.length, entries: entries.length },
    missing: [],
    stale: [],
    duplicated: [],
    orphaned: [],
  };
  const listed = new Set(sourceIds);
  for (const sourceId of sourceIds) {
    const [first, ...rest] = entriesBySource.get(sourceId) ?? [];
    if (!first) {
      drift.missing.push(sourceId);
      continue;
    }
    if (rest.length > 0) {
      drift.duplicated.push(sourceId);
    }
    if (!sameCatalogueEntry(entryFields(first), await definition.expected(ctx, sourceId))) {
      drift.stale.push(sourceId);
    }
  }
  for (const entry of entries) {
    /* A listed source past the scan bound is not an orphan, so an unlisted id is checked against its source. */
    if (!listed.has(entry.source_id) && !(await definition.expected(ctx, entry.source_id))) {
      drift.orphaned.push(entry._id);
    }
  }
  return drift;
}
