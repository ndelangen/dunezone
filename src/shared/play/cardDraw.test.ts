import { describe, expect, test } from 'vite-plus/test';

import { cardDrawSchema, describeCardDraw } from './cardDraw';
import { initialSnapshot } from './commands';
import { factionTokenStackKey } from './factionToken';
import type { GameSnapshot, PieceAction } from './protocol';

function fixture(): GameSnapshot {
  const snapshot = initialSnapshot();
  snapshot.roster = {
    seatCount: 6,
    seats: [{ id: 'seat-a', position: 0, faction: { id: 'atreides', name: 'Atreides', color: '#75d8a7' } }],
  };
  const deck = snapshot.table.pieces.find((piece) => piece.id === 'treachery-deck')!;
  deck.items = [
    {
      id: 'private-card',
      faceUp: true,
      artwork: {
        front: 'https://cards.test/secret.png',
        back: 'https://cards.test/back.png',
        name: 'A secret',
        type: 'secret-type',
      },
    },
  ];
  snapshot.table.pieces.push({
    ...deck,
    id: 'token',
    kind: 'force',
    stackKey: factionTokenStackKey('atreides'),
    position: [2, 0, -3],
  });
  return snapshot;
}

describe('public card draw descriptions', () => {
  test('whitelists only the public back and geometry, even for a face-up last card', () => {
    const snapshot = fixture();
    const draw = describeCardDraw(snapshot, { kind: 'deck-draw', pieceId: 'treachery-deck' }, 'atreides')!;
    expect(draw).toMatchObject({
      recipient: 'atreides',
      count: 1,
      back: 'https://cards.test/back.png',
      to: [2, expect.any(Number), -3],
    });
    expect(Object.keys(draw).sort()).toEqual(['back', 'color', 'count', 'from', 'orientation', 'recipient', 'to']);
    const serialized = JSON.stringify(draw);
    for (const secret of ['private-card', 'secret.png', 'A secret', 'secret-type', 'treachery-deck']) {
      expect(serialized).not.toContain(secret);
    }
    expect(cardDrawSchema.parse({ ...draw, epoch: 'room', revision: 2 })).toMatchObject(draw);
    expect(cardDrawSchema.safeParse({ ...draw, epoch: 'room', revision: 2, front: 'secret' }).success).toBe(false);
    snapshot.table.pieces = [];
    expect(draw.to[0]).toBe(2);
  });

  test('dealing four identifies the recipient and reuses only the visible deck back', () => {
    const snapshot = fixture();
    expect(
      describeCardDraw(
        snapshot,
        { kind: 'deck-draw', pieceId: 'treachery-deck', recipient: 'atreides', count: 4 },
        'someone-else'
      )
    ).toMatchObject({ recipient: 'atreides', count: 4, back: 'https://cards.test/back.png' });
  });

  test.each<PieceAction>([
    { kind: 'deck-shuffle', pieceId: 'treachery-deck' },
    { kind: 'deck-draw', pieceId: 'missing' },
    { kind: 'deck-draw', pieceId: 'treachery-deck', recipient: 'missing' },
  ])('does not describe an unrelated or missing source or recipient', (action) => {
    expect(describeCardDraw(fixture(), action, 'atreides')).toBeUndefined();
  });
});
