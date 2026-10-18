import type { Triggers } from 'convex-helpers/server/triggers';

import { internal } from '../_generated/api';
import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { isActiveProfile } from './accountLifecycle';
import { assetCatalogueKind } from './assetCatalogue';
import { canonicalJson } from './canonicalJson';
import type { CatalogueEntryFields, CatalogueKind } from './catalogueEntryShape';
import {
  ALL_PARTITION,
  countOrderItems,
  insertMissingOrderItems,
  missingOrderItems,
  registerCatalogueOrderTriggers,
} from './catalogueOrder';
import { factionCatalogueKind } from './factionCatalogue';

/**
 * Catalogue read models (`catalogue_entries`): one slim row per listed entity per list it is in, rebuilt from the canonical rows at will.
 * A source is in the `'all'` list and in one list per facet (a faction per linked ruleset), so a filtered list is counted and paged like the whole one.
 * A kind is one `CatalogueKind` here plus its trigger registration below;
 * the reconcile, the backfill, the drift check and the aggregate order (`catalogueOrder.ts`) are shared.
 */
export const CATALOGUE_KINDS = {
  faction: factionCatalogueKind,
  asset: assetCatalogueKind,
} as const satisfies Record<string, CatalogueKind>;

export type CatalogueKindName = keyof typeof CATALOGUE_KINDS;

export function isCatalogueKindName(kind: string): kind is CatalogueKindName {
  return Object.hasOwn(CATALOGUE_KINDS, kind);
}

/* A source's rows: one per list, so this bounds its facets; a faction's ruleset links are capped lower than this when written. */
const SOURCE_ENTRY_LIMIT = 1024;

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
    .take(SOURCE_ENTRY_LIMIT);
}

/** The rows a source should have, keyed by list. */
async function expectedEntries(ctx: QueryCtx, kind: CatalogueKindName, sourceId: string) {
  const source = await CATALOGUE_KINDS[kind].expected(ctx, sourceId);
  const expected = new Map<string, CatalogueEntryFields>();
  for (const partition of source ? [ALL_PARTITION, ...source.facets] : []) {
    expected.set(partition, { ...source!, partition });
  }
  return expected;
}

/** Keeps the first row of each wanted list, rewritten only if it differs, and deletes every other row. */
async function keepOrDeleteEntry(
  ctx: MutationCtx,
  entry: Doc<'catalogue_entries'>,
  want: CatalogueEntryFields | undefined,
  kept: Set<string>
) {
  if (!want || kept.has(entry.partition)) {
    await ctx.db.delete(entry._id);
    return;
  }
  kept.add(entry.partition);
  if (!sameCatalogueEntry(entryFields(entry), want)) {
    await ctx.db.replace(entry._id, want);
  }
}

/**
 * Brings one source's rows in line with its canonical rows: insert, replace or delete per list, writing only what differs.
 * Idempotent and order-free, so the triggers, the backfill and any repair all call it.
 */
export async function reconcileCatalogueEntry(ctx: MutationCtx, kind: CatalogueKindName, sourceId: string) {
  const [expected, existing] = await Promise.all([
    expectedEntries(ctx, kind, sourceId),
    entriesFor(ctx, kind, sourceId),
  ]);
  const kept = new Set<string>();
  for (const entry of existing) {
    await keepOrDeleteEntry(ctx, entry, expected.get(entry.partition), kept);
  }
  for (const [partition, want] of expected) {
    if (!kept.has(partition)) {
      await ctx.db.insert('catalogue_entries', want);
    }
  }
}

/** Reconciles a source, then puts back any aggregate item its entries lack, which only a write that skipped the triggers leaves out. */
export async function repairCatalogueEntry(ctx: MutationCtx, kind: CatalogueKindName, sourceId: string) {
  await reconcileCatalogueEntry(ctx, kind, sourceId);
  for (const entry of await entriesFor(ctx, kind, sourceId)) {
    await insertMissingOrderItems(ctx, entry, CATALOGUE_KINDS[kind].sorts);
  }
}

type SourceDrift = 'missing' | 'duplicated' | 'stale' | 'orphaned' | 'unordered';

/** Every way one source's rows, and their aggregate items, differ from what its canonical rows say; empty when they are exact. */
export async function catalogueSourceDrift(
  ctx: QueryCtx,
  kind: CatalogueKindName,
  sourceId: string
): Promise<SourceDrift[]> {
  const [expected, existing] = await Promise.all([
    expectedEntries(ctx, kind, sourceId),
    entriesFor(ctx, kind, sourceId),
  ]);
  const drift = new Set<SourceDrift>();
  const seen = new Set<string>();
  for (const entry of existing) {
    const want = expected.get(entry.partition);
    if (!want) {
      drift.add('orphaned');
    } else if (seen.has(entry.partition)) {
      drift.add('duplicated');
    } else if (!sameCatalogueEntry(entryFields(entry), want)) {
      drift.add('stale');
    }
    seen.add(entry.partition);
    if ((await missingOrderItems(ctx, entry, CATALOGUE_KINDS[kind].sorts)).length > 0) {
      drift.add('unordered');
    }
  }
  if ([...expected.keys()].some((partition) => !seen.has(partition))) {
    drift.add('missing');
  }
  return [...drift];
}

