import { v } from 'convex/values';

import { rulebookEditionArtifactKey, rulebookEditionArtifactPath } from '../src/shared/rulebooks/editionArtifacts';
import type { RulebookEditionArtifactKind } from '../src/shared/rulebooks/editionArtifacts';
import { RULEBOOK_ARTIFACT_MAX_PICKUP } from '../src/shared/rulebooks/editionArtifactWork';
import type { Doc, Id } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import { internalMutation } from './functions';
import {
  completeRulebookEditionArtifact,
  failRulebookEditionArtifact,
  rulebookEditionArtifactKindValidator,
  rulebookForArtifactDelivery,
  settleArtifactOfDiscardedRulebook,
} from './lib/rulebookEditionArtifacts';
import { rulebookRenderDocumentForEdition } from './lib/rulebookPublication';
import type { MutationCtx, QueryCtx } from './types';

const assignedJobFields = {
  artifactId: v.id('rulebook_edition_artifacts'),
  editionId: v.id('rulebook_editions'),
  rulebookId: v.id('rulebooks'),
  editionNumber: v.number(),
  rulebookName: v.string(),
  document: v.any(),
};

/** What one format's job carries beyond the shared identity: the PDF stamps its Edition's creation time, and HTML carries nothing more. */
const jobExtension = {
  html: () => ({}),
  pdf: (edition: Doc<'rulebook_editions'>) => ({ editionCreatedAt: edition.created_at }),
} satisfies Record<RulebookEditionArtifactKind, (edition: Doc<'rulebook_editions'>) => object>;

/**
 * Either format's job, so this validator would also accept an HTML job carrying `editionCreatedAt`.
 * The per-kind shape is held by the take-work replay in `rulebooks.artifactHttp.test.ts`.
 */
const assignedJobValidator = v.union(
  v.object(assignedJobFields),
  v.object({ ...assignedJobFields, editionCreatedAt: v.string() })
);

const workOutcomeValidator = v.union(v.literal('ready'), v.literal('failed'), v.literal('missing'));

function hasConsistentIdentity(artifact: Doc<'rulebook_edition_artifacts'>, edition: Doc<'rulebook_editions'>) {
  return (
    edition.rulebook_id === artifact.rulebook_id &&
    edition.edition_number === artifact.edition_number &&
    artifact.path === rulebookEditionArtifactPath(artifact.rulebook_id, artifact.edition_number, artifact.kind)
  );
}

async function loadArtifactIdentity(ctx: MutationCtx, artifact: Doc<'rulebook_edition_artifacts'>) {
  const [edition, rulebook] = await Promise.all([
    ctx.db.get('rulebook_editions', artifact.edition_id),
    ctx.db.get('rulebooks', artifact.rulebook_id),
  ]);
  return edition && rulebook && hasConsistentIdentity(artifact, edition) ? { edition, rulebook } : null;
}

/** Assigns the oldest preparing artifacts of one format, each with its frozen render document; an artifact that cannot render settles as failed instead. */
export const take = internalMutation({
  args: { artifactKind: rulebookEditionArtifactKindValidator },
  returns: v.array(assignedJobValidator),
  handler: async (ctx, { artifactKind }) => {
    const artifacts = await ctx.db
      .query('rulebook_edition_artifacts')
      .withIndex('by_kind_and_status_and_created_at', (q) => q.eq('kind', artifactKind).eq('status', 'preparing'))
      .order('asc')
      .take(RULEBOOK_ARTIFACT_MAX_PICKUP);
    const items = [];
    for (const artifact of artifacts) {
      const identity = await loadArtifactIdentity(ctx, artifact);
      if (!identity) {
        await failRulebookEditionArtifact(
          ctx,
          artifact._id,
          `Rulebook Edition ${artifactKind.toUpperCase()} identity is inconsistent`
        );
        continue;
      }
      const { edition, rulebook } = identity;
      if (await settleArtifactOfDiscardedRulebook(ctx, artifact, rulebook)) {
        continue;
      }
      const document = await rulebookRenderDocumentForEdition(ctx, edition);
      if (!document) {
        await failRulebookEditionArtifact(ctx, artifact._id, 'Rulebook Edition cannot produce a render document');
        continue;
      }
      items.push({
        artifactId: artifact._id,
        editionId: edition._id,
        rulebookId: rulebook._id,
        editionNumber: edition.edition_number,
        ...jobExtension[artifactKind](edition),
        rulebookName: rulebook.name,
        document,
      });
    }
    return items;
  },
});

