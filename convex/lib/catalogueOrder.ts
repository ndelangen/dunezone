import { DirectAggregate } from '@convex-dev/aggregate';
import type { Triggers } from 'convex-helpers/server/triggers';

import { components } from '../_generated/api';
import type { DataModel, Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

/*
 * The catalogue's ordered access, the Convex way: `@convex-dev/aggregate` counts and finds the entry at any offset in O(log n),
 * and an indexed read from that entry fills the page.
 * One aggregate instance holds every kind; a namespace is `[kind, sort, partition]`, so no two lists share a tree node.
 * An item's key is the entry's sort fields then `_creationTime`, exactly the order of the entry index for that sort,
 * which is what lets the aggregate's position hand over to the index.
 */

export const CATALOGUE_SORTS = ['name', 'created', 'updated', 'complexity'] as const;
export type CatalogueSort = (typeof CATALOGUE_SORTS)[number];
export type CatalogueDirection = 'asc' | 'desc';

/** Every list a kind is in; `'all'` is the unfiltered one, any other is a facet's (a ruleset's, for factions). */
export const ALL_PARTITION = 'all';

/** Convex search reads at most this many hits; a search or a filter the aggregate cannot narrow pages over at most this many. */
export const CATALOGUE_BOUNDED_READ = 1024;

type Entry = Doc<'catalogue_entries'>;
type OrderKey = (string | number)[];
type OrderNamespace = [string, CatalogueSort, string];

const catalogueOrder = new DirectAggregate<{ Namespace: OrderNamespace; Key: OrderKey; Id: string }>(
  components.catalogueOrder
);

/** The index each sort reads, and its fields after `kind` and `partition`, in key order. */
const SORT_INDEX = {
  name: { index: 'by_kind_partition_name', fields: ['name_key'] },
  created: { index: 'by_kind_partition_created', fields: ['created_at'] },
  updated: { index: 'by_kind_partition_updated', fields: ['updated_at'] },
  complexity: { index: 'by_kind_partition_complexity', fields: ['complexity_score', 'complexity'] },
} as const satisfies Record<CatalogueSort, { index: string; fields: readonly (keyof Entry)[] }>;

function sortValues(entry: Entry, sort: CatalogueSort): (string | number)[] {
  return SORT_INDEX[sort].fields.map((field) => (entry[field] as string | number | undefined) ?? 0);
}

function orderItem(entry: Entry, sort: CatalogueSort) {
  return {
    namespace: [entry.kind, sort, entry.partition] as OrderNamespace,
    key: [...sortValues(entry, sort), entry._creationTime],
    id: entry._id as string,
  };
}

function sameItem(left: ReturnType<typeof orderItem>, right: ReturnType<typeof orderItem>) {
  return (
    left.namespace.every((part, index) => part === right.namespace[index]) &&
    left.key.length === right.key.length &&
    left.key.every((part, index) => part === right.key[index])
  );
}

/** Keeps one aggregate item per entry per sort, in the entry's own transaction; an untouched sort key writes nothing. */
export function registerCatalogueOrderTriggers(
  triggers: Triggers<DataModel, MutationCtx>,
  sortsOf: (kind: string) => readonly CatalogueSort[]
) {
  triggers.register('catalogue_entries', async (ctx, change) => {
    const kind = change.newDoc?.kind ?? change.oldDoc?.kind;
    for (const sort of kind ? sortsOf(kind) : []) {
      const before = change.oldDoc ? orderItem(change.oldDoc, sort) : null;
      const after = change.newDoc ? orderItem(change.newDoc, sort) : null;
      if (before && after) {
        if (!sameItem(before, after)) {
          await catalogueOrder.replaceOrInsert(ctx, before, after);
        }
      } else if (before) {
        await catalogueOrder.deleteIfExists(ctx, before);
      } else if (after) {
        await catalogueOrder.insertIfDoesNotExist(ctx, after);
      }
    }
  });
}

/** Repair: puts back any item an entry should have; the backfill's entries reach the aggregate through the trigger instead. */
export async function insertMissingOrderItems(ctx: MutationCtx, entry: Entry, sorts: readonly CatalogueSort[]) {
  for (const sort of sorts) {
    await catalogueOrder.insertIfDoesNotExist(ctx, orderItem(entry, sort));
  }
}

/** The sorts whose aggregate item for this entry is missing; the drift check's view of the aggregate. */
export async function missingOrderItems(ctx: QueryCtx, entry: Entry, sorts: readonly CatalogueSort[]) {
  const missing: CatalogueSort[] = [];
  for (const sort of sorts) {
    const { namespace, key, id } = orderItem(entry, sort);
    const found = await catalogueOrder.count(ctx, {
      namespace,
      bounds: { lower: { key, id, inclusive: true }, upper: { key, id, inclusive: true } },
    });
    if (found !== 1) {
      missing.push(sort);
    }
  }
  return missing;
}

export async function countCataloguePartitions(ctx: QueryCtx, kind: string, partitions: string[]) {
  return await catalogueOrder.countBatch(
    ctx,
    partitions.map((partition) => ({ namespace: [kind, 'name', partition] as OrderNamespace }))
  );
}

/* The index range builder is typed per index; the seek below walks any of the four sort indexes, hence this one narrow view of it. */
type IndexRange = {
  eq: (field: string, value: unknown) => IndexRange;
  gt: (field: string, value: unknown) => IndexRange;
  gte: (field: string, value: unknown) => IndexRange;
  lt: (field: string, value: unknown) => IndexRange;
  lte: (field: string, value: unknown) => IndexRange;
};
type OrderedRead = { take: (n: number) => Promise<Entry[]> };

function orderedEntries(
  ctx: QueryCtx,
  sort: CatalogueSort,
  direction: CatalogueDirection,
  range: (q: IndexRange) => IndexRange
): OrderedRead {
  const table = ctx.db.query('catalogue_entries') as unknown as {
    withIndex: (
      index: string,
      range: (q: IndexRange) => IndexRange
    ) => { order: (o: CatalogueDirection) => OrderedRead };
  };
  return table.withIndex(SORT_INDEX[sort].index, range).order(direction);
}

/**
 * Up to `limit` entries from the one at `start` onward, in index order.
 * The key is the sort fields then `_creationTime`, so "from here on" is one range per key position, deepest first: the rest of the exact tie, then each shorter prefix with the next field strictly past.
 * `stop` caps the first sort field (a complexity range's far edge on the complexity sort).
 */
async function seek(
  ctx: QueryCtx,
  scope: { kind: string; partition: string; sort: CatalogueSort; direction: CatalogueDirection },
  start: OrderKey,
  limit: number,
  stop?: number
) {
  const { kind, partition, sort, direction } = scope;
  const fields: string[] = [...SORT_INDEX[sort].fields, '_creationTime'];
  const entries: Entry[] = [];
  for (let depth = fields.length - 1; depth >= 0 && entries.length < limit; depth -= 1) {
    const read = await orderedEntries(ctx, sort, direction, (q) => {
      let range = q.eq('kind', kind).eq('partition', partition);
      for (let index = 0; index < depth; index += 1) {
        range = range.eq(fields[index]!, start[index]);
      }
      const field = fields[depth]!;
      const inclusive = depth === fields.length - 1;
      range =
        direction === 'asc'
          ? inclusive
            ? range.gte(field, start[depth])
            : range.gt(field, start[depth])
          : inclusive
            ? range.lte(field, start[depth])
            : range.lt(field, start[depth]);
      if (depth === 0 && stop !== undefined) {
        range = direction === 'asc' ? range.lte(field, stop) : range.gte(field, stop);
      }
      return range;
    }).take(limit - entries.length);
    entries.push(...read);
  }
  return entries;
}

export type CataloguePageRequest = {
  kind: string;
  partition: string;
  sort: CatalogueSort;
  direction: CatalogueDirection;
  /** From 1. */
  page: number;
  pageSize: number;
  /** Text search; the hits keep Convex's relevance order unless `relevance` is false. */
  search?: { text: string; relevance: boolean };
  /** An inclusive range of `complexity_score`. */
  complexity?: [number, number];
};

export type CataloguePageSelection = {
  entries: Entry[];
  total: number;
  /** False when the answer is drawn from the first `CATALOGUE_BOUNDED_READ` matches only, so the real total may be larger. */
  exact: boolean;
};

function compareBy(sort: CatalogueSort, direction: CatalogueDirection) {
  const sign = direction === 'asc' ? 1 : -1;
  return (left: Entry, right: Entry) => {
    const a = [...sortValues(left, sort), left._creationTime];
    const b = [...sortValues(right, sort), right._creationTime];
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) {
        return sign * (a[index]! < b[index]! ? -1 : 1);
      }
    }
    return 0;
  };
}

