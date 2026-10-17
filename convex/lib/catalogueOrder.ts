import { DirectAggregate } from '@convex-dev/aggregate';
import type { Triggers } from 'convex-helpers/server/triggers';

import { components } from '../_generated/api';
import type { DataModel, Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

/*
 * The catalogue's ordered access, the Convex way: `@convex-dev/aggregate` counts a list, finds the entry at any offset in O(log n), and walks the page on from it.
 * One aggregate instance holds every kind; a namespace is `[kind, sort, partition]`, so no two lists share a tree node.
 * An item's key is the entry's sort fields then `_creationTime`, its id the entry's id; the page reads its entries by those ids.
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
export type OrderNamespace = [string, CatalogueSort, string];

const catalogueOrder = new DirectAggregate<{ Namespace: OrderNamespace; Key: OrderKey; Id: string }>(
  components.catalogueOrder
);

/** The entry fields each sort orders by, in key order. */
const SORT_FIELDS = {
  name: ['name_key'],
  created: ['created_at'],
  updated: ['updated_at'],
  complexity: ['complexity_score', 'complexity'],
} as const satisfies Record<CatalogueSort, readonly (keyof Entry)[]>;

function sortValues(entry: Entry, sort: CatalogueSort): (string | number)[] {
  return SORT_FIELDS[sort].map((field) => entry[field]);
}

function orderItem(entry: Entry, sort: CatalogueSort) {
  return {
    namespace: [entry.kind, sort, entry.partition] as OrderNamespace,
    key: [...sortValues(entry, sort), entry._creationTime],
    id: entry._id as string,
  };
}

function sameItem(left: OrderItem, right: OrderItem) {
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
      await moveOrderItem(
        ctx,
        change.oldDoc ? orderItem(change.oldDoc, sort) : null,
        change.newDoc ? orderItem(change.newDoc, sort) : null
      );
    }
  });
}

type OrderItem = ReturnType<typeof orderItem>;

