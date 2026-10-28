import { DirectAggregate } from '@convex-dev/aggregate';
import type { Triggers } from 'convex-helpers/server/triggers';
import type { PaginationOptions } from 'convex/server';

import { components } from '../_generated/api';
import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { canonicalJson } from './canonicalJson';

type Job = Doc<'publication_jobs'>;
type Listing = Doc<'publication_job_listings'>;
type Fields = Omit<Listing, '_id' | '_creationTime'>;
type Status = Job['status'];
type Namespace = [Status, 'all'] | [Status, 'type', string];
type Key = [number, number, Id<'publication_jobs'>];

const STATUS_ORDER = ['error', 'in_progress', 'pending'] as const;
const order = new DirectAggregate<{ Namespace: Namespace; Key: Key; Id: Id<'publication_job_listings'> }>(
  components.publicationQueue
);

function fields(job: Job): Fields {
  return {
    job_id: job._id,
    job_creation_time: job._creationTime,
    asset_type: job.asset_type,
    asset_id: job.asset_id,
    status: job.status,
    attempt_counter: job.attempt_counter,
    expires_at: job.expires_at,
    error: job.error,
    created_at: job.created_at,
    updated_at: job.updated_at,
  };
}

/** Reconciles metadata only; render-payload edits do not invalidate the listing. */
export async function syncPublicationJobListing(ctx: MutationCtx, jobId: Id<'publication_jobs'>, job: Job | null) {
  const previous = await ctx.db
    .query('publication_job_listings')
    .withIndex('by_job', (q) => q.eq('job_id', jobId))
    .unique();
  if (!job) {
    if (previous) {
      await ctx.db.delete(previous._id);
    }
    return;
  }
  const next = fields(job);
  if (!previous) {
    await ctx.db.insert('publication_job_listings', next);
    return;
  }
  const { _id, _creationTime: _creation, ...stored } = previous;
  if (canonicalJson(stored) !== canonicalJson(next)) {
    await ctx.db.replace(_id, next);
  }
}

function item(row: Listing, namespace: Namespace) {
  return {
    namespace,
    key: [row.created_at, row.job_creation_time, row.job_id] as Key,
    id: row._id,
  };
}

function namespaces(row: Listing): Namespace[] {
  return [
    [row.status, 'all'],
    [row.status, 'type', row.asset_type],
  ];
}

type OrderItem = ReturnType<typeof item>;

async function syncOrderItem(ctx: MutationCtx, before: OrderItem | null, after: OrderItem | null) {
  if (canonicalJson(before) === canonicalJson(after)) {
    return;
  }
  if (before && after) {
    await order.replaceOrInsert(ctx, before, after);
    return;
  }
  if (before) {
    await order.deleteIfExists(ctx, before);
    return;
  }
  if (after) {
    await order.insertIfDoesNotExist(ctx, after);
  }
}

function orderItem(row: Listing | null, index: number) {
  return row ? item(row, namespaces(row)[index]!) : null;
}

/** Queue writes, their small listing rows and both ordered indexes share one transaction. */
export function registerPublicationJobListingTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  triggers.register('publication_jobs', async (ctx, change) => {
    await syncPublicationJobListing(ctx, change.id, change.newDoc);
  });
  triggers.register('publication_job_listings', async (ctx, change) => {
    for (const index of [0, 1]) {
      await syncOrderItem(ctx, orderItem(change.oldDoc, index), orderItem(change.newDoc, index));
    }
  });
}

/** The verifier checks both membership and metadata before enabling indexed reads. */
export async function assertPublicationJobListing(ctx: QueryCtx, job: Job) {
  const listing = await ctx.db
    .query('publication_job_listings')
    .withIndex('by_job', (q) => q.eq('job_id', job._id))
    .unique();
  if (!listing) {
    throw new Error('Publication job listing is missing');
  }
  const { _id: _listingId, _creationTime: _creation, ...stored } = listing;
  if (canonicalJson(stored) !== canonicalJson(fields(job))) {
    throw new Error('Publication job listing metadata differs');
  }
  for (const namespace of namespaces(listing)) {
    const { key, id } = item(listing, namespace);
    const count = await order.count(ctx, {
      namespace,
      bounds: { lower: { key, id, inclusive: true }, upper: { key, id, inclusive: true } },
    });
    if (count !== 1) {
      throw new Error('Publication job listing order is missing');
    }
  }
}

