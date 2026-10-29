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

/** Convex search reads at most this many hits; a filter the aggregate cannot narrow pages over at most this many. */
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

/* Convex full-text search refuses a query of more than this many terms. */
const SEARCH_TERM_LIMIT = 16;

/** The query as the search index takes it: its first terms only, so a long query narrows by those and the every-word filter checks the rest. */
export function searchIndexText(text: string) {
  const words = searchWords(text);
  return words.length > SEARCH_TERM_LIMIT ? words.slice(0, SEARCH_TERM_LIMIT).join(' ') : text;
}

/** At most `CATALOGUE_BOUNDED_READ` candidates in the complexity range, from the complexity index. */
async function readBounded(ctx: QueryCtx, request: CataloguePageRequest) {
  const { kind, partition } = request;
  const [low, high] = request.complexity ?? [0, 10];
  return await ctx.db
    .query('catalogue_entries')
    .withIndex('by_kind_partition_complexity', (q) =>
      q.eq('kind', kind).eq('partition', partition).gte('complexity_score', low).lte('complexity_score', high)
    )
    .take(CATALOGUE_BOUNDED_READ);
}

/** At most `CATALOGUE_BOUNDED_READ` matches, ordered and paged in memory. */
async function boundedPage(ctx: QueryCtx, request: CataloguePageRequest, offset: number) {
  const matches = await readBounded(ctx, request);
  matches.sort(compareBy(request.sort, request.direction));
  return {
    entries: matches.slice(offset, offset + request.pageSize),
    total: matches.length,
    exact: matches.length < CATALOGUE_BOUNDED_READ,
  };
}

/**
 * One page of one list, exact at any size whenever the aggregate can count it: no complexity range, or a complexity range on the complexity sort.
 * A complexity range on another sort reads at most `CATALOGUE_BOUNDED_READ` matches and pages over them in memory.
 * A text search is `selectCatalogueSearch`'s, never a page's.
 */
export async function selectCataloguePage(
  ctx: QueryCtx,
  request: CataloguePageRequest
): Promise<CataloguePageSelection> {
  const offset = (Math.max(1, Math.floor(request.page)) - 1) * request.pageSize;
  const countable = !request.complexity || request.sort === 'complexity';
  return countable ? await aggregatePage(ctx, request, offset) : await boundedPage(ctx, request, offset);
}

export type CatalogueSearchRequest = {
  kind: string;
  partition: string;
  /**
   * Searches several lists at once instead of `partition`, taken in turn, so one list's matches never crowd out another's;
   * the lists must not share an entry.
   */
  partitions?: string[];
  text: string;
  /** How many matches to return, in relevance order; a reader asks for more by asking again with a larger limit. */
  limit: number;
  /** An inclusive range of `complexity_score`, 0 to 10. */
  complexity?: [number, number];
  /** Keeps only the matches it returns, in their order, such as those whose owner still exists; it sees each match once. */
  keep?: (matches: Entry[]) => Promise<Entry[]>;
};

export type CatalogueSearchSelection = {
  entries: Entry[];
  /** Whether a larger limit would return more matches. */
  hasMore: boolean;
  /** Whether a list stopped at its share of the bound with more of the index unread, so matches past it may exist that no limit reaches. */
  capped: boolean;
};

/* How many steps of its page size one search shows at most: each row reads its own source, so a reactive answer stays small, and a reader past it is better served by another word. */
const CATALOGUE_SEARCH_STEPS = 10;

/** The rows a search asks for: at least one, at most the ceiling of ten steps. */
export function catalogueSearchLimit(limit: number | undefined, step: number) {
  const rows = limit !== undefined && Number.isSafeInteger(limit) && limit > 0 ? limit : step;
  return Math.min(step * CATALOGUE_SEARCH_STEPS, rows);
}

/**
 * A selection as the page reports it once the ceiling is reached: nothing more to load, and matches past it may exist that no limit reaches.
 * `limit` is the clamped one the selection was read with.
 */
export function catalogueSearchReach(
  selection: Pick<CatalogueSearchSelection, 'hasMore' | 'capped'>,
  limit: number,
  step: number
) {
  const atCeiling = selection.hasMore && limit >= step * CATALOGUE_SEARCH_STEPS;
  return { hasMore: selection.hasMore && !atCeiling, capped: selection.capped || atCeiling };
}

