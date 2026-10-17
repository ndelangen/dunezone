import SHA256 from 'crypto-js/sha256';

import {
  canonicalRulebookCoverControlValues,
  rulebookContentsV1Schema,
  rulebookEditionContentsV1Schema,
} from '../../src/shared/rulebooks/contents';
import type { RulebookContentsV1 } from '../../src/shared/rulebooks/contents';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';
import { canonicalJson } from './canonicalJson';

type ReadCtx = Pick<QueryCtx, 'db'> | Pick<MutationCtx, 'db'>;
type EditionIdentity = Pick<Doc<'rulebook_editions'>, '_id'>;

export function rulebookContentsMatch(left: unknown, right: unknown) {
  return canonicalJson(left) === canonicalJson(right);
}

/**
 * The version every stored Contents hash starts with.
 * A stored hash depends on everything between the stored value and the canonical JSON: the draft and Edition schemas in `src/shared/rulebooks/contents.ts` (their defaults, stripped keys and transforms), `canonicalRulebookCoverControlValues`, and `canonicalJson` in `./canonicalJson`.
 * Change the version whenever any of those changes what it outputs for a stored document, so a hash written under the old rules is never compared with one written under the new.
 * A hash with any other prefix makes the editor fall back to comparing the documents themselves.
 * Production does not rerun a finished migration, so a new version ships with new `rulebook_contents_hash_*` migration ids that rewrite every row.
 * The pinned hash in `rulebookEditionContents.test.ts` fails when one of those inputs changes, which is the prompt to make that decision.
 */
export const RULEBOOK_CONTENTS_HASH_VERSION = 'v1:';

/** A digest of the canonical rendering, so two values hash equal exactly when `rulebookContentsMatch` calls them equal. */
export function rulebookContentsHash(value: unknown) {
  return `${RULEBOOK_CONTENTS_HASH_VERSION}${SHA256(canonicalJson(value)).toString()}`;
}

/** Contents as the editor compares them: a Cover's footer is compared as its own region, wherever an earlier editor stored it. */
function comparableContents(contents: RulebookContentsV1): RulebookContentsV1 {
  return {
    ...contents,
    pagesById: Object.fromEntries(
      Object.entries(contents.pagesById).map(([id, page]) => [
        id,
        page.layoutId === 'cover'
          ? { ...page, controlValues: canonicalRulebookCoverControlValues(page.controlValues) }
          : page,
      ])
    ),
  };
}

/** Whether a saved draft and an Edition hold the same Rulebook, after each has been parsed by its own schema. */
export function comparableRulebookContentsMatch(left: RulebookContentsV1, right: RulebookContentsV1) {
  return rulebookContentsMatch(comparableContents(left), comparableContents(right));
}

/**
 * The hash of a stored draft's Contents, taken over exactly what `comparableRulebookContentsMatch` compares after the draft schema parses it.
 * Returns undefined when the value does not parse, which leaves the row to the full comparison.
 */
export function rulebookDraftContentsHash(stored: unknown) {
  const parsed = rulebookContentsV1Schema.safeParse(stored);
  return parsed.success ? rulebookContentsHash(comparableContents(parsed.data)) : undefined;
}

/**
 * The hash of an Edition's stored Contents, taken over exactly what `comparableRulebookContentsMatch` compares after the Edition schema parses it.
 * Returns undefined when the value does not parse, which leaves the row to the full comparison.
 */
export function rulebookEditionContentsHash(stored: unknown) {
  const parsed = rulebookEditionContentsV1Schema.safeParse(stored);
  return parsed.success ? rulebookContentsHash(comparableContents(parsed.data)) : undefined;
}

/**
 * Compares two stored hashes, or returns undefined when either is missing or was written under another version.
 * Undefined means the caller has to compare the documents themselves.
 */
export function rulebookContentsHashesMatch(left: string | undefined, right: string | undefined) {
  if (!left?.startsWith(RULEBOOK_CONTENTS_HASH_VERSION) || !right?.startsWith(RULEBOOK_CONTENTS_HASH_VERSION)) {
    return undefined;
  }
  return left === right;
}

/** Reads one Edition's Contents without making metadata callers join every Contents document. */
export async function contentsForRulebookEdition(ctx: ReadCtx, edition: EditionIdentity) {
  const stored = await ctx.db
    .query('rulebook_edition_contents')
    .withIndex('by_edition_id', (q) => q.eq('edition_id', edition._id))
    .unique();
  if (stored) {
    return stored.contents;
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
