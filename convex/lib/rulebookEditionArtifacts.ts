import { v } from 'convex/values';

import {
  RULEBOOK_EDITION_ARTIFACT_KINDS,
  rulebookEditionArtifactPath,
} from '../../src/shared/rulebooks/editionArtifacts';
import type { RulebookEditionArtifactKind } from '../../src/shared/rulebooks/editionArtifacts';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';
import { nowIso } from './utils';

export const rulebookEditionArtifactKindValidator = v.union(v.literal('html'), v.literal('pdf'));
export const rulebookEditionArtifactStatusValidator = v.union(
  v.literal('preparing'),
  v.literal('ready'),
  v.literal('failed')
);

export const rulebookEditionArtifactReadinessValidator = v.object({
  status: rulebookEditionArtifactStatusValidator,
  href: v.union(v.string(), v.null()),
});

export const rulebookEditionSummaryValidator = v.object({
  edition_number: v.number(),
  created_at: v.string(),
  html: rulebookEditionArtifactReadinessValidator,
  pdf: rulebookEditionArtifactReadinessValidator,
});

type AnyCtx = QueryCtx | MutationCtx;
type EditionIdentity = Pick<Doc<'rulebook_editions'>, '_id' | 'rulebook_id' | 'edition_number' | 'created_at'>;

async function artifactsForEdition(ctx: AnyCtx, editionId: Id<'rulebook_editions'>) {
  const artifacts = await ctx.db
    .query('rulebook_edition_artifacts')
    .withIndex('by_edition_and_kind', (q) => q.eq('edition_id', editionId))
    .collect();
  if (artifacts.length > RULEBOOK_EDITION_ARTIFACT_KINDS.length) {
    throw new Error('Rulebook Edition has duplicate artifact records');
  }
  const byKind = new Map(artifacts.map((artifact) => [artifact.kind, artifact]));
  if (byKind.size !== artifacts.length) {
    throw new Error('Rulebook Edition has duplicate artifact records');
  }
  return byKind;
}

function assertArtifactIdentity(
  artifact: Doc<'rulebook_edition_artifacts'>,
  edition: EditionIdentity,
  kind: RulebookEditionArtifactKind
) {
  const expectedPath = rulebookEditionArtifactPath(edition.rulebook_id, edition.edition_number, kind);
  if (artifact.rulebook_id !== edition.rulebook_id) {
    throw new Error('Rulebook Edition artifact identity does not match its Edition');
  }
  if (artifact.edition_number !== edition.edition_number) {
    throw new Error('Rulebook Edition artifact identity does not match its Edition');
  }
  if (artifact.path !== expectedPath) {
    throw new Error('Rulebook Edition artifact identity does not match its Edition');
  }
}

/** Inserts any missing permanent artifact identities without changing existing status or paths. */
export async function ensureRulebookEditionArtifacts(ctx: MutationCtx, edition: EditionIdentity) {
  const artifacts = await artifactsForEdition(ctx, edition._id);
  const now = nowIso();
  for (const kind of RULEBOOK_EDITION_ARTIFACT_KINDS) {
    const existing = artifacts.get(kind);
    if (existing) {
      assertArtifactIdentity(existing, edition, kind);
      continue;
    }
    await ctx.db.insert('rulebook_edition_artifacts', {
      rulebook_id: edition.rulebook_id,
      edition_id: edition._id,
      edition_number: edition.edition_number,
      kind,
      status: 'preparing',
      path: rulebookEditionArtifactPath(edition.rulebook_id, edition.edition_number, kind),
      failure_reason: null,
      created_at: now,
      updated_at: now,
    });
  }
}

/** Missing rows mean the widen migration has not reached this Edition yet, so callers see preparing. */
export async function rulebookEditionSummary(ctx: AnyCtx, edition: EditionIdentity) {
  const artifacts = await artifactsForEdition(ctx, edition._id);
  const readiness = (kind: RulebookEditionArtifactKind) => {
    const artifact = artifacts.get(kind);
    if (!artifact) {
      return { status: 'preparing' as const, href: null };
    }
    assertArtifactIdentity(artifact, edition, kind);
    return {
      status: artifact.status,
      href: artifact.status === 'ready' ? artifact.path : null,
    };
  };
  return {
    edition_number: edition.edition_number,
    created_at: edition.created_at,
    html: readiness('html'),
    pdf: readiness('pdf'),
  };
}

/** Moves one reserved artifact to its terminal readiness, leaving the Edition and every permanent path alone. */
export async function completeRulebookEditionArtifact(
  ctx: MutationCtx,
  input: {
    editionId: Id<'rulebook_editions'>;
    kind: RulebookEditionArtifactKind;
    outcome: { status: 'ready' } | { status: 'failed'; reason: string };
  }
) {
  const edition = await ctx.db.get('rulebook_editions', input.editionId);
  if (!edition) {
    throw new Error('Rulebook Edition not found');
  }
  const artifact = await ctx.db
    .query('rulebook_edition_artifacts')
    .withIndex('by_edition_and_kind', (q) => q.eq('edition_id', input.editionId).eq('kind', input.kind))
    .unique();
  if (!artifact) {
    throw new Error('Rulebook Edition artifact not found');
  }
  assertArtifactIdentity(artifact, edition, input.kind);
  if (artifact.status === 'ready' && input.outcome.status !== 'ready') {
    throw new Error('Ready Rulebook Edition artifacts are immutable');
  }
  await ctx.db.patch('rulebook_edition_artifacts', artifact._id, {
    status: input.outcome.status,
    failure_reason: input.outcome.status === 'failed' ? input.outcome.reason : null,
    updated_at: nowIso(),
  });
  return await rulebookEditionSummary(ctx, edition);
}
