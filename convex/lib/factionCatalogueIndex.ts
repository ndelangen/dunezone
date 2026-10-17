/**
 * PROTOTYPE (approach B, fully server-side Faction catalogue).
 * Not wired into any route.
 *
 * Read model: `faction_catalogue_entries`, one slim row per live faction per partition
 * (`'all'`, plus one per linked ruleset).
 * Triggers on `factions` and `ruleset_factions` resync a faction's rows;
 * a trigger on the entries table keeps the `factionCatalogueOrder` aggregate in step: one item per entry per sort order, namespaced `[sort, partition]`, keyed
 * `[sortValue, entry._creationTime]` so the aggregate's order is exactly the entries index order
 * (`[partition, field, _creationTime]`).
 * That identity is what lets `at(offset)` hand over a seek position to a plain indexed `take(pageSize)`.
 */
import { DirectAggregate } from '@convex-dev/aggregate';
import type { Triggers } from 'convex-helpers/server/triggers';

import { effectiveComplexity } from '../../src/shared/factions/complexity';
import { components } from '../_generated/api';
import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { toCatalogueFaction } from './factionCatalogue';
import type { CatalogueFaction, FactionRulesetSummary } from './factionCatalogue';

export const ALL_PARTITION = 'all';
export const CATALOGUE_PAGE_SIZE = 24;
/** Convex search returns at most 1024 hits; the search path reads them all so it can filter, count and re-sort. */
export const SEARCH_RESULT_CAP = 1024;
/** Complexity range + a non-complexity sort: up to this many matches are read via the complexity index and sorted in memory. */
export const IN_MEMORY_SORT_CAP = 1024;
/** Beyond the in-memory cap, an ordered scan with a complexity filter may read at most this many entries. */
export const FILTERED_SCAN_BUDGET = 4000;
const LINK_LIMIT = 500;

export const SORT_FIELDS = ['name', 'created', 'updated', 'complexity'] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export type SortDirection = 'asc' | 'desc';

type Entry = Doc<'faction_catalogue_entries'>;
type EntryFields = Omit<Entry, '_id' | '_creationTime'>;
type OrderKey = [string | number, number];
type OrderNamespace = [SortField, string];

const catalogueOrder = new DirectAggregate<{ Namespace: OrderNamespace; Key: OrderKey; Id: string }>(
  components.factionCatalogueOrder
);

const SORT_INDEX = {
  name: { index: 'by_partition_name_key', field: 'name_key' },
  created: { index: 'by_partition_created_at', field: 'created_at' },
  updated: { index: 'by_partition_updated_at', field: 'updated_at' },
  complexity: { index: 'by_partition_complexity', field: 'complexity' },
} as const;

function sortValue(entry: EntryFields, sort: SortField): string | number {
  return entry[SORT_INDEX[sort].field];
}

/*
 * Projection: faction row -> entry fields. Lenient on purpose: a trigger that threw on a malformed
 * blob would block every write to it (migrations insert raw blobs), so read what is there and
 * fall back, and leave strict parsing to the read path, as today.
 */

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function projectedComplexity(raw: unknown): number {
  const complexity = record(raw);
  const calculated = typeof complexity.calculated === 'number' ? complexity.calculated : 0;
  const manual = typeof complexity.manual === 'number' ? complexity.manual : undefined;
  return effectiveComplexity(manual === undefined ? { calculated } : { calculated, manual });
}

export function projectFaction(faction: Doc<'factions'>): Omit<EntryFields, 'partition'> {
  const data = record(faction.data);
  const name = text(data.name).trim();
  const factionLeader = text(record(data.factionLeader ?? data.hero).name);
  const leaders = Array.isArray(data.leaders) ? data.leaders.map((leader) => text(record(leader).name)) : [];
  return {
    faction_id: faction._id,
    slug: faction.slug,
    name_key: name.toLowerCase(),
    search_text: [name, factionLeader, ...leaders].filter(Boolean).join(' ').toLowerCase(),
    complexity: projectedComplexity(data.complexity),
    created_at: faction.created_at,
    updated_at: faction.updated_at,
  };
}

