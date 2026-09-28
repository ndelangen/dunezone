/* @vitest-environment jsdom */

import { labelForCount } from '@shared/play/tableState';
import { describe, expect, test, vi } from 'vitest';

import { playingSnapshot, preparedSnapshot } from './product.stories.fixture';

/* The fixture reaches the Storybook database module, whose application client needs a Convex address a unit run does not have. */
vi.mock('@db/core', () => ({ db: {} }));

describe('Play story fixture labels', () => {
  /* Every card stack on these tables has had its own cards changed, by the Traitor gather or by a draw off the Treachery deck. */
  test.each([
    ['prepared', preparedSnapshot],
    ['playing', playingSnapshot],
  ])('the %s table names each card stack by its back', (_state, snapshot) => {
    const stacks = snapshot().table.pieces.filter((piece) => piece.kind === 'card');
    expect(stacks).not.toHaveLength(0);
    expect(stacks.map((piece) => piece.label)).toEqual(stacks.map((piece) => labelForCount(piece, piece.items.length)));
  });

  test('a kept Traitor carries the name the deal gives it', () => {
    const cards = preparedSnapshot().hand!.filter((piece) => piece.kind === 'card');
    expect(cards).not.toHaveLength(0);
    expect(new Set(cards.map((piece) => piece.label))).toEqual(new Set(['Card']));
  });
});
