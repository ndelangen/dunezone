import { httpRouter } from 'convex/server';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { type ActionCtx, httpAction } from './_generated/server';
import { auth } from './auth';
import {
  createCacheToken,
  createRenderCapability,
  handleAuthenticatedJson,
  InvalidPublisherRequestError,
  publisherJson,
  randomPublisherToken,
  verifyRenderCapability,
} from './lib/assetPublisherHttp';
import {
  acquireRequestSchema,
  claimRequestSchema,
  completeRequestSchema,
  exactClaimRequestSchema,
  failRequestSchema,
  operatorRequestSchema,
  releaseBatchRequestSchema,
  rolloutOperatorRequestSchema,
} from './lib/assetPublisherSchemas';
import {
  handleAssetPublishingProofCheckpoint,
  handleAssetPublishingProofEligibility,
} from './lib/assetPublishingProof';
import {
  FACTION_SHEET_STORAGE_ACTIVATION_PREREQUISITE,
  FACTION_SHEET_TARGET_ACTIVATION_PREREQUISITE,
} from './lib/factionSheetPublicationGuard';

const http = httpRouter();

auth.addHttpRoutes(http);

function publisherExecutorSecret() {
  const executor = process.env.ASSET_PUBLISHER_EXECUTOR_SECRET;
  return executor || undefined;
}

function activationBoundarySecret() {
  const activation = process.env.ASSET_PUBLISHER_ACTIVATION_SECRET;
  const otherPublisherSecrets = [
    process.env.ASSET_PUBLISHER_EXECUTOR_SECRET,
    process.env.ASSET_PUBLISHER_RENDER_CAPABILITY_SECRET,
    process.env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET,
  ].filter((secret): secret is string => Boolean(secret));
  if (!activation || otherPublisherSecrets.includes(activation)) return undefined;
  return activation;
}

async function exactClaimArgs(
  ctx: ActionCtx,
  body: {
    targetId: string;
    batchToken: string;
    claimToken: string;
    generation: number;
    rendererVersion: string;
    retainBatch?: boolean;
  }
) {
  const targetId: Id<'asset_targets'> | null = await ctx.runQuery(
    internal.assetPublisher.normalizeTargetId,
    { targetId: body.targetId }
  );
  if (!targetId) throw new InvalidPublisherRequestError('Invalid publisher target id');
  return {
    targetId,
    batchToken: body.batchToken,
    claimToken: body.claimToken,
    generation: body.generation,
    rendererVersion: body.rendererVersion,
    retainBatch: body.retainBatch ?? false,
  };
}

http.route({
  path: '/asset-publishing/operator',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: activationBoundarySecret(),
      schema: operatorRequestSchema,
      execute: async (body) => {
        if (body.operation === 'initialize') {
          return {
            ok: true,
            schemaVersion: body.schemaVersion,
            operation: body.operation,
            ...(await ctx.runMutation(internal.assetPublisherOperator.initializeDisabled, {})),
          };
        }
        if (body.operation === 'pause') {
          return {
            ok: true,
            schemaVersion: body.schemaVersion,
            operation: body.operation,
            ...(await ctx.runMutation(internal.assetPublisherOperator.pause, {})),
          };
        }
        if (body.operation === 'disable') {
          return {
            ok: true,
            schemaVersion: body.schemaVersion,
            operation: body.operation,
            ...(await ctx.runMutation(internal.assetPublisherOperator.disable, {})),
          };
        }
        return {
          ok: true,
          schemaVersion: body.schemaVersion,
          operation: body.operation,
          ...(await ctx.runMutation(internal.assetPublisherOperator.activate, {
            rendererVersion: body.rendererVersion,
            targetPrerequisite: FACTION_SHEET_TARGET_ACTIVATION_PREREQUISITE,
            storagePrerequisite: FACTION_SHEET_STORAGE_ACTIVATION_PREREQUISITE,
          })),
        };
      },
    });
  }),
});

