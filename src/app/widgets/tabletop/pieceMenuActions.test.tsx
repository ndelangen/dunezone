import { initialSnapshot } from '@shared/play/commands';
import type { TablePiece } from '@shared/play/model';
import { expect, test, vi } from 'vite-plus/test';

import { pieceHasMenu } from './pieceMenu';
import { pieceMenuActions } from './pieceMenuActions';
import type { MenuControls } from './pieceMenuActions';

const pieces = initialSnapshot().table.pieces;
const card = pieces.find((piece) => piece.id === 'treachery-card-loose')!;
const deck = pieces.find((piece) => piece.id === 'treachery-deck')!;
const leader: TablePiece = {
  ...pieces.find((piece) => piece.kind === 'force')!,
  id: 'leader',
  items: [
    {
      id: 'leader-1',
      faceUp: true,
      artwork: {
        type: 'token-leader',
        front: 'https://art.invalid/leader.jpg',
        back: 'https://art.invalid/leader.jpg',
      },
    },
  ],
};

/* The controls a seated player holds, with the hand taking what the table session says it can. */
function controls(canTake: (pieceId: string) => boolean): MenuControls & { take: ReturnType<typeof vi.fn> } {
  const take = vi.fn();
  return {
    deckControls: { recipients: [], draw: vi.fn(), shuffle: vi.fn() },
    peekControls: { peek: vi.fn(), arrange: vi.fn(), pull: vi.fn() },
    deleteControls: { remove: vi.fn() },
    handControls: { canTake, take },
    take,
  };
}

const labels = (piece: TablePiece, menu: MenuControls) =>
  pieceMenuActions(piece, menu, { reserved: false, onClose: () => {} }).map((action) => action.label);

test('a loose card and a battle leader offer Take into hand, after the piece’s own actions and before delete', () => {
  const menu = controls(() => true);
  expect(labels(card, menu)).toEqual([
    'Peek',
    'Draw a card',
    'Deal a card',
    'Shuffle',
    'Take into hand',
    'Hold to delete permanently',
  ]);
  expect(labels(leader, menu)).toEqual(['Take into hand', 'Hold to delete permanently']);
});

test('the item is absent, not disabled, for a piece the hand cannot take, and without hand controls', () => {
  const menu = controls((pieceId) => pieceId === card.id);
  expect(labels(deck, menu)).not.toContain('Take into hand');
  expect(labels(card, { ...menu, handControls: undefined })).not.toContain('Take into hand');
});

test('picking it sends the piece to the hand and closes the ring', () => {
  const menu = controls(() => true);
  const onClose = vi.fn();
  const take = pieceMenuActions(card, menu, { reserved: false, onClose }).find((action) => action.key === 'hand')!;
  take.onSelect!();
  expect(menu.take).toHaveBeenCalledWith(card.id);
  expect(onClose).toHaveBeenCalledOnce();
});

test('a battle leader laid face up by a reveal still opens its ring, where it can go back to the hand', () => {
  expect(pieceHasMenu({ ...leader, battleOverlay: 'battle' })).toBe(true);
});

test('a face-up spice card offers its spice first, and on a pile keeps the pile’s peek beside it', () => {
  const spiceBlow = { amount: 8, territories: ['broken_land'] };
  const topped = (items: TablePiece['items']): TablePiece => {
    const top = items.at(-1)!;
    return {
      ...deck,
      items: [
        ...items.slice(0, -1),
        { ...top, faceUp: true, artwork: { back: 'https://art.invalid/back.jpg', type: 'card-spice', spiceBlow } },
      ],
    };
  };
  const menu: MenuControls = {
    ...controls(() => false),
    spiceBlowControls: {
      placement: () => ({ amount: 8, name: 'Broken Land' }),
      place: vi.fn(),
      placeAll: vi.fn(),
    },
  };
  const pile = labels(topped(deck.items), menu);
  expect(pile.slice(0, 2)).toEqual(['Place 8 spice on Broken Land', expect.stringMatching(/^Peek/)]);
  expect(pile.length).toBeLessThanOrEqual(6);
  const lone = labels(topped(deck.items.slice(0, 1)), menu);
  expect(lone[0]).toBe('Place 8 spice on Broken Land');
  expect(lone).not.toContainEqual(expect.stringMatching(/^Peek/));
});
