import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';

import { rendererRevisionsSchema } from '../src/shared/asset-publishing/publication';
import { internal } from './_generated/api';
import { internalQuery } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { adminQuery, internalMutation, mutation } from './functions';
import { requireAdminUserId } from './lib/policy';
import { publicationSettings } from './lib/publication';

const publicationStatus = v.union(v.literal('pending'), v.literal('in_progress'), v.literal('error'));

const settingsResult = v.object({
  publicationPickupEnabled: v.boolean(),
  rendererRevisions: v.record(v.string(), v.number()),
  updatedAt: v.number(),
});

function parseRendererRevisions(value: Record<string, number>) {
  const parsed = rendererRevisionsSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('Invalid Renderer revision map');
  }
  return parsed.data;
}

export const initialize = internalMutation({
  args: { rendererRevisions: v.record(v.string(), v.number()) },
  returns: settingsResult,
  handler: async (ctx, args) => {
    const rendererRevisions = parseRendererRevisions(args.rendererRevisions);
    const existing = await publicationSettings(ctx);
    if (existing) {
      return {
        publicationPickupEnabled: existing.publication_pickup_enabled,
        rendererRevisions: existing.renderer_revisions,
        updatedAt: existing.updated_at,
      };
    }
    const updatedAt = Date.now();
    await ctx.db.insert('admin_settings', {
      key: 'publication',
      publication_pickup_enabled: false,
      renderer_revisions: rendererRevisions,
      updated_at: updatedAt,
    });
    return {
      publicationPickupEnabled: false,
      rendererRevisions,
      updatedAt,
    };
  },
});

export const readRevisions = internalQuery({
  args: {},
  returns: v.union(v.record(v.string(), v.number()), v.null()),
  handler: async (ctx) => (await publicationSettings(ctx))?.renderer_revisions ?? null,
});

export const activateRevisions = internalMutation({
  args: { rendererRevisions: v.record(v.string(), v.number()) },
  returns: v.object({
    changedAssetTypes: v.array(v.string()),
    rendererRevisions: v.record(v.string(), v.number()),
  }),
  handler: async (ctx, args) => {
    const rendererRevisions = parseRendererRevisions(args.rendererRevisions);
    const settings = await publicationSettings(ctx);
    if (!settings) {
      throw new Error('Publication settings are not initialized');
    }

    for (const [assetType, storedRevision] of Object.entries(settings.renderer_revisions)) {
      const checkedInRevision = rendererRevisions[assetType];
      if (checkedInRevision === undefined || checkedInRevision < storedRevision) {
        throw new Error(`Checked-in Renderer revision for ${assetType} is behind the stored revision`);
      }
    }

    const changedAssetTypes = Object.entries(rendererRevisions)
      .filter(([assetType, revision]) => revision > (settings.renderer_revisions[assetType] ?? -1))
      .map(([assetType]) => assetType);
    if (changedAssetTypes.length === 0) {
      return {
        changedAssetTypes,
        rendererRevisions: settings.renderer_revisions,
      };
    }

    await ctx.db.patch(settings._id, {
      renderer_revisions: rendererRevisions,
      updated_at: Date.now(),
    });
    for (const assetType of changedAssetTypes) {
      await ctx.scheduler.runAfter(0, internal.publicationRegeneration.scan, {
        assetType,
        cursor: null,
        scanned: 0,
        enqueued: 0,
      });
    }
    return { changedAssetTypes, rendererRevisions };
  },
});

const countResult = v.object({ value: v.number(), limited: v.boolean() });

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

