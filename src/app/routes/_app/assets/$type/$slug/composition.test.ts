import { describe, expect, test } from 'vitest';

import { compositionTiles, omissionNote } from './composition';

const member = (id: string, count: number) => ({ member: { id }, count });

describe('composition tiles', () => {
  test('the each-once view is never capped: the whole loaded page draws, counts on the captions', () => {
    const members = Array.from({ length: 250 }, (_, index) => member(`card-${index}`, 1));
    const { tiles, omittedCopies, omittedMembers } = compositionTiles(members, { duplicated: false, cap: 200 });
    expect(tiles).toHaveLength(250);
    expect(omittedCopies).toBe(0);
    expect(omittedMembers).toBe(0);
    expect(tiles[0]).toEqual({ member: { id: 'card-0' }, key: 'card-0', count: 1 });
  });

  test('the every-copy view caps, counts what it left out, and names the members it never drew', () => {
    const members = [member('a', 150), member('b', 60), member('c', 4)];
    const { tiles, omittedCopies, omittedMembers } = compositionTiles(members, { duplicated: true, cap: 200 });
    expect(tiles).toHaveLength(200);
    /* 150 of a, 50 of b, none of c. */
    expect(omittedCopies).toBe(14);
    expect(omittedMembers).toBe(1);
    expect(tiles[199]?.key).toBe('b-49');
  });

  test('below the cap, every copy draws with a stable per-copy key', () => {
    const { tiles, omittedCopies } = compositionTiles([member('a', 3)], { duplicated: true, cap: 200 });
    expect(tiles.map(({ key }) => key)).toEqual(['a-0', 'a-1', 'a-2']);
    expect(omittedCopies).toBe(0);
  });
});

describe('the omission note', () => {
  test('says nothing when nothing was left out', () => {
    expect(
      omissionNote({
        duplicated: true,
        cap: 200,
        omittedCopies: 0,
        omittedMembers: 0,
        serverTruncated: false,
        loadedMembers: 10,
        noun: 'cards',
      })
    ).toBeNull();
  });

  test('one sentence covers both bounds when both bit', () => {
    const note = omissionNote({
      duplicated: true,
      cap: 200,
      omittedCopies: 300,
      omittedMembers: 2,
      serverTruncated: true,
      loadedMembers: 500,
      noun: 'cards',
    });
    expect(note).toContain('another 300 are not drawn, including 2 cards not drawn at all');
    expect(note).toContain('Only the first 500 distinct cards are loaded');
  });

  test('the collapsed view never speaks of copies, only of the server page', () => {
    const note = omissionNote({
      duplicated: false,
      cap: 200,
      omittedCopies: 0,
      omittedMembers: 0,
      serverTruncated: true,
      loadedMembers: 500,
      noun: 'tokens',
    });
    expect(note).toBe('Only the first 500 distinct tokens are loaded; this one holds more.');
  });
});
