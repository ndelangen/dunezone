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
  } else {
    const { _id, _creationTime: _creation, ...stored } = previous;
    if (canonicalJson(stored) !== canonicalJson(next)) {
      await ctx.db.replace(_id, next);
    }
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

/** Queue writes, their small listing rows and both ordered indexes share one transaction. */
export function registerPublicationJobListingTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  triggers.register('publication_jobs', async (ctx, change) => {
    await syncPublicationJobListing(ctx, change.id, change.newDoc);
  });
  triggers.register('publication_job_listings', async (ctx, change) => {
    for (const index of [0, 1]) {
      const before = change.oldDoc ? item(change.oldDoc, namespaces(change.oldDoc)[index]!) : null;
      const after = change.newDoc ? item(change.newDoc, namespaces(change.newDoc)[index]!) : null;
      if (before && after) {
        if (canonicalJson(before) !== canonicalJson(after)) {
          await order.replaceOrInsert(ctx, before, after);
        }
      } else if (before) {
        await order.deleteIfExists(ctx, before);
      } else if (after) {
        await order.insertIfDoesNotExist(ctx, after);
      }
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

/** Exact counts and page offsets read the aggregate; only the displayed metadata rows are hydrated. */
async function listingsReady(ctx: QueryCtx) {
  const marker = await ctx.db
    .query('migration_runs')
    .withIndex('by_migration_id', (q) => q.eq('migration_id', 'publication_job_listings_verify_v1'))
    .unique();
  return marker?.state === 'success' && marker.is_done;
}

export async function publicationJobListingPage(ctx: QueryCtx, args: PageArgs) {
  if (!(await listingsReady(ctx))) {
    return await legacyPage(ctx, args);
  }
  const allCounts = await order.countBatch(
    ctx,
    STATUS_ORDER.map((status) => ({ namespace: [status, 'all'] as Namespace }))
  );
  const [error = 0, inProgress = 0, pending = 0] = allCounts;
  const selectedCounts =
    args.assetType === undefined
      ? allCounts
      : await order.countBatch(
          ctx,
          STATUS_ORDER.map((status) => ({ namespace: [status, 'type', args.assetType!] as Namespace }))
        );
  const selected = STATUS_ORDER.map((status, index) => ({
    status,
    count: args.status === undefined || status === args.status ? (selectedCounts[index] ?? 0) : 0,
  }));
  const total = selected.reduce((sum, group) => sum + group.count, 0);
  const pageNumber = Math.max(1, Math.min(Math.ceil(total / args.pageSize), args.page));
  let offset = (pageNumber - 1) * args.pageSize;
  const jobs: Fields[] = [];
  for (const group of selected) {
    if (jobs.length >= args.pageSize) {
      break;
    }
    if (offset >= group.count) {
      offset -= group.count;
      continue;
    }
    const namespace: Namespace =
      args.assetType === undefined ? [group.status, 'all'] : [group.status, 'type', args.assetType];
    const first = await order.at(ctx, offset, { namespace });
    const { page } = await order.paginate(ctx, {
      namespace,
      bounds: { lower: { key: first.key, id: first.id, inclusive: true } },
      pageSize: Math.min(args.pageSize - jobs.length, group.count - offset),
    });
    for (const entry of page) {
      const row = await ctx.db.get('publication_job_listings', entry.id);
      if (!row) {
        throw new Error('Publication queue index references a missing listing');
      }
      jobs.push(row);
    }
    offset = 0;
  }
  return { counts: { error, inProgress, pending }, total, jobs, page: pageNumber };
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

/** A cursor keeps its source for the whole traversal, including across the backfill cutover. */
export async function publicationJobListing(
  ctx: QueryCtx,
  args: { status?: Status; assetType?: string; paginationOpts: PaginationOptions }
) {
  const ready = await listingsReady(ctx);
  const boundary = args.paginationOpts.cursor ?? args.paginationOpts.endCursor;
  const indexed = boundary ? boundary.startsWith(LISTING_CURSOR) : ready;
  const decode = (cursor: string | null | undefined) => {
    if (cursor == null) {
      return cursor;
    }
    if (cursor.startsWith(LISTING_CURSOR) !== indexed) {
      throw new Error('Publication page cursors use different sources');
    }
    return indexed ? cursor.slice(LISTING_CURSOR.length) : cursor;
  };
  const paginationOpts = {
    ...args.paginationOpts,
    cursor: decode(args.paginationOpts.cursor) ?? null,
    endCursor: decode(args.paginationOpts.endCursor),
    numItems: Number.isFinite(args.paginationOpts.numItems)
      ? Math.max(1, Math.min(100, Math.floor(args.paginationOpts.numItems)))
      : 1,
    maximumBytesRead: Math.min(args.paginationOpts.maximumBytesRead ?? 2_000_000, 2_000_000),
  };
  const jobs = indexed
    ? await (
        args.assetType === undefined
          ? ctx.db
              .query('publication_job_listings')
              .withIndex('by_status_created_at_job_creation_time', (q) =>
                args.status === undefined ? q : q.eq('status', args.status)
              )
          : ctx.db
              .query('publication_job_listings')
              .withIndex('by_asset_type_status_created_at_job_creation_time', (q) => {
                const byAsset = q.eq('asset_type', args.assetType!);
                return args.status === undefined ? byAsset : byAsset.eq('status', args.status);
              })
      ).paginate(paginationOpts)
    : await (
        args.assetType === undefined
          ? ctx.db
              .query('publication_jobs')
              .withIndex('by_status_and_created_at', (q) =>
                args.status === undefined ? q : q.eq('status', args.status)
              )
          : ctx.db.query('publication_jobs').withIndex('by_asset_type_status_created_at', (q) => {
              const byAsset = q.eq('asset_type', args.assetType!);
              return args.status === undefined ? byAsset : byAsset.eq('status', args.status);
            })
      ).paginate(paginationOpts);
  const counts = ready
    ? (
        await order.countBatch(
          ctx,
          STATUS_ORDER.map((status) => ({ namespace: [status, 'all'] as Namespace }))
        )
      ).map((value) => ({ value, limited: false }))
    : [await countJobs(ctx, 'error'), await countJobs(ctx, 'in_progress'), await countJobs(ctx, 'pending')];
  return {
    ...jobs,
    continueCursor: indexed ? LISTING_CURSOR + jobs.continueCursor : jobs.continueCursor,
    ...(jobs.splitCursor != null
      ? { splitCursor: indexed ? LISTING_CURSOR + jobs.splitCursor : jobs.splitCursor }
      : {}),
    page: jobs.page.map((row) => ('job_id' in row ? row : fields(row))),
    counts: { error: counts[0]!, inProgress: counts[1]!, pending: counts[2]! },
  };
}