http.route({
  path: '/asset-publishing/rollouts',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: activationBoundarySecret(),
      schema: rolloutOperatorRequestSchema,
      execute: async (body) => {
        if (body.operation === 'create_paused') {
          return {
            ok: true,
            schemaVersion: body.schemaVersion,
            operation: body.operation,
            rollout: await ctx.runMutation(internal.assetRollouts.createPaused, {
              targetRendererVersion: body.targetRendererVersion,
            }),
          };
        }
        const rolloutId = body.rolloutId
          ? await ctx.runQuery(internal.assetRollouts.normalizeRolloutId, {
              rolloutId: body.rolloutId,
            })
          : null;
        if (body.rolloutId && !rolloutId) {
          throw new InvalidPublisherRequestError('Invalid rollout id');
        }
        if (body.operation === 'progress') {
          return {
            ok: true,
            schemaVersion: body.schemaVersion,
            operation: body.operation,
            ...(await ctx.runQuery(internal.assetRollouts.progress, {
              ...(rolloutId ? { rolloutId } : {}),
            })),
          };
        }
        if (!rolloutId) throw new InvalidPublisherRequestError('Rollout id is required');
        if (body.operation === 'resume') {
          return {
            ok: true,
            schemaVersion: body.schemaVersion,
            operation: body.operation,
            rollout: await ctx.runMutation(internal.assetRollouts.resume, { rolloutId }),
          };
        }
        if (body.operation === 'pause') {
          return {
            ok: true,
            schemaVersion: body.schemaVersion,
            operation: body.operation,
            rollout: await ctx.runMutation(internal.assetRollouts.pause, { rolloutId }),
          };
        }
        if (body.operation === 'cancel') {
          return {
            ok: true,
            schemaVersion: body.schemaVersion,
            operation: body.operation,
            rollout: await ctx.runMutation(internal.assetRollouts.cancel, { rolloutId }),
          };
        }
        return {
          ok: true,
          schemaVersion: body.schemaVersion,
          operation: body.operation,
          rollout: await ctx.runMutation(internal.assetRollouts.createRollback, {
            rollbackOfRolloutId: rolloutId,
            targetRendererVersion: body.targetRendererVersion,
          }),
        };
      },
    });
  }),
});

http.route({
  path: '/asset-publishing/executor/acquire',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: publisherExecutorSecret(),
      schema: acquireRequestSchema,
      execute: async (body) => {
        const result = await ctx.runMutation(internal.assetPublisher.acquireBatch, {
          batchToken: body.batchToken,
        });
        return { ok: true, schemaVersion: body.schemaVersion, ...result };
      },
    });
  }),
});

http.route({
  path: '/asset-publishing/executor/claim',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: publisherExecutorSecret(),
      schema: claimRequestSchema,
      execute: async (body) => {
        const capabilitySecret = process.env.ASSET_PUBLISHER_RENDER_CAPABILITY_SECRET;
        if (!capabilitySecret) throw new Error('Render capability signing is disabled');
        const result = await ctx.runMutation(internal.assetPublisher.claimOne, {
          batchToken: body.batchToken,
          claimToken: randomPublisherToken(),
        });
        if (result.status !== 'claimed') return { ok: true, ...result };
        const expiresAt = Math.min(result.leaseExpiresAt, Date.now() + 5 * 60 * 1_000);
        const renderCapability = await createRenderCapability(
          {
            version: 1,
            factionId: result.factionId,
            assetType: result.assetType,
            payloadHash: result.payloadHash,
            generation: result.generation,
            rendererVersion: result.rendererVersion,
            batchToken: result.batchToken,
            claimToken: result.claimToken,
            expiresAt,
          },
          capabilitySecret
        );
        return { ok: true, ...result, renderCapability, renderCapabilityExpiresAt: expiresAt };
      },
    });
  }),
});

http.route({
  path: '/asset-publishing/executor/release-batch',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: publisherExecutorSecret(),
      schema: releaseBatchRequestSchema,
      execute: async (body) => ({
        ok: true,
        ...(await ctx.runMutation(internal.assetPublisher.releaseBatch, {
          batchToken: body.batchToken,
        })),
      }),
    });
  }),
});