function sameFields(left: EntryFields, right: EntryFields) {
  return (
    left.slug === right.slug &&
    left.name_key === right.name_key &&
    left.search_text === right.search_text &&
    left.complexity === right.complexity &&
    left.created_at === right.created_at &&
    left.updated_at === right.updated_at
  );
}

/**
 * Makes a faction's entries match its row and links: insert, patch or delete, nothing else.
 * Idempotent, so the triggers, the backfill and the repair all call this one function.
 */
export async function syncFactionCatalogueEntries(ctx: MutationCtx, factionId: Id<'factions'>) {
  const faction = await ctx.db.get('factions', factionId);
  const existing = await ctx.db
    .query('faction_catalogue_entries')
    .withIndex('by_faction_partition', (q) => q.eq('faction_id', factionId))
    .take(LINK_LIMIT + 1);

  const desired = new Map<string, EntryFields>();
  if (faction && !faction.is_deleted) {
    const projection = projectFaction(faction);
    const links = await ctx.db
      .query('ruleset_factions')
      .withIndex('by_faction', (q) => q.eq('faction_id', factionId))
      .take(LINK_LIMIT);
    for (const partition of [ALL_PARTITION, ...links.map((link) => String(link.ruleset_id))]) {
      desired.set(partition, { ...projection, partition });
    }
  }

  for (const entry of existing) {
    const want = desired.get(entry.partition);
    if (!want) {
      await ctx.db.delete('faction_catalogue_entries', entry._id);
    } else {
      desired.delete(entry.partition);
      if (!sameFields(entry, want)) {
        await ctx.db.patch('faction_catalogue_entries', entry._id, want);
      }
    }
  }
  for (const fields of desired.values()) {
    await ctx.db.insert('faction_catalogue_entries', fields);
  }
}

/*
 * Aggregate maintenance, driven by the entries table alone.
 */

function orderItem(entry: Entry, sort: SortField) {
  return {
    namespace: [sort, entry.partition] as OrderNamespace,
    key: [sortValue(entry, sort), entry._creationTime] as OrderKey,
    id: entry._id as string,
  };
}

async function applyEntryChange(ctx: MutationCtx, oldEntry: Entry | null, newEntry: Entry | null) {
  for (const sort of SORT_FIELDS) {
    const before = oldEntry ? orderItem(oldEntry, sort) : null;
    const after = newEntry ? orderItem(newEntry, sort) : null;
    if (before && after) {
      if (before.namespace[1] === after.namespace[1] && before.key[0] === after.key[0]) {
        continue; // Untouched sort key: no aggregate write at all.
      }
      await catalogueOrder.replaceOrInsert(ctx, before, after);
    } else if (before) {
      await catalogueOrder.deleteIfExists(ctx, before);
    } else if (after) {
      await catalogueOrder.insertIfDoesNotExist(ctx, after);
    }
  }
}

export function registerFactionCatalogueIndexTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  triggers.register('factions', async (ctx, change) => {
    const before = change.oldDoc;
    const after = change.newDoc;
    if (
      before &&
      after &&
      before.is_deleted === after.is_deleted &&
      before.slug === after.slug &&
      before.created_at === after.created_at &&
      before.updated_at === after.updated_at &&
      before.data === after.data
    ) {
      return; // Group moves and other non-catalogue patches touch nothing.
    }
    await syncFactionCatalogueEntries(ctx, change.id);
  });
  triggers.register('ruleset_factions', async (ctx, change) => {
    const factionIds = new Set([change.oldDoc?.faction_id, change.newDoc?.faction_id].filter((id) => id != null));
    for (const factionId of factionIds) {
      await syncFactionCatalogueEntries(ctx, factionId);
    }
  });
  triggers.register('faction_catalogue_entries', async (ctx, change) => {
    await applyEntryChange(ctx, change.oldDoc, change.newDoc);
  });
}

