import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';

type ReadCtx = Pick<QueryCtx, 'db'> | Pick<MutationCtx, 'db'>;
type EditionWithLegacyContents = Pick<Doc<'rulebook_editions'>, '_id' | 'contents'>;

/** Reads one Edition's Contents without making metadata callers join every Contents document. */
export async function contentsForRulebookEdition(ctx: ReadCtx, edition: EditionWithLegacyContents) {
  const stored = await ctx.db
    .query('rulebook_edition_contents')
    .withIndex('by_edition_id', (q) => q.eq('edition_id', edition._id))
    .unique();
  if (stored) {
    return stored.contents;
  }
  if (edition.contents !== undefined) {
    return edition.contents;
  }
  throw new Error('Rulebook Edition Contents not found');
}

/** Writes the immutable Contents row in the same transaction as its Edition metadata. */
export async function insertRulebookEditionContents(
  ctx: MutationCtx,
  editionId: Id<'rulebook_editions'>,
  contents: unknown
) {
  await ctx.db.insert('rulebook_edition_contents', {
    edition_id: editionId,
    contents,
  });
}
