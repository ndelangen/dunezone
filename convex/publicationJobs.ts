import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';
import SHA256 from 'crypto-js/sha256';

import { componentGeometrySchema, isComponentAssetType } from '../src/shared/asset-publishing/componentGeometry';
import { componentPublicationEnvelopeSchema } from '../src/shared/asset-publishing/componentPublication';
import {
  parsePublicationAssetData,
  PUBLICATION_JOB_EXPIRY_MS,
  PUBLICATION_MAX_ATTEMPTS,
  PUBLICATION_MAX_PICKUP,
} from '../src/shared/asset-publishing/publication';
import { isPublicationAssetType, PUBLICATION_ASSET_TYPES } from '../src/shared/asset-publishing/publicationTargets';
import type { Doc } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import { internalMutation } from './functions';
import { currentFactionLeaderData, publicationJobsForAsset, publicationSettings } from './lib/publication';
import type { MutationCtx } from './types';

function renderPayloadHash(job: Doc<'publication_jobs'>, payload: unknown) {
  return SHA256(
    JSON.stringify(job.asset_type === 'faction-leader' ? { payload, version: job.component_version } : payload)
  ).toString();
}

const publicationJobResult = v.object({
  jobId: v.id('publication_jobs'),
  assetType: v.string(),
  assetId: v.string(),
  expiresAt: v.number(),
});

const takeWorkResult = v.union(
  v.object({
    status: v.literal('empty'),
    reason: v.union(v.literal('disabled'), v.literal('no_pending_work')),
    recovered: v.number(),
    items: v.array(publicationJobResult),
  }),
  v.object({
    status: v.literal('assigned'),
    recovered: v.number(),
    items: v.array(publicationJobResult),
  })
);

async function recordFailure(
  ctx: MutationCtx,
  job: Pick<Doc<'publication_jobs'>, '_id' | 'attempt_counter'>,
  error: string,
  now: number
): Promise<'pending' | 'error'> {
  const attemptCounter = job.attempt_counter + 1;
  const status = attemptCounter >= PUBLICATION_MAX_ATTEMPTS ? 'error' : 'pending';
  await ctx.db.patch(job._id, {
    status,
    attempt_counter: attemptCounter,
    expires_at: undefined,
    error,
    updated_at: now,
  });
  return status;
}

export const takeWork = internalMutation({
  args: {},
  returns: takeWorkResult,
  handler: async (ctx) => {
    const now = Date.now();
    const settings = await publicationSettings(ctx);
    const pickupEnabled = settings?.publication_pickup_enabled ?? false;

    const expired = await ctx.db
      .query('publication_jobs')
      .withIndex('by_status_and_expires_at', (q) => q.eq('status', 'in_progress').lte('expires_at', now))
      .take(PUBLICATION_MAX_PICKUP);
    for (const job of expired) {
      await recordFailure(ctx, job, 'Capture expired before completion', now);
    }

    if (!pickupEnabled) {
      return {
        status: 'empty' as const,
        reason: 'disabled' as const,
        recovered: expired.length,
        items: [],
      };
    }

    const pending = await ctx.db
      .query('publication_jobs')
      .withIndex('by_status_and_created_at', (q) => q.eq('status', 'pending'))
      .take(PUBLICATION_MAX_PICKUP);
    const expiresAt = now + PUBLICATION_JOB_EXPIRY_MS;
    const items = [];
    for (const job of pending) {
      /* The new Worker deploys before activation makes this type eligible for pickup. */
      if (job.asset_type === 'faction-leader' && !settings?.renderer_revisions['faction-leader']) {
        continue;
      }
      if (job.asset_type === 'faction-leader') {
        const targetJobs = await publicationJobsForAsset(ctx, job.asset_type, job.asset_id);
        if (targetJobs.some((candidate) => candidate.status === 'in_progress')) {
          continue;
        }
      }
      if (job.asset_type === 'faction-leader' && !(await currentFactionLeaderData(ctx, job.asset_id))) {
        await ctx.db.delete(job._id);
        continue;
      }
      await ctx.db.patch(job._id, {
        status: 'in_progress',
        expires_at: expiresAt,
        error: undefined,
        updated_at: now,
      });
      items.push({
        jobId: job._id,
        assetType: job.asset_type,
        assetId: job.asset_id,
        expiresAt,
      });
    }

    return items.length === 0
      ? {
          status: 'empty' as const,
          reason: 'no_pending_work' as const,
          recovered: expired.length,
          items,
        }
      : {
          status: 'assigned' as const,
          recovered: expired.length,
          items,
        };
  },
});

