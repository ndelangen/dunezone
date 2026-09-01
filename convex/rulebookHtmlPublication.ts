import { v } from 'convex/values';

import { rulebookEditionArtifactKey, rulebookEditionArtifactPath } from '../src/shared/rulebooks/editionArtifacts';
import { RULEBOOK_HTML_MAX_PICKUP } from '../src/shared/rulebooks/htmlPublication';
import type { Id } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import { internalMutation } from './functions';
import { completeRulebookEditionArtifact } from './lib/rulebookEditionArtifacts';
import { rulebookRenderDocumentForEdition } from './lib/rulebookPublication';
import { nowIso } from './lib/utils';
import type { MutationCtx } from './types';

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
      const [edition, rulebook] = await Promise.all([
        ctx.db.get('rulebook_editions', artifact.edition_id),
        ctx.db.get('rulebooks', artifact.rulebook_id),
      ]);
      if (
        !edition ||
        !rulebook ||
        edition.rulebook_id !== artifact.rulebook_id ||
        edition.edition_number !== artifact.edition_number ||
        artifact.path !== rulebookEditionArtifactPath(artifact.rulebook_id, artifact.edition_number, 'html')
      ) {
        await failArtifact(ctx, artifact._id, 'Rulebook Edition HTML identity is inconsistent');
        continue;
      }
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

export const completeHtmlWork = internalMutation({
  args: { artifactId: v.id('rulebook_edition_artifacts') },
  returns: workOutcomeValidator,
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get('rulebook_edition_artifacts', args.artifactId);
    if (!artifact || artifact.kind !== 'html') {
      return 'missing' as const;
    }
    if (artifact.status === 'ready') {
      return 'ready' as const;
    }
    await completeRulebookEditionArtifact(ctx, {
      editionId: artifact.edition_id,
      kind: 'html',
      outcome: { status: 'ready' },
    });
    return 'ready' as const;
  },
});

export const failHtmlWork = internalMutation({
  args: { artifactId: v.id('rulebook_edition_artifacts'), error: v.string() },
  returns: workOutcomeValidator,
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get('rulebook_edition_artifacts', args.artifactId);
    if (!artifact || artifact.kind !== 'html') {
      return 'missing' as const;
    }
    if (artifact.status !== 'preparing') {
      return artifact.status;
    }
    await completeRulebookEditionArtifact(ctx, {
      editionId: artifact.edition_id,
      kind: 'html',
      outcome: { status: 'failed', reason: args.error.slice(0, 2000) },
    });
    return 'failed' as const;
  },
});

const deliveryResolutionValidator = v.union(v.null(), v.object({ editionNumber: v.number(), key: v.string() }));

export const resolveHtmlDelivery = internalQuery({
  args: {
    rulebookId: v.string(),
    editionNumber: v.optional(v.number()),
  },
  returns: deliveryResolutionValidator,
  handler: async (ctx, args) => {
    const rulebookId = ctx.db.normalizeId('rulebooks', args.rulebookId);
    const rulebook = rulebookId ? await ctx.db.get('rulebooks', rulebookId) : null;
    if (!rulebook || rulebook.is_deleted) {
      return null;
    }
    const indexed = ctx.db
      .query('rulebook_edition_artifacts')
      .withIndex('by_rulebook_and_kind_and_status_and_edition_number', (q) => {
        const ready = q.eq('rulebook_id', rulebook._id).eq('kind', 'html').eq('status', 'ready');
        return args.editionNumber === undefined ? ready : ready.eq('edition_number', args.editionNumber);
      });
    const artifact = args.editionNumber === undefined ? await indexed.order('desc').first() : await indexed.unique();
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
