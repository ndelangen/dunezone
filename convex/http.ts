import { httpRouter } from 'convex/server';

import {
  completePublicationJobRequestSchema,
  failPublicationJobRequestSchema,
  publicationRevisionRequestSchema,
  takePublicationWorkRequestSchema,
} from '../src/shared/asset-publishing/publication';
import { publisherCaptureSnapshotSchema } from '../src/shared/asset-publishing/publisher-snapshot';
import {
  completeRulebookHtmlWorkRequestSchema,
  failRulebookHtmlWorkRequestSchema,
  resolveRulebookHtmlDeliveryRequestSchema,
  takeRulebookHtmlWorkRequestSchema,
} from '../src/shared/rulebooks/htmlPublication';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { httpAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { auth } from './auth';
import { handleAuthenticatedJson, InvalidPublicationRequestError, publicationJson } from './lib/publicationHttp';

const http = httpRouter();

auth.addHttpRoutes(http);

function executorSecret() {
  const executor = process.env.ASSET_PUBLISHER_EXECUTOR_SECRET;
  const activation = process.env.ASSET_PUBLISHER_ACTIVATION_SECRET;
  const cache = process.env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET;
  if (!executor || executor === activation || executor === cache) {
    return undefined;
  }
  return executor;
}

function activationSecret() {
  const activation = process.env.ASSET_PUBLISHER_ACTIVATION_SECRET;
  const otherSecrets = [
    process.env.ASSET_PUBLISHER_EXECUTOR_SECRET,
    process.env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET,
  ].filter((secret): secret is string => Boolean(secret));
  if (!activation || otherSecrets.includes(activation)) {
    return undefined;
  }
  return activation;
}

async function normalizeJobId(ctx: ActionCtx, jobId: string) {
  const normalized: Id<'publication_jobs'> | null = await ctx.runQuery(internal.publicationJobs.normalizeJobId, {
    jobId,
  });
  if (!normalized) {
    throw new InvalidPublicationRequestError('Invalid Publication job id');
  }
  return normalized;
}

async function normalizeRulebookArtifactId(ctx: ActionCtx, artifactId: string) {
  const normalized: Id<'rulebook_edition_artifacts'> | null = await ctx.runQuery(
    internal.rulebookHtmlPublication.normalizeArtifactId,
    {
      artifactId,
    }
  );
  if (!normalized) {
    throw new InvalidPublicationRequestError('Invalid Rulebook HTML artifact id');
  }
  return normalized;
}

http.route({
  path: '/asset-publishing/revisions',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: activationSecret(),
      schema: publicationRevisionRequestSchema,
      execute: async (body) => {
        if (body.operation === 'read') {
          return {
            ok: true,
            schemaVersion: body.schemaVersion,
            operation: body.operation,
            rendererRevisions: await ctx.runQuery(internal.publicationAdmin.readRevisions, {}),
          };
        }
        if (body.operation === 'initialize') {
          return {
            ok: true,
            schemaVersion: body.schemaVersion,
            operation: body.operation,
            ...(await ctx.runMutation(internal.publicationAdmin.initialize, {
              rendererRevisions: body.rendererRevisions,
            })),
          };
        }
        return {
          ok: true,
          schemaVersion: body.schemaVersion,
          operation: body.operation,
          ...(await ctx.runMutation(internal.publicationAdmin.activateRevisions, {
            rendererRevisions: body.rendererRevisions,
          })),
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
      expectedSecret: executorSecret(),
      schema: takePublicationWorkRequestSchema,
      execute: async (body) => ({
        ok: true,
        schemaVersion: body.schemaVersion,
        ...(await ctx.runMutation(internal.publicationJobs.takeWork, {})),
      }),
    });
  }),
});

http.route({
  path: '/asset-publishing/executor/complete-job',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: executorSecret(),
      schema: completePublicationJobRequestSchema,
      execute: async (body) => ({
        ok: true,
        ...(await ctx.runMutation(internal.publicationJobs.completeJob, {
          jobId: await normalizeJobId(ctx, body.jobId),
          cacheToken: body.cacheToken,
        })),
      }),
    });
  }),
});

http.route({
  path: '/asset-publishing/executor/fail-job',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: executorSecret(),
      schema: failPublicationJobRequestSchema,
      execute: async (body) => ({
        ok: true,
        ...(await ctx.runMutation(internal.publicationJobs.failJob, {
          jobId: await normalizeJobId(ctx, body.jobId),
          error: body.error,
        })),
      }),
    });
  }),
});

http.route({
  path: '/asset-publishing/executor/rulebook-html/take-work',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: executorSecret(),
      schema: takeRulebookHtmlWorkRequestSchema,
      execute: async (body) => ({
        ok: true,
        schemaVersion: body.schemaVersion,
        items: await ctx.runMutation(internal.rulebookHtmlPublication.takeHtmlWork, {}),
      }),
    });
  }),
});

http.route({
  path: '/asset-publishing/executor/rulebook-html/complete-work',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: executorSecret(),
      schema: completeRulebookHtmlWorkRequestSchema,
      execute: async (body) => ({
        ok: true,
        status: await ctx.runMutation(internal.rulebookHtmlPublication.completeHtmlWork, {
          artifactId: await normalizeRulebookArtifactId(ctx, body.artifactId),
        }),
      }),
    });
  }),
});

http.route({
  path: '/asset-publishing/executor/rulebook-html/fail-work',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: executorSecret(),
      schema: failRulebookHtmlWorkRequestSchema,
      execute: async (body) => ({
        ok: true,
        status: await ctx.runMutation(internal.rulebookHtmlPublication.failHtmlWork, {
          artifactId: await normalizeRulebookArtifactId(ctx, body.artifactId),
          error: body.error,
        }),
      }),
    });
  }),
});

http.route({
  path: '/asset-publishing/executor/rulebook-html/resolve-delivery',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    return await handleAuthenticatedJson(request, {
      expectedSecret: executorSecret(),
      schema: resolveRulebookHtmlDeliveryRequestSchema,
      execute: async (body) => {
        const resolved = await ctx.runQuery(internal.rulebookHtmlPublication.resolveHtmlDelivery, {
          rulebookId: body.rulebookId,
          ...(body.kind === 'edition' ? { editionNumber: body.editionNumber } : {}),
        });
        return resolved
          ? { ok: true, status: 'found' as const, ...resolved }
          : { ok: true, status: 'missing' as const };
      },
    });
  }),
});

http.route({
  path: '/asset-publishing/render',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const authorization = request.headers.get('Authorization') ?? '';
    const rawJobId = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const jobId = rawJobId
      ? await ctx.runQuery(internal.publicationJobs.normalizeJobId, {
          jobId: rawJobId,
        })
      : null;
    const job = jobId ? await ctx.runQuery(internal.publicationJobs.readJobForRender, { jobId }) : null;
    return job
      ? publicationJson(
          publisherCaptureSnapshotSchema.parse({
            ok: true,
            assetType: job.assetType,
            payload: job.payload,
            payloadHash: job.payloadHash,
          })
        )
      : publicationJson({ error: 'Not found' }, 404);
  }),
});

export default http;
