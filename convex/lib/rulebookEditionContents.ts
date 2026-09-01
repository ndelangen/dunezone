import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';

type ReadCtx = Pick<QueryCtx, 'db'> | Pick<MutationCtx, 'db'>;
type EditionWithLegacyContents = Pick<Doc<'rulebook_editions'>, '_id' | 'contents'>;

/**
 * Renders Contents so that two equal documents render identically, whatever order their keys were written in.
 *
 * Keys sort by code unit rather than by `localeCompare`, which is collation: it answers with the host's ICU data and may call two distinct strings equal, and a comparator that returns 0 for distinct keys leaves their relative order to whichever one was inserted first.
 * That would let one document out-sort its own twin.
 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function rulebookContentsMatch(left: unknown, right: unknown) {
  return canonicalJson(left) === canonicalJson(right);
}

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
  throw new Error(`Rulebook Edition ${edition._id} Contents not found`);
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
