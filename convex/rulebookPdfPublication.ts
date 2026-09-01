import { v } from 'convex/values';

import { rulebookEditionArtifactKey, rulebookEditionArtifactPath } from '../src/shared/rulebooks/editionArtifacts';
import { RULEBOOK_PDF_MAX_PICKUP } from '../src/shared/rulebooks/pdfPublication';
import type { Doc, Id } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import { internalMutation } from './functions';
import { completeRulebookEditionArtifact } from './lib/rulebookEditionArtifacts';
import { rulebookRenderDocumentForEdition } from './lib/rulebookPublication';
import { nowIso } from './lib/utils';
import type { MutationCtx } from './types';

const assignedPdfJobValidator = v.object({
  artifactId: v.id('rulebook_edition_artifacts'),
  editionId: v.id('rulebook_editions'),
  rulebookId: v.id('rulebooks'),
  editionNumber: v.number(),
  editionCreatedAt: v.string(),
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
  return (
    edition.rulebook_id === artifact.rulebook_id &&
    edition.edition_number === artifact.edition_number &&
    artifact.path === rulebookEditionArtifactPath(artifact.rulebook_id, artifact.edition_number, 'pdf')
  );
}

async function loadArtifactIdentity(ctx: MutationCtx, artifact: Doc<'rulebook_edition_artifacts'>) {
  const [edition, rulebook] = await Promise.all([
    ctx.db.get('rulebook_editions', artifact.edition_id),
    ctx.db.get('rulebooks', artifact.rulebook_id),
  ]);
  return edition && rulebook && hasConsistentIdentity(artifact, edition) ? { edition, rulebook } : null;
}

export const takePdfWork = internalMutation({
  args: {},
  returns: v.array(assignedPdfJobValidator),
  handler: async (ctx) => {
    const artifacts = await ctx.db
      .query('rulebook_edition_artifacts')
      .withIndex('by_kind_and_status_and_created_at', (q) => q.eq('kind', 'pdf').eq('status', 'preparing'))
      .order('asc')
      .take(RULEBOOK_PDF_MAX_PICKUP);
    const items = [];
    for (const artifact of artifacts) {
      const identity = await loadArtifactIdentity(ctx, artifact);
      if (!identity) {
        await failArtifact(ctx, artifact._id, 'Rulebook Edition PDF identity is inconsistent');
        continue;
      }
      const { edition, rulebook } = identity;
      const document = await rulebookRenderDocumentForEdition(ctx, edition);
      if (!document) {
        await failArtifact(ctx, artifact._id, 'Rulebook Edition cannot produce a PDF render document');
        continue;
      }
      items.push({
        artifactId: artifact._id,
        editionId: edition._id,
        rulebookId: rulebook._id,
        editionNumber: edition.edition_number,
        editionCreatedAt: edition.created_at,
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

type PdfWorkCompletion = { status: 'ready' } | { status: 'failed'; reason: string };

async function settlePdfWork(
  ctx: MutationCtx,
  artifactId: Id<'rulebook_edition_artifacts'>,
  outcome: PdfWorkCompletion
): Promise<'ready' | 'failed' | 'missing'> {
  const artifact = await ctx.db.get('rulebook_edition_artifacts', artifactId);
  if (!artifact || artifact.kind !== 'pdf') {
    return 'missing';
  }
  if (artifact.status === 'ready') {
    return 'ready';
  }
  if (artifact.status === 'failed' && outcome.status === 'failed') {
    return 'failed';
  }
  await completeRulebookEditionArtifact(ctx, {
    editionId: artifact.edition_id,
    kind: 'pdf',
    outcome,
  });
  return outcome.status;
}

export const completePdfWork = internalMutation({
  args: { artifactId: v.id('rulebook_edition_artifacts') },
  returns: workOutcomeValidator,
  handler: async (ctx, args) => settlePdfWork(ctx, args.artifactId, { status: 'ready' }),
});

export const failPdfWork = internalMutation({
  args: { artifactId: v.id('rulebook_edition_artifacts'), error: v.string() },
  returns: workOutcomeValidator,
  handler: async (ctx, args) =>
    settlePdfWork(ctx, args.artifactId, { status: 'failed', reason: args.error.slice(0, 2000) }),
});

const deliveryResolutionValidator = v.union(v.null(), v.object({ editionNumber: v.number(), key: v.string() }));

export const resolvePdfDelivery = internalQuery({
  args: { rulebookId: v.string(), editionNumber: v.number() },
  returns: deliveryResolutionValidator,
  handler: async (ctx, args) => {
    const rulebookId = ctx.db.normalizeId('rulebooks', args.rulebookId);
    const rulebook = rulebookId ? await ctx.db.get('rulebooks', rulebookId) : null;
    if (!rulebook || rulebook.is_deleted) {
      return null;
    }
    const artifact = await ctx.db
      .query('rulebook_edition_artifacts')
      .withIndex('by_rulebook_and_kind_and_status_and_edition_number', (q) =>
        q
          .eq('rulebook_id', rulebook._id)
          .eq('kind', 'pdf')
          .eq('status', 'ready')
          .eq('edition_number', args.editionNumber)
      )
      .unique();
    if (!artifact) {
      return null;
    }
    const expectedPath = rulebookEditionArtifactPath(rulebook._id, artifact.edition_number, 'pdf');
    if (artifact.path !== expectedPath) {
      throw new Error('Rulebook Edition PDF path is inconsistent');
    }
    return {
      editionNumber: artifact.edition_number,
      key: rulebookEditionArtifactKey(rulebook._id, artifact.edition_number, 'pdf'),
    };
  },
});
