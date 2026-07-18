import { httpRouter } from 'convex/server';

import { publisherSnapshotSchema } from '../src/shared/asset-publishing/publisher-snapshot';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { type ActionCtx, httpAction } from './_generated/server';
import { auth } from './auth';
import { MAX_PUBLISHER_ITEMS } from './lib/assetPublisherConstants';
import {
  handleAuthenticatedJson,
  InvalidPublisherRequestError,
  publisherJson,
  randomPublisherToken,
} from './lib/assetPublisherHttp';
import {
  completeItemRequestSchema,
  exactItemRequestSchema,
  failItemRequestSchema,
  operatorRequestSchema,
  rolloutOperatorRequestSchema,
  takeWorkRequestSchema,
} from './lib/assetPublisherSchemas';
import {
  handleAssetPublishingProofCheckpoint,
  handleAssetPublishingProofEligibility,
} from './lib/assetPublishingProof';

const http = httpRouter();

auth.addHttpRoutes(http);

function publisherSecret() {
  const executor = process.env.ASSET_PUBLISHER_EXECUTOR_SECRET;
  const activation = process.env.ASSET_PUBLISHER_ACTIVATION_SECRET;
  const cache = process.env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET;
  if (!executor || executor === activation || executor === cache) return undefined;
  return executor;
}

function activationBoundarySecret() {
  const activation = process.env.ASSET_PUBLISHER_ACTIVATION_SECRET;
  const otherPublisherSecrets = [
    process.env.ASSET_PUBLISHER_EXECUTOR_SECRET,
    process.env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET,
  ].filter((secret): secret is string => Boolean(secret));
  if (!activation || otherPublisherSecrets.includes(activation)) return undefined;
  return activation;
}

async function exactItemArgs(
  ctx: ActionCtx,
  body: {
    targetId: string;
    claimToken: string;
    generation: number;
    rendererVersion: string;
  }
) {
  const targetId: Id<'asset_targets'> | null = await ctx.runQuery(
    internal.assetPublisher.normalizeTargetId,
    { targetId: body.targetId }
  );
  if (!targetId) throw new InvalidPublisherRequestError('Invalid publisher target id');
  return {
    targetId,
    claimToken: body.claimToken,
    generation: body.generation,
    rendererVersion: body.rendererVersion,
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
  path: '/asset-publishing/executor/take-work',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: publisherSecret(),
      schema: takeWorkRequestSchema,
      execute: async (body) => ({
        ok: true,
        schemaVersion: body.schemaVersion,
        ...(await ctx.runMutation(internal.assetPublisher.takeWork, {
          claimTokens: Array.from({ length: MAX_PUBLISHER_ITEMS }, () => randomPublisherToken()),
        })),
      }),
    });
  }),
});

http.route({
  path: '/asset-publishing/executor/revalidate-item',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: publisherSecret(),
      schema: exactItemRequestSchema,
      execute: async (body) => ({
        ok: true,
        ...(await ctx.runQuery(
          internal.assetPublisher.revalidateItem,
          await exactItemArgs(ctx, body)
        )),
      }),
    });
  }),
});

http.route({
  path: '/asset-publishing/executor/complete-item',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: publisherSecret(),
      schema: completeItemRequestSchema,
      execute: async (body) => ({
        ok: true,
        ...(await ctx.runMutation(internal.assetPublisher.completeItem, {
          ...(await exactItemArgs(ctx, body)),
          r2Etag: body.r2Etag,
          bytes: body.bytes,
          cacheToken: body.cacheToken,
        })),
      }),
    });
  }),
});

http.route({
  path: '/asset-publishing/executor/fail-item',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: publisherSecret(),
      schema: failItemRequestSchema,
      execute: async (body) => ({
        ok: true,
        ...(await ctx.runMutation(internal.assetPublisher.failItem, {
          ...(await exactItemArgs(ctx, body)),
          attribution: body.attribution,
          error: body.error,
        })),
      }),
    });
  }),
});

http.route({
  path: '/asset-publishing/render',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const authorization = request.headers.get('Authorization') ?? '';
    const claimToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const item = await ctx.runQuery(internal.assetPublisher.readItemForRender, { claimToken });
    return item
      ? publisherJson(publisherSnapshotSchema.parse({ ok: true, ...item }))
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