const jobResult = v.object({
  id: v.id('publication_jobs'),
  assetType: v.string(),
  assetId: v.string(),
  status: publicationStatus,
  attemptCounter: v.number(),
  expiresAt: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const listing = adminQuery({
  args: {
    status: v.optional(publicationStatus),
    assetType: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    settings: v.union(settingsResult, v.null()),
    counts: v.object({
      pending: countResult,
      inProgress: countResult,
      error: countResult,
    }),
    ...paginationResultValidator(jobResult).fields,
  }),
  handler: async (ctx, args) => {
    const query =
      args.assetType === undefined
        ? ctx.db
            .query('publication_jobs')
            .withIndex('by_status_and_created_at', (q) => (args.status === undefined ? q : q.eq('status', args.status)))
        : ctx.db.query('publication_jobs').withIndex('by_asset_type_status_created_at', (q) => {
            const byAsset = q.eq('asset_type', args.assetType!);
            return args.status === undefined ? byAsset : byAsset.eq('status', args.status);
          });
    const jobs = await query.paginate({
      ...args.paginationOpts,
      numItems: Math.max(1, Math.min(100, args.paginationOpts.numItems)),
      maximumBytesRead: Math.min(args.paginationOpts.maximumBytesRead ?? 2_000_000, 2_000_000),
    });
    const settings = await publicationSettings(ctx);
    /* Each tally has its own byte budget because a job can contain a whole board definition. */
    const pending = await countJobs(ctx, 'pending');
    const inProgress = await countJobs(ctx, 'in_progress');
    const errors = await countJobs(ctx, 'error');

    return {
      settings: settings
        ? {
            publicationPickupEnabled: settings.publication_pickup_enabled,
            rendererRevisions: settings.renderer_revisions,
            updatedAt: settings.updated_at,
          }
        : null,
      counts: {
        pending,
        inProgress,
        error: errors,
      },
      ...jobs,
      page: jobs.page.map((job) => ({
        id: job._id,
        assetType: job.asset_type,
        assetId: job.asset_id,
        status: job.status,
        attemptCounter: job.attempt_counter,
        expiresAt: job.expires_at ?? null,
        error: job.error ?? null,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      })),
    };
  },
});

/* Clients loaded before cursor pagination still call this contract until they reload.
 * The current dashboard uses listing, which has no thousand-job visibility cap.
 */
export const page = adminQuery({
  args: {
    status: v.optional(publicationStatus),
    assetType: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  returns: v.object({
    settings: v.union(settingsResult, v.null()),
    counts: v.object({
      pending: v.number(),
      inProgress: v.number(),
      error: v.number(),
    }),
    jobs: v.array(jobResult),
    total: v.number(),
    page: v.number(),
    pageSize: v.number(),
  }),
  handler: async (ctx, args) => {
    const [pending, inProgress, errors, settings] = await Promise.all([
      ctx.db
        .query('publication_jobs')
        .withIndex('by_status_and_created_at', (q) => q.eq('status', 'pending'))
        .take(1000),
      ctx.db
        .query('publication_jobs')
        .withIndex('by_status_and_created_at', (q) => q.eq('status', 'in_progress'))
        .take(1000),
      ctx.db
        .query('publication_jobs')
        .withIndex('by_status_and_created_at', (q) => q.eq('status', 'error'))
        .take(1000),
      publicationSettings(ctx),
    ]);
    const allJobs = [...errors, ...inProgress, ...pending]
      .filter((job) => args.status === undefined || job.status === args.status)
      .filter((job) => args.assetType === undefined || job.asset_type === args.assetType);
    const pageSize = Math.max(1, Math.min(100, Math.floor(args.pageSize)));
    const page = Math.max(1, Math.min(Math.ceil(allJobs.length / pageSize), Math.floor(args.page)));
    const offset = (page - 1) * pageSize;

    return {
      settings: settings
        ? {
            publicationPickupEnabled: settings.publication_pickup_enabled,
            rendererRevisions: settings.renderer_revisions,
            updatedAt: settings.updated_at,
          }
        : null,
      counts: {
        pending: pending.length,
        inProgress: inProgress.length,
        error: errors.length,
      },
      jobs: allJobs.slice(offset, offset + pageSize).map((job) => ({
        id: job._id,
        assetType: job.asset_type,
        assetId: job.asset_id,
        status: job.status,
        attemptCounter: job.attempt_counter,
        expiresAt: job.expires_at ?? null,
        error: job.error ?? null,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      })),
      total: allJobs.length,
      page,
      pageSize,
    };
  },
});

export const setPickupEnabled = mutation({
  args: { enabled: v.boolean() },
  returns: v.object({
    publicationPickupEnabled: v.boolean(),
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);
    const settings = await publicationSettings(ctx);
    if (!settings) {
      throw new Error('Publication settings are not initialized');
    }
    const updatedAt = Date.now();
    await ctx.db.patch(settings._id, {
      publication_pickup_enabled: args.enabled,
      updated_at: updatedAt,
    });
    return {
      publicationPickupEnabled: args.enabled,
      updatedAt,
    };
  },
});
