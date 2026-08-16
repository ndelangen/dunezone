import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';

import { rendererRevisionsSchema } from '../src/shared/asset-publishing/publication';
import { internal } from './_generated/api';
import { internalQuery, query } from './_generated/server';
import { internalMutation, mutation } from './functions';
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

export const page = query({
  args: {
    status: v.optional(publicationStatus),
    assetType: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  returns: v.union(
    v.object({ access: v.literal('unauthenticated') }),
    v.object({ access: v.literal('not_authorized') }),
    v.object({
      access: v.literal('admin'),
      settings: v.union(settingsResult, v.null()),
      counts: v.object({
        pending: v.number(),
        inProgress: v.number(),
        error: v.number(),
      }),
      jobs: v.array(
        v.object({
          id: v.id('publication_jobs'),
          assetType: v.string(),
          assetId: v.string(),
          status: publicationStatus,
          attemptCounter: v.number(),
          expiresAt: v.union(v.number(), v.null()),
          error: v.union(v.string(), v.null()),
          createdAt: v.number(),
          updatedAt: v.number(),
        })
      ),
      total: v.number(),
      page: v.number(),
      pageSize: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { access: 'unauthenticated' as const };
    }
    const user = await ctx.db.get('users', userId);
    if (!user?.isAdmin) {
      return { access: 'not_authorized' as const };
    }

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
    const page = Math.max(1, Math.floor(args.page));
    const offset = (page - 1) * pageSize;

    return {
      access: 'admin' as const,
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