async function moveOrderItem(ctx: MutationCtx, before: OrderItem | null, after: OrderItem | null) {
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

/** Puts back any item an entry should have, which an entry written without its trigger lacks. */
export async function insertMissingOrderItems(ctx: MutationCtx, entry: Entry, sorts: readonly CatalogueSort[]) {
  for (const sort of sorts) {
    await catalogueOrder.insertIfDoesNotExist(ctx, orderItem(entry, sort));
  }
}

/**
 * Removes the items of one namespace page whose entry is gone or now keyed elsewhere, which only an entry removed without its trigger leaves.
 * Returns where to continue;
 * the caller walks every namespace.
 */
export async function pruneOrderItems(
  ctx: MutationCtx,
  namespace: OrderNamespace,
  cursor: string | undefined,
  pageSize: number
) {
  const page = await catalogueOrder.paginate(ctx, { namespace, cursor, pageSize });
  let pruned = 0;
  for (const item of page.page) {
    const id = ctx.db.normalizeId('catalogue_entries', item.id);
    const entry = id ? await ctx.db.get('catalogue_entries', id) : null;
    if (!entry || !sameItem(orderItem(entry, namespace[1]), { namespace, key: item.key, id: item.id })) {
      await catalogueOrder.deleteIfExists(ctx, { namespace, key: item.key, id: item.id });
      pruned += 1;
    }
  }
  return { cursor: page.cursor, isDone: page.isDone, pruned };
}

/** The namespace after `cursor`, one per call, so a walk over every list reads one namespace a step however many lists there are. */
export async function nextOrderNamespace(ctx: QueryCtx, cursor: string | undefined) {
  const { page, cursor: next, isDone } = await catalogueOrder.paginateNamespaces(ctx, cursor, 1);
  return { namespace: page[0], cursor: next, isDone };
}

/** How many items the aggregate holds for one list in one order; the drift report compares it with the entries to find leftovers. */
export async function countOrderItems(ctx: QueryCtx, namespace: OrderNamespace) {
  return await catalogueOrder.count(ctx, { namespace });
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
  /** An inclusive range of `complexity_score`, 0 to 10. */
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

/* Complexity values sit in [0, 1] and creation times are positive, so these keys bracket every item of the score range. */
function complexityBounds(range: [number, number]) {
  return {
    lower: { key: [range[0], -1, -1], inclusive: true },
    upper: { key: [range[1], 2, Number.MAX_VALUE], inclusive: true },
  };
}

/**
 * The aggregate counts the list, names the entry at the offset, and walks on from it for the rest of the page;
 * the page's entries are then read by id, so the page is exactly the aggregate's order and never the index's.
 */
async function aggregatePage(ctx: QueryCtx, request: CataloguePageRequest, offset: number) {
  const { kind, partition, sort, direction, pageSize, complexity: range } = request;
  const namespace: OrderNamespace = [kind, sort, partition];
  const bounds = range ? complexityBounds(range) : {};
  const total = await catalogueOrder.count(ctx, { namespace, bounds });
  if (offset >= total) {
    return { entries: [], total, exact: true };
  }
  const first = await catalogueOrder.at(ctx, direction === 'asc' ? offset : -offset - 1, { namespace, bounds });
  const from = { key: first.key, id: first.id, inclusive: true };
  const { page } = await catalogueOrder.paginate(ctx, {
    namespace,
    bounds: direction === 'asc' ? { ...bounds, lower: from } : { ...bounds, upper: from },
    order: direction,
    pageSize,
  });
  const entries = await Promise.all(
    page.map(async (item) => {
      const id = ctx.db.normalizeId('catalogue_entries', item.id);
      return id ? await ctx.db.get('catalogue_entries', id) : null;
    })
  );
  return { entries: entries.filter((entry) => entry !== null), total, exact: true };
}

function searchWords(text: string): string[] {
  return [...(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
}

/**
 * Convex search returns entries matching any word of the query;
 * the catalogue keeps those matching every word, the last as a prefix, as a reader expects.
 * A query with no word at all matches everything, as the search index would return nothing to filter.
 */
function matchesEveryWord(query: string) {
  const words = searchWords(query);
  const last = words.pop();
  return (entry: Entry) => {
    const entryWords = searchWords(entry.search_text);
    return (
      words.every((word) => entryWords.includes(word)) &&
      (last === undefined || entryWords.some((word) => word.startsWith(last)))
    );
  };
}

/** At most `CATALOGUE_BOUNDED_READ` matches, from the search index or the complexity index, ordered and paged in memory. */
async function boundedPage(ctx: QueryCtx, request: CataloguePageRequest, offset: number) {
  const { kind, partition, sort, direction, pageSize, search } = request;
  const range = request.complexity;
  const read = search
    ? await ctx.db
        .query('catalogue_entries')
        .withSearchIndex('search_text', (q) =>
          q.search('search_text', search.text).eq('kind', kind).eq('partition', partition)
        )
        .take(CATALOGUE_BOUNDED_READ)
    : await ctx.db
        .query('catalogue_entries')
        .withIndex('by_kind_partition_complexity', (q) =>
          q
            .eq('kind', kind)
            .eq('partition', partition)
            .gte('complexity_score', range?.[0] ?? 0)
            .lte('complexity_score', range?.[1] ?? 10)
        )
        .take(CATALOGUE_BOUNDED_READ);
  const inRange = range
    ? read.filter((entry) => entry.complexity_score >= range[0] && entry.complexity_score <= range[1])
    : read;
  const matches = search ? inRange.filter(matchesEveryWord(search.text)) : inRange;
  if (!search?.relevance) {
    matches.sort(compareBy(sort, direction));
  }
  return {
    entries: matches.slice(offset, offset + pageSize),
    total: matches.length,
    exact: read.length < CATALOGUE_BOUNDED_READ,
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
  const offset = (Math.max(1, Math.floor(request.page)) - 1) * request.pageSize;
  const countable = !request.search && (!request.complexity || request.sort === 'complexity');
  return countable ? await aggregatePage(ctx, request, offset) : await boundedPage(ctx, request, offset);
}