/*
 * Backfill / repair. Paginated so each call stays inside one transaction's limits.
 */

/** Step 1: resync entries for a page of factions (entries trigger fills the aggregate). */
export async function backfillFactionCatalogueEntriesPage(ctx: MutationCtx, cursor: string | null, numItems: number) {
  const page = await ctx.db.query('factions').paginate({ cursor, numItems });
  for (const faction of page.page) {
    await syncFactionCatalogueEntries(ctx, faction._id);
  }
  return { cursor: page.continueCursor, isDone: page.isDone };
}

/** Step 2: make sure every entry has all its aggregate items (repairs a cleared or drifted aggregate). */
export async function repairFactionCatalogueOrderPage(ctx: MutationCtx, cursor: string | null, numItems: number) {
  const page = await ctx.db.query('faction_catalogue_entries').paginate({ cursor, numItems });
  for (const entry of page.page) {
    for (const sort of SORT_FIELDS) {
      await catalogueOrder.insertIfDoesNotExist(ctx, orderItem(entry, sort));
    }
  }
  return { cursor: page.continueCursor, isDone: page.isDone };
}

/** Step 3: drop aggregate items whose entry is gone or whose key went stale, one namespace page at a time. */
export async function pruneFactionCatalogueOrderPage(
  ctx: MutationCtx,
  namespace: OrderNamespace,
  cursor: string | undefined,
  pageSize: number
) {
  const { page, cursor: next, isDone } = await catalogueOrder.paginate(ctx, { namespace, cursor, pageSize });
  let pruned = 0;
  for (const item of page) {
    const id = ctx.db.normalizeId('faction_catalogue_entries', item.id);
    const entry = id ? await ctx.db.get('faction_catalogue_entries', id) : null;
    const current = entry ? orderItem(entry, namespace[0]) : null;
    if (
      !current ||
      current.namespace[1] !== namespace[1] ||
      current.key[0] !== item.key[0] ||
      current.key[1] !== item.key[1]
    ) {
      await catalogueOrder.deleteIfExists(ctx, { namespace, key: item.key, id: item.id });
      pruned += 1;
    }
  }
  return { cursor: next, isDone, pruned };
}

/** Every namespace the aggregate currently holds, for the prune walk. */
export async function listFactionCatalogueOrderNamespaces(ctx: QueryCtx) {
  const namespaces: OrderNamespace[] = [];
  for await (const namespace of catalogueOrder.iterNamespaces(ctx)) {
    namespaces.push(namespace as OrderNamespace);
  }
  return namespaces;
}

export async function clearFactionCatalogueOrder(ctx: MutationCtx) {
  await catalogueOrder.clearAll(ctx);
}

/** Test and repair aid: an independent check that a partition's entries, and each sort's aggregate items, are what the factions say. */
export async function auditFactionCatalogueIndex(ctx: QueryCtx, partition: string) {
  const problems: string[] = [];
  const entries = await ctx.db
    .query('faction_catalogue_entries')
    .withIndex('by_partition_name_key', (q) => q.eq('partition', partition))
    .take(20_000);
  for (const entry of entries) {
    const faction = await ctx.db.get('factions', entry.faction_id);
    if (!faction || faction.is_deleted) {
      problems.push(`entry ${entry._id} for missing or deleted faction ${entry.faction_id}`);
      continue;
    }
    const want = { ...projectFaction(faction), partition };
    if (!sameFields(entry, want)) {
      problems.push(`entry ${entry._id} is stale`);
    }
  }
  for (const sort of SORT_FIELDS) {
    const expected = entries
      .map((entry) => orderItem(entry, sort))
      .sort((a, b) => (a.key[0] < b.key[0] ? -1 : a.key[0] > b.key[0] ? 1 : a.key[1] - b.key[1]))
      .map((item) => item.id);
    const actual: string[] = [];
    for await (const item of catalogueOrder.iter(ctx, { namespace: [sort, partition] })) {
      actual.push(item.id);
    }
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      problems.push(
        `${sort}/${partition}: aggregate holds ${actual.length} items, entries ${expected.length}, or the order differs`
      );
    }
  }
  return { entries: entries.length, problems };
}