/** What an asset entry reads off its owner's profile: the name it is searched by, and only while the profile is active. */
function ownerSearchName(profile: Doc<'profiles'> | null) {
  return profile && isActiveProfile(profile) ? (profile.username ?? null) : null;
}

/**
 * Every writer of a kind's source tables keeps its entries exact in its own transaction, and every entry write keeps the aggregate order exact in turn.
 * A faction's entries read the faction and its links;
 * which linked rulesets are live is resolved when the catalogue is read, so a ruleset's own writes reach no entry.
 * An asset's entries read the asset and its owner's name;
 * one owner can hold more assets than a transaction should rewrite, so a rename is carried to them in scheduled pages.
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
  triggers.register('assets', async (ctx, change) => {
    await reconcileCatalogueEntry(ctx, 'asset', change.id);
  });
  triggers.register('profiles', async (ctx, change) => {
    const before = change.oldDoc;
    const after = change.newDoc;
    /* A new profile's owner holds no assets yet: a user cannot create one before their profile exists. */
    if (!before || (before.user_id === after?.user_id && ownerSearchName(before) === ownerSearchName(after))) {
      return;
    }
    for (const ownerId of new Set([before?.user_id, after?.user_id])) {
      if (ownerId) {
        await ctx.scheduler.runAfter(0, internal.catalogueMaintenance.reconcileOwnerAssets, { ownerId, cursor: null });
      }
    }
  });
  registerCatalogueOrderTriggers(triggers, (kind) => (isCatalogueKindName(kind) ? CATALOGUE_KINDS[kind].sorts : []));
}

export type CatalogueDrift = {
  scanned: { sources: number; entries: number };
  /** A listed source missing from one of its lists. */
  missing: string[];
  /** An entry that differs from what its source says now. */
  stale: string[];
  /** A source listed twice in one list. */
  duplicated: string[];
  /** An entry missing from the aggregate order of one of its sorts. */
  unordered: string[];
  /** An entry whose source should not be in that list. */
  orphaned: Id<'catalogue_entries'>[];
  /** A sort whose whole-catalogue order holds more items than there are entries, which a delete without its trigger leaves; checked only when the scan read every entry. */
  overcounted: string[];
};

async function recordSourceDrift(ctx: QueryCtx, kind: CatalogueKindName, sourceIds: string[], drift: CatalogueDrift) {
  for (const sourceId of sourceIds) {
    for (const found of await catalogueSourceDrift(ctx, kind, sourceId)) {
      if (found !== 'orphaned') {
        drift[found].push(sourceId);
      }
    }
  }
}

async function orphanedEntries(ctx: QueryCtx, kind: CatalogueKindName, entries: Doc<'catalogue_entries'>[]) {
  const orphaned: Id<'catalogue_entries'>[] = [];
  for (const entry of entries) {
    const expected = await expectedEntries(ctx, kind, entry.source_id);
    if (!expected.has(entry.partition)) {
      orphaned.push(entry._id);
    }
  }
  return orphaned;
}

async function overcountedSorts(ctx: QueryCtx, kind: CatalogueKindName, entries: Doc<'catalogue_entries'>[]) {
  const listed = entries.filter((entry) => entry.partition === ALL_PARTITION).length;
  const overcounted: string[] = [];
  for (const sort of CATALOGUE_KINDS[kind].sorts) {
    if ((await countOrderItems(ctx, [kind, sort, ALL_PARTITION])) > listed) {
      overcounted.push(sort);
    }
  }
  return overcounted;
}

/**
 * Compares one kind's entries with the canonical rows, both ways, within one bounded scan of each.
 * Every sampled source and every sampled entry is checked by its own source id, so the two scans need not cover the same rows.
 */
export async function catalogueDrift(ctx: QueryCtx, kind: CatalogueKindName, limit: number): Promise<CatalogueDrift> {
  const [sourceIds, entries] = await Promise.all([
    CATALOGUE_KINDS[kind].listedSourceIds(ctx, limit),
    ctx.db
      .query('catalogue_entries')
      .withIndex('by_kind_source', (q) => q.eq('kind', kind))
      .take(limit),
  ]);
  const drift: CatalogueDrift = {
    scanned: { sources: sourceIds.length, entries: entries.length },
    missing: [],
    stale: [],
    duplicated: [],
    unordered: [],
    orphaned: [],
    overcounted: [],
  };
  await recordSourceDrift(ctx, kind, sourceIds, drift);
  drift.orphaned = await orphanedEntries(ctx, kind, entries);
  if (entries.length < limit) {
    drift.overcounted = await overcountedSorts(ctx, kind, entries);
  }
  return drift;
}