/** Legacy reads remain available until the backfill and its verifier have both completed. */
async function legacyPage(ctx: QueryCtx, args: PageArgs) {
  const rows = await Promise.all(
    STATUS_ORDER.map(async (status) =>
      ctx.db
        .query('publication_jobs')
        .withIndex('by_status_and_created_at', (q) => q.eq('status', status))
        .take(1000)
    )
  );
  const jobs = rows
    .flat()
    .filter(
      (row) =>
        (args.status === undefined || row.status === args.status) &&
        (args.assetType === undefined || row.asset_type === args.assetType)
    );
  const [error, inProgress, pending] = rows.map((group) => group.length);
  const page = Math.max(1, Math.min(Math.ceil(jobs.length / args.pageSize), args.page));
  const offset = (page - 1) * args.pageSize;
  return {
    counts: { error: error!, inProgress: inProgress!, pending: pending! },
    total: jobs.length,
    page,
    jobs: jobs.slice(offset, offset + args.pageSize).map(fields),
  };
}

type PageArgs = { status?: Status; assetType?: string; page: number; pageSize: number };

/** Verification enables metadata reads for new traversals. */
async function listingsReady(ctx: QueryCtx) {
  const marker = await ctx.db
    .query('migration_runs')
    .withIndex('by_migration_id', (q) => q.eq('migration_id', 'publication_job_listings_verify_v1'))
    .unique();
  return marker?.state === 'success' && marker.is_done;
}

function namespaceFor(status: Status, assetType?: string): Namespace {
  return assetType === undefined ? [status, 'all'] : [status, 'type', assetType];
}

function queueCounts(ctx: QueryCtx, assetType?: string) {
  return order.countBatch(
    ctx,
    STATUS_ORDER.map((status) => ({ namespace: namespaceFor(status, assetType) }))
  );
}

async function listingRow(ctx: QueryCtx, id: Id<'publication_job_listings'>) {
  const row = await ctx.db.get('publication_job_listings', id);
  if (!row) {
    throw new Error('Publication queue index references a missing listing');
  }
  return row;
}

async function pageJobs(
  ctx: QueryCtx,
  groups: { namespace: Namespace; count: number }[],
  offset: number,
  size: number
) {
  const jobs: Fields[] = [];
  for (const { namespace, count } of groups) {
    if (jobs.length >= size) {
      break;
    }
    if (offset >= count) {
      offset -= count;
      continue;
    }
    const first = await order.at(ctx, offset, { namespace });
    const { page } = await order.paginate(ctx, {
      namespace,
      bounds: { lower: { key: first.key, id: first.id, inclusive: true } },
      pageSize: Math.min(size - jobs.length, count - offset),
    });
    for (const entry of page) {
      jobs.push(await listingRow(ctx, entry.id));
    }
    offset = 0;
  }
  return jobs;
}

/** Exact counts and page offsets read the aggregate; only the displayed metadata rows are hydrated. */
export async function publicationJobListingPage(ctx: QueryCtx, args: PageArgs) {
  if (!(await listingsReady(ctx))) {
    return await legacyPage(ctx, args);
  }
  const allCounts = await queueCounts(ctx);
  const [error, inProgress, pending] = allCounts;
  const selectedCounts = args.assetType === undefined ? allCounts : await queueCounts(ctx, args.assetType);
  const groups = STATUS_ORDER.map((status, index) => ({
    status,
    namespace: namespaceFor(status, args.assetType),
    count: selectedCounts[index]!,
  })).filter((group) => args.status === undefined || group.status === args.status);
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  const page = Math.max(1, Math.min(Math.ceil(total / args.pageSize), args.page));
  const jobs = await pageJobs(ctx, groups, (page - 1) * args.pageSize, args.pageSize);
  return { counts: { error: error!, inProgress: inProgress!, pending: pending! }, total, jobs, page };
}