http.route({
  path: '/asset-publishing/executor/revalidate',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: publisherExecutorSecret(),
      schema: exactClaimRequestSchema,
      execute: async (body) => {
        const claim = await exactClaimArgs(ctx, body);
        return {
          ok: true,
          ...(await ctx.runMutation(internal.assetPublisher.revalidateClaim, claim)),
        };
      },
    });
  }),
});

http.route({
  path: '/asset-publishing/executor/complete',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: publisherExecutorSecret(),
      schema: completeRequestSchema,
      execute: async (body) => {
        const cacheSecret = process.env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET;
        if (!cacheSecret) throw new Error('Cache-token signing is disabled');
        const claim = await exactClaimArgs(ctx, body);
        const identity: { factionId: Id<'factions'>; assetType: 'faction_sheet' } | null =
          await ctx.runQuery(internal.assetPublisher.readClaimIdentity, claim);
        if (!identity) return { ok: true, status: 'stale' as const };
        const cacheToken = await createCacheToken(
          identity.factionId,
          identity.assetType,
          cacheSecret
        );
        const result = await ctx.runMutation(internal.assetPublisher.completeClaim, {
          ...claim,
          r2Etag: body.r2Etag,
          bytes: body.bytes,
          cacheToken,
        });
        return { ok: true, ...result };
      },
    });
  }),
});

http.route({
  path: '/asset-publishing/executor/fail',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: publisherExecutorSecret(),
      schema: failRequestSchema,
      execute: async (body) => {
        const claim = await exactClaimArgs(ctx, body);
        return {
          ok: true,
          ...(await ctx.runMutation(internal.assetPublisher.failClaim, {
            ...claim,
            error: body.error,
          })),
        };
      },
    });
  }),
});

http.route({
  path: '/asset-publishing/executor/release',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: publisherExecutorSecret(),
      schema: exactClaimRequestSchema,
      execute: async (body) => {
        const claim = await exactClaimArgs(ctx, body);
        return {
          ok: true,
          ...(await ctx.runMutation(internal.assetPublisher.releaseClaim, claim)),
        };
      },
    });
  }),
});

http.route({
  path: '/asset-publishing/render',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const authorization = request.headers.get('Authorization') ?? '';
    const capability = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const payload = await verifyRenderCapability(
      capability,
      process.env.ASSET_PUBLISHER_RENDER_CAPABILITY_SECRET
    );
    if (!payload) return publisherJson({ error: 'Not found' }, 404);
    const snapshot = await ctx.runQuery(internal.assetPublisher.readRenderSnapshot, {
      factionId: payload.factionId as Id<'factions'>,
      assetType: payload.assetType,
      payloadHash: payload.payloadHash,
      batchToken: payload.batchToken,
      claimToken: payload.claimToken,
      generation: payload.generation,
      rendererVersion: payload.rendererVersion,
    });
    return snapshot
      ? publisherJson({ ok: true, ...snapshot })
      : publisherJson({ error: 'Not found' }, 404);
  }),
});

http.route({
  path: '/asset-publishing/proof/checkpoint',
  method: 'POST',
  handler: httpAction(async (_ctx, request) => {
    return await handleAssetPublishingProofCheckpoint(request, {
      expectedSecret: process.env.ASSET_PUBLISHING_PROOF_SECRET,
    });
  }),
});

http.route({
  path: '/asset-publishing/proof/eligibility',
  method: 'POST',
  handler: httpAction(async (_ctx, request) => {
    return await handleAssetPublishingProofEligibility(request, {
      expectedSecret: process.env.ASSET_PUBLISHING_PROOF_SECRET,
      eligibility:
        process.env.ASSET_PUBLISHING_PROOF_ELIGIBILITY === 'eligible' ? 'eligible' : 'empty',
    });
  }),
});

export default http;
