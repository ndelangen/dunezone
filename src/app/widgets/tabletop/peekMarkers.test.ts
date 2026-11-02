import { factionTokenStackKey } from '@shared/play/factionToken';
import type { TablePiece } from '@shared/play/model';
import { CARD_WIDTH } from '@shared/play/tableGeometry';
import { expect, test } from 'vite-plus/test';

import { PEEK_MARKER_RADIUS, peekMarkerSlots, peekMarkerTokens } from './peekMarkers';

const token = (factionId: string, faceUp = true): TablePiece => ({
  id: `token-${factionId}`,
  label: factionId,
  owner: factionId,
  color: '#000000',
  accent: '#000000',
  locked: false,
  kind: 'force',
  stackKey: factionTokenStackKey(factionId),
  position: [0, 0, 0],
  orientation: 0,
  zoneId: null,
  items: [
    {
      id: `token-item-${factionId}`,
      faceUp,
      artwork: { front: `${factionId}.png`, back: `${factionId}.png`, type: 'token-faction' },
    },
  ],
});

const deck = (peekedBy: string[], faceUp = false): TablePiece => ({
  id: 'deck',
  label: 'Treachery deck',
  owner: 'shared',
  color: '#000000',
  accent: '#000000',
  locked: false,
  stackKey: 'deck:treachery',
  kind: 'card',
  position: [0, 0, 0],
  orientation: 0,
  zoneId: null,
  items: [0, 1, 2].map((index) => ({ id: `card-${index}`, faceUp, peekedBy })),
});

test("a peeked card carries each peeker's token face up, in the order they peeked", () => {
  const pieces = [token('atreides', false), token('fremen')];
  const tokens = peekMarkerTokens(deck(['fremen', 'atreides']), pieces);
  expect(tokens.map((piece) => piece.id)).toEqual(['token-fremen', 'token-atreides']);
  expect(tokens.every((piece) => piece.items[0]?.faceUp)).toBe(true);
});

test('nothing is marked where nothing is hidden, nobody peeked, or the faction has no token on the table', () => {
  const pieces = [token('atreides')];
  expect(peekMarkerTokens(deck(['atreides'], true), pieces)).toEqual([]);
  expect(peekMarkerTokens(deck([]), pieces)).toEqual([]);
  expect(peekMarkerTokens(deck(['harkonnen']), pieces)).toEqual([]);
  expect(
    peekMarkerTokens({ ...token('fremen'), items: [{ id: 'x', faceUp: false, peekedBy: ['atreides'] }] }, pieces)
  ).toEqual([]);
});

test('markers start in the bottom right corner and overlap towards the left without leaving the card', () => {
  for (const count of [1, 2, 6, 10]) {
    const slots = peekMarkerSlots(deck([]), count);
    expect(slots).toHaveLength(count);
    expect(slots[0]![0]).toBeGreaterThan(0);
    expect(slots[0]![2]).toBeGreaterThan(0);
    for (const [x] of slots) {
      expect(Math.abs(x)).toBeLessThanOrEqual(CARD_WIDTH / 2 - PEEK_MARKER_RADIUS + 0.02);
    }
    for (let index = 1; index < count; index++) {
      expect(slots[index]![0]).toBeLessThan(slots[index - 1]![0]);
      expect(slots[index]![1]).toBeGreaterThan(slots[index - 1]![1]);
    }
  }
});
