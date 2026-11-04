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

/** The verifier checks both membership and metadata. */
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

type Filters = { status?: Status; assetType?: string };

/** Exact queue counts per status, read from the aggregate. */
async function queueCounts(ctx: QueryCtx) {
  const [error, inProgress, pending] = await order.countBatch(
    ctx,
    STATUS_ORDER.map((status) => ({ namespace: [status, 'all'] as Namespace }))
  );
  return { error: error!, inProgress: inProgress!, pending: pending! };
}

function listingQuery(ctx: QueryCtx, args: Filters) {
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

function boundedOptions(options: PaginationOptions): PaginationOptions {
  return {
    ...options,
    numItems: Number.isFinite(options.numItems) ? Math.max(1, Math.min(100, Math.floor(options.numItems))) : 1,
    maximumBytesRead: Math.min(options.maximumBytesRead ?? 2_000_000, 2_000_000),
  };
}

/** One page of the queue's small listing rows, with exact counts per status. */
export async function publicationJobListing(ctx: QueryCtx, args: Filters & { paginationOpts: PaginationOptions }) {
  const jobs = await listingQuery(ctx, args).paginate(boundedOptions(args.paginationOpts));
  return { ...jobs, counts: await queueCounts(ctx) };
}