export const normalizeJobId = internalQuery({
  args: { jobId: v.string() },
  returns: v.union(v.id('publication_jobs'), v.null()),
  handler: async (ctx, args) => ctx.db.normalizeId('publication_jobs', args.jobId),
});

/**
 * The capture page's whole view of a job.
 *
 * The asset type comes off the job's own column rather than out of the payload, so what a snapshot claims to be and what the executor was assigned cannot disagree.
 * Ordinary assets retain their payload hash.
 * Component hashes also bind the saved member version, so an expired capture cannot complete a reused job.
 */
export const readJobForRender = internalQuery({
  args: { jobId: v.id('publication_jobs') },
  returns: v.union(
    v.object({
      assetType: v.union(...PUBLICATION_ASSET_TYPES.map((assetType) => v.literal(assetType))),
      payload: v.any(),
      payloadHash: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job?.status !== 'in_progress' || (job.expires_at ?? 0) <= Date.now()) {
      return null;
    }
    if (!isPublicationAssetType(job.asset_type)) {
      return null;
    }
    if (job.asset_type === 'faction-leader' && !(await currentFactionLeaderData(ctx, job.asset_id))) {
      return null;
    }
    const payload = parsePublicationAssetData(job.asset_type, job.asset_data);
    return {
      assetType: job.asset_type,
      payload,
      payloadHash: renderPayloadHash(job, payload),
    };
  },
});

export const completeJob = internalMutation({
  args: {
    jobId: v.id('publication_jobs'),
    cacheToken: v.string(),
    payloadHash: v.optional(v.string()),
    componentGeometry: v.optional(zodToConvex(componentGeometrySchema)),
  },
  returns: v.union(
    v.object({
      status: v.literal('completed'),
      publishedAt: v.number(),
    }),
    v.object({ status: v.literal('missing') })
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job?.status !== 'in_progress') {
      return { status: 'missing' as const };
    }

    const existing = await ctx.db
      .query('publication_assets')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', job.asset_type).eq('asset_id', job.asset_id))
      .take(2);
    if (existing.length > 1) {
      throw new Error('Publication invariant violated: duplicate assets');
    }
    if (job.asset_type === 'faction-leader') {
      if (!componentPublicationEnvelopeSchema.shape.revision.safeParse(args.cacheToken).success) {
        return { status: 'missing' as const };
      }
      const capturedPayload = parsePublicationAssetData(job.asset_type, job.asset_data);
      if (args.payloadHash !== renderPayloadHash(job, capturedPayload)) {
        return { status: 'missing' as const };
      }
      const current = await currentFactionLeaderData(ctx, job.asset_id);
      const jobs = await publicationJobsForAsset(ctx, job.asset_type, job.asset_id);
      const superseded = jobs.some((candidate) => (candidate.component_version ?? 0) > (job.component_version ?? 0));
      const alreadyReplaced = (existing[0]?.component_version ?? 0) >= (job.component_version ?? 0);
      if (
        !current ||
        superseded ||
        alreadyReplaced ||
        JSON.stringify(current) !== JSON.stringify(parsePublicationAssetData(job.asset_type, job.asset_data))
      ) {
        await ctx.db.delete(job._id);
        return { status: 'missing' as const };
      }
    }
    const geometry =
      args.componentGeometry === undefined ? undefined : componentGeometrySchema.parse(args.componentGeometry);
    if (geometry) {
      if (
        !isComponentAssetType(job.asset_type) ||
        args.payloadHash !== renderPayloadHash(job, parsePublicationAssetData(job.asset_type, job.asset_data))
      ) {
        return { status: 'missing' as const };
      }
    }
    const publishedAt = Date.now();
    if (existing[0]) {
      await ctx.db.patch(existing[0]._id, {
        cache_token: args.cacheToken,
        component_geometry: geometry,
        component_version: job.component_version,
        published_at: publishedAt,
      });
    } else {
      await ctx.db.insert('publication_assets', {
        asset_type: job.asset_type,
        asset_id: job.asset_id,
        cache_token: args.cacheToken,
        component_geometry: geometry,
        component_version: job.component_version,
        published_at: publishedAt,
      });
    }
    await ctx.db.delete(job._id);
    return { status: 'completed' as const, publishedAt };
  },
});

export const failJob = internalMutation({
  args: {
    jobId: v.id('publication_jobs'),
    error: v.string(),
  },
  returns: v.union(
    v.object({
      status: v.union(v.literal('pending'), v.literal('error')),
      attemptCounter: v.number(),
    }),
    v.object({ status: v.literal('missing') })
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job?.status !== 'in_progress') {
      return { status: 'missing' as const };
    }
    const status = await recordFailure(ctx, job, args.error.slice(0, 2000), Date.now());
    return { status, attemptCounter: job.attempt_counter + 1 };
  },
});