/*
 * The page read.
 */

export type CataloguePageArgs = {
  q?: string;
  ruleset?: Id<'rulesets'>;
  complexityMin?: number;
  complexityMax?: number;
  sort: SortField | 'relevance';
  direction?: SortDirection;
  page: number;
};

/**
 * How the page was produced, so the caller (and the report) can tell exact from degraded.
 * - `aggregate`: count + at(offset) + indexed seek.
 * Exact at any size.
 * - `aggregate-bounded`: same, with complexity bounds on the complexity-sorted namespace.
 * Exact.
 * - `in-memory`: complexity range + other sort, matches <= IN_MEMORY_SORT_CAP, read via the complexity index and sorted.
 * Exact.
 * - `filtered-scan`: complexity range + other sort with too many matches: ordered scan, budget-limited.
 * Exact total;
 * deep pages may be unreachable.
 * - `search`: Convex full-text search, <= SEARCH_RESULT_CAP hits.
 * Exact only below the cap;
 * no typo tolerance.
 */
export type CataloguePageMode = 'aggregate' | 'aggregate-bounded' | 'in-memory' | 'filtered-scan' | 'search';

export type CataloguePageResult = {
  items: CatalogueFaction[];
  page: number;
  total: number;
  pageCount: number;
  mode: CataloguePageMode;
  /** False when the answer may be incomplete: search hit its cap, or the scan budget ran out before the page. */
  exact: boolean;
};

function hasComplexityRange(args: CataloguePageArgs) {
  return (args.complexityMin ?? 0) > 0 || (args.complexityMax ?? 1) < 1;
}

function compareEntries(sort: SortField, direction: SortDirection) {
  const sign = direction === 'asc' ? 1 : -1;
  return (left: Entry, right: Entry) => {
    const a = sortValue(left, sort);
    const b = sortValue(right, sort);
    const primary = a < b ? -1 : a > b ? 1 : 0;
    return sign * (primary || left._creationTime - right._creationTime);
  };
}

function inRange(entry: Entry, min: number, max: number) {
  return entry.complexity >= min && entry.complexity <= max;
}

/* The index builders are typed per index; this prototype keeps one generic ranged read over the four sort indexes, hence the narrow casts. */
type Range = {
  eq: (field: string, value: unknown) => Range;
  gt: (field: string, value: unknown) => Range;
  gte: (field: string, value: unknown) => Range;
  lt: (field: string, value: unknown) => Range;
  lte: (field: string, value: unknown) => Range;
};
type OrderedEntries = AsyncIterable<Entry> & { take: (n: number) => Promise<Entry[]> };

function sortedEntries(ctx: QueryCtx, sort: SortField, direction: SortDirection, range: (q: Range) => Range) {
  const table = ctx.db.query('faction_catalogue_entries') as unknown as {
    withIndex: (index: string, range: (q: Range) => Range) => { order: (o: SortDirection) => OrderedEntries };
  };
  return table.withIndex(SORT_INDEX[sort].index, range).order(direction);
}

/**
 * The page that starts at the entry the aggregate named.
 * The aggregate key is `[value, _creationTime]`;
 * the index is `[partition, field, _creationTime]`, so the seek is two ranges: the rest of the tie group at `value`, then everything strictly past `value`.
 * `stop` bounds the second range (the complexity range's far edge on the complexity sort).
 */
