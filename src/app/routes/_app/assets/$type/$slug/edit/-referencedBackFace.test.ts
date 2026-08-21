import { publishingRectangleTokenFace } from '@shared/assets/fixtures/publishingRectangleTokenFace';
import { publishingTokenFace } from '@shared/assets/fixtures/publishingTokenFace';
import { describe, expect, test } from 'vitest';

import { referencedRectangleBackFace, referencedTokenBackFace } from './-referencedBackFace';

/*
 * The proof's contract lives only in JSDoc, so the type system cannot catch a proof drawing the
 * front; this pin can. Both routes shipped exactly that bug once (recorded on the tiles ticket).
 */
describe('the referenced back reader', () => {
  test('a round token contributes its authored back, never its front', () => {
    const backFace = { ...publishingTokenFace, top: 'THE BACK MARK' };
    const face = referencedTokenBackFace({
      name: 'Target',
      about: '',
      front: publishingTokenFace,
      back: { mode: 'custom', face: backFace },
    });
    expect(face?.top).toBe('THE BACK MARK');
  });

  test('a rectangle contributes its authored back, and a non-authored back reads as nothing', () => {
    const backFace = { ...publishingRectangleTokenFace, ring: !publishingRectangleTokenFace.ring };
    const data = {
      name: 'Target',
      about: '',
      front: publishingRectangleTokenFace,
      back: { mode: 'custom', face: backFace },
    };
    expect(referencedRectangleBackFace(data)?.ring).toBe(backFace.ring);
    /* A target whose back stopped being authored has nothing to contribute; the routes show the note. */
    expect(referencedRectangleBackFace({ ...data, back: { mode: 'same' } })).toBeNull();
    expect(referencedTokenBackFace({ not: 'a token' })).toBeNull();
  });
});
