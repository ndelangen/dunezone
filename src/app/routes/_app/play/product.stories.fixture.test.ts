/* @vitest-environment jsdom */

import dreamrulesDecks from '@shared/play/fixtures/dreamrulesDecks.json';
import { rosterFactionNames } from '@shared/play/protocol';
import { labelForCount } from '@shared/play/tableState';
import { describe, expect, test, vi } from 'vite-plus/test';

import { playingSnapshot, preparedSnapshot } from './product.stories.fixture';

/* The fixture reaches the Storybook database module, whose application client needs a Convex address a unit run does not have. */
vi.mock('@db/core', () => ({ db: {} }));

describe('Play story fixture labels', () => {
  /*
   * Every card stack on these tables whose cards changed, by the Traitor gather, a deal or a discard, takes the name its back gives it.
   * A deck setup laid out untouched keeps the published deck's name, as the setup supply copies it.
   */
  test.each([
    ['prepared', preparedSnapshot],
    ['playing', playingSnapshot],
  ])('the %s table names each card stack by its back', (_state, snapshot) => {
    const { table, roster } = snapshot();
    const published = new Set([dreamrulesDecks.treachery.name, dreamrulesDecks.spice.name]);
    const stacks = table.pieces.filter((piece) => piece.kind === 'card' && !published.has(piece.label));
    expect(stacks).not.toHaveLength(0);
    expect(stacks.map((piece) => piece.label)).toEqual(
      stacks.map((piece) => labelForCount(piece, piece.items.length, rosterFactionNames(roster)))
    );
  });

  test('setup lays the Treachery deck in the left card bay and the Spice deck in the right', () => {
    const { table } = preparedSnapshot();
    const deck = (label: string) => table.pieces.find((piece) => piece.label === label)!;
    expect(deck(dreamrulesDecks.treachery.name).position[0]).toBeLessThan(0);
    expect(deck(dreamrulesDecks.spice.name).position[0]).toBeGreaterThan(0);
  });

  test('a kept Traitor carries the name the deal gives it', () => {
    const cards = preparedSnapshot().hand!.filter((piece) => piece.stackKey === 'cards:traitor');
    expect(cards).not.toHaveLength(0);
    expect(new Set(cards.map((piece) => piece.label))).toEqual(new Set(['Card']));
  });
});