async function seekPage(
  ctx: QueryCtx,
  sort: SortField,
  direction: SortDirection,
  partition: string,
  start: OrderKey,
  pageSize: number,
  stop?: number
): Promise<Entry[]> {
  const field = SORT_INDEX[sort].field;
  const [value, creationTime] = start;
  const query = (range: (q: Range) => Range) => sortedEntries(ctx, sort, direction, range);

  const ties = await query((q) => {
    const tie = q.eq('partition', partition).eq(field, value);
    return direction === 'asc' ? tie.gte('_creationTime', creationTime) : tie.lte('_creationTime', creationTime);
  }).take(pageSize);
  if (ties.length >= pageSize) {
    return ties;
  }
  const rest = await query((q) => {
    const scoped = q.eq('partition', partition);
    if (direction === 'asc') {
      const lower = scoped.gt(field, value);
      return stop === undefined ? lower : lower.lte(field, stop);
    }
    const upper = scoped.lt(field, value);
    return stop === undefined ? upper : upper.gte(field, stop);
  }).take(pageSize - ties.length);
  return [...ties, ...rest];
}

async function hydrate(ctx: QueryCtx, entries: Entry[]): Promise<CatalogueFaction[]> {
  const rulesetSummaries = new Map<Id<'rulesets'>, FactionRulesetSummary | null>();
  const summary = async (id: Id<'rulesets'>) => {
    if (!rulesetSummaries.has(id)) {
      const ruleset = await ctx.db.get('rulesets', id);
      rulesetSummaries.set(
        id,
        ruleset && !ruleset.is_deleted ? { id: ruleset._id, slug: ruleset.slug, name: ruleset.name } : null
      );
    }
    return rulesetSummaries.get(id) ?? null;
  };
  const rows = await Promise.all(
    entries.map(async (entry) => {
      const faction = await ctx.db.get('factions', entry.faction_id);
      if (!faction || faction.is_deleted) {
        return null;
      }
      const links = await ctx.db
        .query('ruleset_factions')
        .withIndex('by_faction', (q) => q.eq('faction_id', faction._id))
        .take(LINK_LIMIT);
      const rulesets = (await Promise.all(links.map((link) => summary(link.ruleset_id))))
        .filter((ruleset): ruleset is FactionRulesetSummary => ruleset !== null)
        .sort((left, right) => left.name.localeCompare(right.name) || String(left.id).localeCompare(String(right.id)));
      return toCatalogueFaction(faction, rulesets);
    })
  );
  return rows.filter((row): row is CatalogueFaction => row !== null);
}

function pageResult(
  page: number,
  total: number,
  entries: Entry[],
  mode: CataloguePageMode,
  exact: boolean
): { entries: Entry[]; page: number; total: number; pageCount: number; mode: CataloguePageMode; exact: boolean } {
  return { entries, page, total, pageCount: Math.max(1, Math.ceil(total / CATALOGUE_PAGE_SIZE)), mode, exact };
}

