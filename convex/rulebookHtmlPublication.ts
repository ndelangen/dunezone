import { v } from 'convex/values';

import { rulebookEditionArtifactKey, rulebookEditionArtifactPath } from '../src/shared/rulebooks/editionArtifacts';
import { RULEBOOK_HTML_MAX_PICKUP } from '../src/shared/rulebooks/htmlPublication';
import type { Doc, Id } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import { internalMutation } from './functions';
import { completeRulebookEditionArtifact, rulebookForArtifactDelivery } from './lib/rulebookEditionArtifacts';
import { rulebookRenderDocumentForEdition } from './lib/rulebookPublication';
import { nowIso } from './lib/utils';
import type { MutationCtx, QueryCtx } from './types';

const assignedHtmlJobValidator = v.object({
  artifactId: v.id('rulebook_edition_artifacts'),
  editionId: v.id('rulebook_editions'),
  rulebookId: v.id('rulebooks'),
  editionNumber: v.number(),
  rulebookName: v.string(),
  document: v.any(),
});

const workOutcomeValidator = v.union(v.literal('ready'), v.literal('failed'), v.literal('missing'));

async function failArtifact(ctx: MutationCtx, artifactId: Id<'rulebook_edition_artifacts'>, reason: string) {
  await ctx.db.patch('rulebook_edition_artifacts', artifactId, {
    status: 'failed',
    failure_reason: reason.slice(0, 2000),
    updated_at: nowIso(),
  });
}

function hasConsistentIdentity(artifact: Doc<'rulebook_edition_artifacts'>, edition: Doc<'rulebook_editions'>) {
  if (edition.rulebook_id !== artifact.rulebook_id) {
    return false;
  }
  if (edition.edition_number !== artifact.edition_number) {
    return false;
  }
  return artifact.path === rulebookEditionArtifactPath(artifact.rulebook_id, artifact.edition_number, 'html');
}

async function loadArtifactIdentity(ctx: MutationCtx, artifact: Doc<'rulebook_edition_artifacts'>) {
  const [edition, rulebook] = await Promise.all([
    ctx.db.get('rulebook_editions', artifact.edition_id),
    ctx.db.get('rulebooks', artifact.rulebook_id),
  ]);
  if (!edition) {
    return null;
  }
  if (!rulebook) {
    return null;
  }
  return hasConsistentIdentity(artifact, edition) ? { edition, rulebook } : null;
}

export const takeHtmlWork = internalMutation({
  args: {},
  returns: v.array(assignedHtmlJobValidator),
  handler: async (ctx) => {
    const artifacts = await ctx.db
      .query('rulebook_edition_artifacts')
      .withIndex('by_kind_and_status_and_created_at', (q) => q.eq('kind', 'html').eq('status', 'preparing'))
      .order('asc')
      .take(RULEBOOK_HTML_MAX_PICKUP);
    const items = [];
    for (const artifact of artifacts) {
      const identity = await loadArtifactIdentity(ctx, artifact);
      if (!identity) {
        await failArtifact(ctx, artifact._id, 'Rulebook Edition HTML identity is inconsistent');
        continue;
      }
      const { edition, rulebook } = identity;
      const document = await rulebookRenderDocumentForEdition(ctx, edition);
      if (!document) {
        await failArtifact(ctx, artifact._id, 'Rulebook Edition cannot produce a render document');
        continue;
      }
      items.push({
        artifactId: artifact._id,
        editionId: edition._id,
        rulebookId: rulebook._id,
        editionNumber: edition.edition_number,
        rulebookName: rulebook.name,
        document,
      });
    }
    return items;
  },
});

export const normalizeArtifactId = internalQuery({
  args: { artifactId: v.string() },
  returns: v.union(v.id('rulebook_edition_artifacts'), v.null()),
  handler: async (ctx, args) => ctx.db.normalizeId('rulebook_edition_artifacts', args.artifactId),
});

type HtmlWorkCompletion = { status: 'ready' } | { status: 'failed'; reason: string };

async function settleHtmlWork(
  ctx: MutationCtx,
  artifactId: Id<'rulebook_edition_artifacts'>,
  outcome: HtmlWorkCompletion
): Promise<'ready' | 'failed' | 'missing'> {
  const artifact = await ctx.db.get('rulebook_edition_artifacts', artifactId);
  if (!artifact || artifact.kind !== 'html') {
    return 'missing';
  }
  if (artifact.status === 'ready') {
    return 'ready';
  }
  if (artifact.status === 'failed') {
    if (outcome.status === 'failed') {
      return 'failed';
    }
  }
  await completeRulebookEditionArtifact(ctx, {
    editionId: artifact.edition_id,
    kind: 'html',
    outcome,
  });
  return outcome.status;
}

export const completeHtmlWork = internalMutation({
  args: { artifactId: v.id('rulebook_edition_artifacts') },
  returns: workOutcomeValidator,
  handler: async (ctx, args) => settleHtmlWork(ctx, args.artifactId, { status: 'ready' }),
});

export const failHtmlWork = internalMutation({
  args: { artifactId: v.id('rulebook_edition_artifacts'), error: v.string() },
  returns: workOutcomeValidator,
  handler: async (ctx, args) =>
    settleHtmlWork(ctx, args.artifactId, { status: 'failed', reason: args.error.slice(0, 2000) }),
});

const deliveryResolutionValidator = v.union(v.null(), v.object({ editionNumber: v.number(), key: v.string() }));

async function readyHtmlArtifact(ctx: QueryCtx, rulebookId: Id<'rulebooks'>, editionNumber: number | undefined) {
  const indexed = ctx.db
    .query('rulebook_edition_artifacts')
    .withIndex('by_rulebook_and_kind_and_status_and_edition_number', (q) => {
      const ready = q.eq('rulebook_id', rulebookId).eq('kind', 'html').eq('status', 'ready');
      return editionNumber === undefined ? ready : ready.eq('edition_number', editionNumber);
    });
  return editionNumber === undefined ? indexed.order('desc').first() : indexed.unique();
}

export const resolveHtmlDelivery = internalQuery({
  args: {
    rulebookId: v.string(),
    editionNumber: v.optional(v.number()),
  },
  returns: deliveryResolutionValidator,
  handler: async (ctx, args) => {
    const rulebook = await rulebookForArtifactDelivery(ctx, args.rulebookId);
    if (!rulebook) {
      return null;
    }
    const artifact = await readyHtmlArtifact(ctx, rulebook._id, args.editionNumber);
    if (!artifact) {
      return null;
    }
    const expectedPath = rulebookEditionArtifactPath(rulebook._id, artifact.edition_number, 'html');
    if (artifact.path !== expectedPath) {
      throw new Error('Rulebook Edition HTML path is inconsistent');
    }
    return {
      editionNumber: artifact.edition_number,
      key: rulebookEditionArtifactKey(rulebook._id, artifact.edition_number, 'html'),
    };
  },
});
