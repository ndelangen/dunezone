/**
 * The composition grid's arithmetic, apart from the components that draw it.
 *
 * Pure on purpose: every way this page has been wrong so far lived in these few lines (a cap that trimmed the wrong view, a note counting the wrong thing), and none of it needs a mounted renderer to test.
 */

/** How many tiles the every-copy view will mount. Five hundred members at ninety-nine copies each is a page no browser should draw. */
export const DUPLICATED_TILE_CAP = 200;

type CompositionEntry<M> = { member: M; count: number };

export type CompositionTiles<M> = {
  tiles: { member: M; key: string; count: number }[];
  /** Copies the cap left undrawn. Zero in the each-once view, which is never capped: the server's page is its only bound. */
  omittedCopies: number;
  /** Members the cap left entirely undrawn; the reader cannot learn these exist from the grid alone. */
  omittedMembers: number;
};

/**
 * The tiles a composition draws.
 * Every copy, bounded by the cap, or each member once with its count on the caption.
 * The collapsed view always shows the whole loaded page, which is what the cap's note points the reader at.
 */
export function compositionTiles<M extends { id: string }>(
  members: readonly CompositionEntry<M>[],
  { duplicated, cap = DUPLICATED_TILE_CAP }: { duplicated: boolean; cap?: number }
): CompositionTiles<M> {
  if (!duplicated) {
    return {
      tiles: members.map(({ member, count }) => ({ member, key: member.id, count })),
      omittedCopies: 0,
      omittedMembers: 0,
    };
  }
  const tiles: CompositionTiles<M>['tiles'] = [];
  let omittedCopies = 0;
  let omittedMembers = 0;
  for (const { member, count } of members) {
    /* Expanded up to the cap rather than materialised and sliced: the worst legal deck is ~49,500 copies, inside a live query's re-render path. */
    const drawn = Math.min(count, Math.max(0, cap - tiles.length));
    for (let copy = 0; copy < drawn; copy += 1) {
      tiles.push({ member, key: `${member.id}-${copy}`, count: 1 });
    }
    omittedCopies += count - drawn;
    if (drawn === 0) {
      omittedMembers += 1;
    }
  }
  return { tiles, omittedCopies, omittedMembers };
}

/**
 * The one sentence under the grid saying what it left out, or null when nothing was.
 * One note however many bounds bit, so two counters never stack with two different numbers.
 */
export function omissionNote({
  duplicated,
  cap,
  omittedCopies,
  omittedMembers,
  serverTruncated,
  loadedMembers,
  noun,
}: {
  duplicated: boolean;
  cap: number;
  omittedCopies: number;
  omittedMembers: number;
  serverTruncated: boolean;
  loadedMembers: number;
  noun: string;
}): string | null {
  const parts: string[] = [];
  if (duplicated && omittedCopies > 0) {
    const wholly = omittedMembers > 0 ? `, including ${omittedMembers} ${noun} not drawn at all` : '';
    parts.push(
      `Showing the first ${cap} copies; another ${omittedCopies} are not drawn${wholly}. The each-once view shows every loaded ${noun.replace(/s$/, '')} with its count.`
    );
  }
  if (serverTruncated) {
    parts.push(`Only the first ${loadedMembers} distinct ${noun} are loaded; this one holds more.`);
  }
  return parts.length > 0 ? parts.join(' ') : null;
}