/** The page's entries without hydration; the measurements and tests read this directly. */
export async function selectCataloguePageEntries(
  ctx: QueryCtx,
  args: CataloguePageArgs,
  limits: { inMemorySortCap: number; scanBudget: number } = {
    inMemorySortCap: IN_MEMORY_SORT_CAP,
    scanBudget: FILTERED_SCAN_BUDGET,
  }
) {
  const page = Math.max(1, Math.floor(args.page));
  const offset = (page - 1) * CATALOGUE_PAGE_SIZE;
  const partition = args.ruleset ? String(args.ruleset) : ALL_PARTITION;
  const min = Math.max(0, args.complexityMin ?? 0);
  const max = Math.min(1, args.complexityMax ?? 1);
  const query = args.q?.trim().toLowerCase() ?? '';

  /* (c) Search: relevance order from Convex, filter and optional re-sort in memory over <= 1024 hits. */
  if (query.length > 0) {
    const hits = await ctx.db
      .query('faction_catalogue_entries')
      .withSearchIndex('search_search_text', (q) => q.search('search_text', query).eq('partition', partition))
      .take(SEARCH_RESULT_CAP);
    const matches = hits.filter((entry) => inRange(entry, min, max));
    if (args.sort !== 'relevance') {
      matches.sort(compareEntries(args.sort, args.direction ?? 'asc'));
    }
    return pageResult(
      page,
      matches.length,
      matches.slice(offset, offset + CATALOGUE_PAGE_SIZE),
      'search',
      hits.length < SEARCH_RESULT_CAP
    );
  }

  const sort: SortField = args.sort === 'relevance' ? 'name' : args.sort;
  const direction = args.direction ?? 'asc';
  const namespace: OrderNamespace = [sort, partition];

  /* (a) No complexity range: count + at(offset) + seek. */
  if (!hasComplexityRange(args)) {
    const total = await catalogueOrder.count(ctx, { namespace });
    if (offset >= total) {
      return pageResult(page, total, [], 'aggregate', true);
    }
    const item = await catalogueOrder.at(ctx, direction === 'asc' ? offset : -offset - 1, { namespace });
    const entries = await seekPage(ctx, sort, direction, partition, item.key, CATALOGUE_PAGE_SIZE);
    return pageResult(page, total, entries, 'aggregate', true);
  }

  /* (b1) Complexity range on the complexity sort: bounds on the same namespace. */
  const bounds = {
    lower: { key: [min, 0] as OrderKey, inclusive: true },
    upper: { key: [max, Number.MAX_VALUE] as OrderKey, inclusive: true },
  };
  if (sort === 'complexity') {
    const total = await catalogueOrder.count(ctx, { namespace, bounds });
    if (offset >= total) {
      return pageResult(page, total, [], 'aggregate-bounded', true);
    }
    const item = await catalogueOrder.at(ctx, direction === 'asc' ? offset : -offset - 1, { namespace, bounds });
    const stop = direction === 'asc' ? max : min;
    const entries = await seekPage(ctx, sort, direction, partition, item.key, CATALOGUE_PAGE_SIZE, stop);
    return pageResult(page, total, entries, 'aggregate-bounded', true);
  }

  /* (b2) Complexity range + another sort. The total is still exact (complexity namespace count). */
  const total = await catalogueOrder.count(ctx, { namespace: ['complexity', partition], bounds });
  if (offset >= total) {
    return pageResult(page, total, [], 'in-memory', true);
  }
  if (total <= limits.inMemorySortCap) {
    const matches = await ctx.db
      .query('faction_catalogue_entries')
      .withIndex('by_partition_complexity', (q) =>
        q.eq('partition', partition).gte('complexity', min).lte('complexity', max)
      )
      .take(limits.inMemorySortCap);
    matches.sort(compareEntries(sort, direction));
    return pageResult(page, total, matches.slice(offset, offset + CATALOGUE_PAGE_SIZE), 'in-memory', true);
  }
  /* Ordered scan with a filter: reads ~ (offset + pageSize) / selectivity rows, capped by the budget. */
  const entries: Entry[] = [];
  let skipped = 0;
  let read = 0;
  for await (const entry of sortedEntries(ctx, sort, direction, (q) => q.eq('partition', partition))) {
    read += 1;
    if (inRange(entry, min, max)) {
      if (skipped < offset) {
        skipped += 1;
      } else {
        entries.push(entry);
        if (entries.length >= CATALOGUE_PAGE_SIZE) {
          break;
        }
      }
    }
    if (read >= limits.scanBudget) {
      return pageResult(page, total, entries, 'filtered-scan', false);
    }
  }
  return pageResult(page, total, entries, 'filtered-scan', true);
}

export async function loadCataloguePage(ctx: QueryCtx, args: CataloguePageArgs): Promise<CataloguePageResult> {
  if (args.ruleset) {
    const ruleset = await ctx.db.get('rulesets', args.ruleset);
    if (!ruleset || ruleset.is_deleted) {
      return { items: [], page: 1, total: 0, pageCount: 1, mode: 'aggregate', exact: true };
    }
  }
  const { entries, ...rest } = await selectCataloguePageEntries(ctx, args);
  return { ...rest, items: await hydrate(ctx, entries) };
}