async function countJobs(ctx: QueryCtx, status: 'pending' | 'in_progress' | 'error') {
  const start = (await ctx.meta.getTransactionMetrics()).bytesRead.remaining;
  let value = 0;
  for await (const _job of ctx.db
    .query('publication_jobs')
    .withIndex('by_status_and_created_at', (q) => q.eq('status', status))) {
    value += 1;
    if (value >= 1000 || start - (await ctx.meta.getTransactionMetrics()).bytesRead.remaining >= 2_000_000) {
      return { value, limited: true };
    }
  }
  return { value, limited: false };
}

const LISTING_CURSOR = 'publication-listing-v1:';

type Filters = { status?: Status; assetType?: string };

function metadataQuery(ctx: QueryCtx, args: Filters) {
  if (args.assetType === undefined) {
    return ctx.db
      .query('publication_job_listings')
      .withIndex('by_status_created_at_job_creation_time', (q) =>
        args.status === undefined ? q : q.eq('status', args.status)
      );
  }
  return ctx.db
    .query('publication_job_listings')
    .withIndex('by_asset_type_status_created_at_job_creation_time', (q) => {
      const byAsset = q.eq('asset_type', args.assetType!);
      return args.status === undefined ? byAsset : byAsset.eq('status', args.status);
    });
}

function sourceQuery(ctx: QueryCtx, args: Filters) {
  if (args.assetType === undefined) {
    return ctx.db
      .query('publication_jobs')
      .withIndex('by_status_and_created_at', (q) => (args.status === undefined ? q : q.eq('status', args.status)));
  }
  return ctx.db.query('publication_jobs').withIndex('by_asset_type_status_created_at', (q) => {
    const byAsset = q.eq('asset_type', args.assetType!);
    return args.status === undefined ? byAsset : byAsset.eq('status', args.status);
  });
}

function decodeCursor(cursor: string | null | undefined, indexed: boolean) {
  if (cursor == null) {
    return cursor;
  }
  if (cursor.startsWith(LISTING_CURSOR) !== indexed) {
    throw new Error('Publication page cursors use different sources');
  }
  return indexed ? cursor.slice(LISTING_CURSOR.length) : cursor;
}

function encodeCursor(cursor: string, indexed: boolean) {
  return indexed ? LISTING_CURSOR + cursor : cursor;
}

function cursorOptions(options: PaginationOptions, indexed: boolean): PaginationOptions {
  return {
    ...options,
    cursor: decodeCursor(options.cursor, indexed) ?? null,
    endCursor: decodeCursor(options.endCursor, indexed),
    numItems: Number.isFinite(options.numItems) ? Math.max(1, Math.min(100, Math.floor(options.numItems))) : 1,
    maximumBytesRead: Math.min(options.maximumBytesRead ?? 2_000_000, 2_000_000),
  };
}

async function cursorCounts(ctx: QueryCtx, ready: boolean) {
  const counts = ready
    ? (await queueCounts(ctx)).map((value) => ({ value, limited: false }))
    : [await countJobs(ctx, 'error'), await countJobs(ctx, 'in_progress'), await countJobs(ctx, 'pending')];
  return { error: counts[0]!, inProgress: counts[1]!, pending: counts[2]! };
}

/** A cursor keeps its source for the whole traversal, including across the backfill cutover. */
export async function publicationJobListing(ctx: QueryCtx, args: Filters & { paginationOpts: PaginationOptions }) {
  const ready = await listingsReady(ctx);
  const boundary = args.paginationOpts.cursor ?? args.paginationOpts.endCursor;
  const indexed = boundary ? boundary.startsWith(LISTING_CURSOR) : ready;
  const options = cursorOptions(args.paginationOpts, indexed);
  const query = indexed ? metadataQuery(ctx, args) : sourceQuery(ctx, args);
  const jobs = await query.paginate(options);
  return {
    ...jobs,
    continueCursor: encodeCursor(jobs.continueCursor, indexed),
    ...(jobs.splitCursor != null ? { splitCursor: encodeCursor(jobs.splitCursor, indexed) } : {}),
    page: jobs.page.map((row) => ('job_id' in row ? row : fields(row))),
    counts: await cursorCounts(ctx, ready),
  };
}