/** Turns an executor's artifact id into a table id, or null when it names no artifact row; the format is checked when the work settles. */
export const normalize = internalQuery({
  args: { artifactId: v.string() },
  returns: v.union(v.id('rulebook_edition_artifacts'), v.null()),
  handler: async (ctx, args) => ctx.db.normalizeId('rulebook_edition_artifacts', args.artifactId),
});

type WorkCompletion = { status: 'ready' } | { status: 'failed'; reason: string };

async function settleWork(
  ctx: MutationCtx,
  artifactKind: RulebookEditionArtifactKind,
  artifactId: Id<'rulebook_edition_artifacts'>,
  outcome: WorkCompletion
): Promise<'ready' | 'failed' | 'missing'> {
  const artifact = await ctx.db.get('rulebook_edition_artifacts', artifactId);
  if (!artifact || artifact.kind !== artifactKind) {
    return 'missing';
  }
  if (artifact.status === 'ready') {
    return 'ready';
  }
  if (artifact.status === 'failed' && outcome.status === 'failed') {
    return 'failed';
  }
  await completeRulebookEditionArtifact(ctx, { editionId: artifact.edition_id, kind: artifactKind, outcome });
  return outcome.status;
}

export const complete = internalMutation({
  args: { artifactKind: rulebookEditionArtifactKindValidator, artifactId: v.id('rulebook_edition_artifacts') },
  returns: workOutcomeValidator,
  handler: async (ctx, args) => settleWork(ctx, args.artifactKind, args.artifactId, { status: 'ready' }),
});

export const fail = internalMutation({
  args: {
    artifactKind: rulebookEditionArtifactKindValidator,
    artifactId: v.id('rulebook_edition_artifacts'),
    error: v.string(),
  },
  returns: workOutcomeValidator,
  handler: async (ctx, args) =>
    settleWork(ctx, args.artifactKind, args.artifactId, { status: 'failed', reason: args.error.slice(0, 2000) }),
});

async function readyArtifact(
  ctx: QueryCtx,
  rulebookId: Id<'rulebooks'>,
  artifactKind: RulebookEditionArtifactKind,
  editionNumber: number | undefined
) {
  const indexed = ctx.db
    .query('rulebook_edition_artifacts')
    .withIndex('by_rulebook_and_kind_and_status_and_edition_number', (q) => {
      const ready = q.eq('rulebook_id', rulebookId).eq('kind', artifactKind).eq('status', 'ready');
      return editionNumber === undefined ? ready : ready.eq('edition_number', editionNumber);
    });
  return editionNumber === undefined ? indexed.order('desc').first() : indexed.unique();
}

/**
 * The private key of one ready artifact of a live Rulebook, or null.
 * Without an Edition number it answers the newest ready Edition.
 * Only the HTML resolve body may leave the number out.
 */
export const resolve = internalQuery({
  args: {
    artifactKind: rulebookEditionArtifactKindValidator,
    rulebookId: v.string(),
    editionNumber: v.optional(v.number()),
  },
  returns: v.union(v.null(), v.object({ editionNumber: v.number(), key: v.string() })),
  handler: async (ctx, { artifactKind, rulebookId, editionNumber }) => {
    const rulebook = await rulebookForArtifactDelivery(ctx, rulebookId);
    if (!rulebook) {
      return null;
    }
    const artifact = await readyArtifact(ctx, rulebook._id, artifactKind, editionNumber);
    if (!artifact) {
      return null;
    }
    if (artifact.path !== rulebookEditionArtifactPath(rulebook._id, artifact.edition_number, artifactKind)) {
      throw new Error(`Rulebook Edition ${artifactKind.toUpperCase()} path is inconsistent`);
    }
    return {
      editionNumber: artifact.edition_number,
      key: rulebookEditionArtifactKey(rulebook._id, artifact.edition_number, artifactKind),
    };
  },
});
