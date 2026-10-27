import { DirectAggregate } from '@convex-dev/aggregate';
import type { Triggers } from 'convex-helpers/server/triggers';

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
  const offset = (args.page - 1) * args.pageSize;
  return {
    counts: { error: error!, inProgress: inProgress!, pending: pending! },
    total: jobs.length,
    jobs: jobs.slice(offset, offset + args.pageSize).map(fields),
  };
}

type PageArgs = { status?: Status; assetType?: string; page: number; pageSize: number };

/** Exact counts and page offsets read the aggregate; only the displayed metadata rows are hydrated. */
export async function publicationJobListingPage(ctx: QueryCtx, args: PageArgs) {
  const marker = await ctx.db
    .query('migration_runs')
    .withIndex('by_migration_id', (q) => q.eq('migration_id', 'publication_job_listings_verify_v1'))
    .unique();
  if (marker?.state !== 'success' || !marker.is_done) {
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
  let offset = (args.page - 1) * args.pageSize;
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
  return { counts: { error, inProgress, pending }, total, jobs };
}
