import { RectangleTokenAsset, TokenAsset } from '@shared/assets/schema';

/**
 * The face a referenced token contributes to the picker's proof: its authored BACK, never its front («A referenced back shows the other token's back»).
 * The target's data is another asset's, so it gets the same distrust as our own;
 * null covers a row that no longer parses and a back that stopped being authored alike, and the routes show a note for both rather than a crash.
 * One module for both twin edit routes, so the two proofs cannot drift apart the way they did when each picked its own face inline.
 */
export function referencedTokenBackFace(data: unknown) {
  const parsed = TokenAsset.safeParse(data);
  return parsed.success && parsed.data.back.mode === 'custom' ? parsed.data.back.face : null;
}

/** The rectangle twin, differing only in which schema reads the row. */
export function referencedRectangleBackFace(data: unknown) {
  const parsed = RectangleTokenAsset.safeParse(data);
  return parsed.success && parsed.data.back.mode === 'custom' ? parsed.data.back.face : null;
}