/**
 * One page of one list, exact at any size whenever the aggregate can count it: no search and no complexity range, or a complexity range on the complexity sort.
 * A search, or a complexity range on another sort, reads at most `CATALOGUE_BOUNDED_READ` matches and pages over them in memory.
 */
export async function selectCataloguePage(
  ctx: QueryCtx,
  request: CataloguePageRequest
): Promise<CataloguePageSelection> {
  const { kind, partition, sort, direction, pageSize } = request;
  const offset = (Math.max(1, Math.floor(request.page)) - 1) * pageSize;
  const range = request.complexity;

  if (!request.search && (!range || sort === 'complexity')) {
    const namespace: OrderNamespace = [kind, sort, partition];
    /* Complexity values sit in [0, 1] and creation times are positive, so these keys bracket every item of the score range. */
    const bounds = range
      ? {
          lower: { key: [range[0], -1, -1], inclusive: true },
          upper: { key: [range[1], 2, Number.MAX_VALUE], inclusive: true },
        }
      : undefined;
    const total = await catalogueOrder.count(ctx, { namespace, bounds });
    if (offset >= total) {
      return { entries: [], total, exact: true };
    }
    const item = await catalogueOrder.at(ctx, direction === 'asc' ? offset : -offset - 1, { namespace, bounds });
    const stop = range ? (direction === 'asc' ? range[1] : range[0]) : undefined;
    const entries = await seek(ctx, { kind, partition, sort, direction }, item.key, pageSize, stop);
    return { entries, total, exact: true };
  }

  const read = request.search
    ? await ctx.db
        .query('catalogue_entries')
        .withSearchIndex('search_text', (q) =>
          q.search('search_text', request.search!.text).eq('kind', kind).eq('partition', partition)
        )
        .take(CATALOGUE_BOUNDED_READ)
    : await ctx.db
        .query('catalogue_entries')
        .withIndex('by_kind_partition_complexity', (q) =>
          q
            .eq('kind', kind)
            .eq('partition', partition)
            .gte('complexity_score', range![0])
            .lte('complexity_score', range![1])
        )
        .take(CATALOGUE_BOUNDED_READ);
  const exact = read.length < CATALOGUE_BOUNDED_READ;
  const matches = range
    ? read.filter((entry) => (entry.complexity_score ?? 0) >= range[0] && (entry.complexity_score ?? 0) <= range[1])
    : read;
  if (!request.search?.relevance) {
    matches.sort(compareBy(sort, direction));
  }
  return { entries: matches.slice(offset, offset + pageSize), total: matches.length, exact };
}