/* How many candidates one pull reads per match still wanted, for those the filters drop. */
const SEARCH_READ_HEADROOM = 2;

type SearchList = {
  rows: AsyncIterator<Entry>;
  read: number;
  kept: Entry[];
  done: boolean;
  capped: boolean;
};

function openSearchList(ctx: QueryCtx, request: CatalogueSearchRequest, partition: string): SearchList {
  const rows = ctx.db
    .query('catalogue_entries')
    .withSearchIndex('search_text', (q) =>
      q.search('search_text', searchIndexText(request.text)).eq('kind', request.kind).eq('partition', partition)
    )
    [Symbol.asyncIterator]();
  return { rows, read: 0, kept: [], done: false, capped: false };
}

function searchFilter(request: CatalogueSearchRequest) {
  const words = matchesEveryWord(request.text);
  const [low, high] = request.complexity ?? [0, 10];
  return (entry: Entry) => entry.complexity_score >= low && entry.complexity_score <= high && words(entry);
}

/** Reads on in one list, never again from its start, until it keeps `wanted` matches, runs out, or reaches `cap` candidates. */
async function pullSearchList(
  list: SearchList,
  request: CatalogueSearchRequest,
  matches: (entry: Entry) => boolean,
  wanted: number,
  cap: number
) {
  while (!list.done && list.kept.length < wanted) {
    const batch = Math.min(cap - list.read, (wanted - list.kept.length) * SEARCH_READ_HEADROOM);
    const matched: Entry[] = [];
    for (let index = 0; index < batch; index += 1) {
      const next = await list.rows.next();
      if (next.done) {
        list.done = true;
        break;
      }
      list.read += 1;
      if (matches(next.value)) {
        matched.push(next.value);
      }
    }
    list.kept.push(...(request.keep ? await request.keep(matched) : matched));
    if (!list.done && list.read >= cap) {
      list.done = true;
      list.capped = true;
    }
  }
}

/** Each list's entries in turn, first of each, then second of each, so each keeps its own relevance order. */
function interleave(lists: Entry[][]) {
  const longest = Math.max(0, ...lists.map((list) => list.length));
  return Array.from({ length: longest }, (_, index) => lists.flatMap((list) => list[index] ?? []));
}

/**
 * The lists taken in turn, but only as far as every unfinished list has read, so a larger limit only ever adds rows after these and Load more never reorders what is shown.
 */
function settledMatches(lists: SearchList[]) {
  const open = lists.filter((list) => !list.done);
  const rounds = open.length > 0 ? Math.min(...open.map((list) => list.kept.length)) : Infinity;
  return interleave(lists.map((list) => list.kept.slice(0, rounds))).flat();
}

/**
 * The first `limit` matches of a text search in relevance order, and whether there are more: no count, no pages and no other sort, so it reads only as much of the search index as the limit needs.
 * Several lists split the limit between them and read on only while too few rows are settled;
 * each reads at most its share of `CATALOGUE_BOUNDED_READ`, and `capped` says when that share cut a list short.
 */
export async function selectCatalogueSearch(
  ctx: QueryCtx,
  request: CatalogueSearchRequest
): Promise<CatalogueSearchSelection> {
  const partitions = [...new Set(request.partitions ?? [request.partition])];
  const cap = Math.max(1, Math.floor(CATALOGUE_BOUNDED_READ / partitions.length));
  const limit = Math.min(CATALOGUE_BOUNDED_READ, Math.max(1, Math.floor(request.limit)));
  const matches = searchFilter(request);
  /* One more than the limit says whether there are more. */
  const wanted = limit + 1;
  const lists = partitions.map((partition) => openSearchList(ctx, request, partition));
  let share = Math.ceil(wanted / lists.length);
  for (;;) {
    await Promise.all(lists.map((list) => pullSearchList(list, request, matches, share, cap)));
    const settled = settledMatches(lists);
    if (settled.length >= wanted || lists.every((list) => list.done)) {
      return {
        entries: settled.slice(0, limit),
        hasMore: settled.length > limit,
        capped: lists.some((list) => list.capped),
      };
    }
    share *= 2;
  }
}
