import { expect, test } from 'vitest';

import type { RulesetCapture } from './capture';
import { treacheryDeckCards } from './treacheryDeck';

const card = (id: string, name: string, front: string) => ({
  id,
  faceUp: false,
  artwork: { front, back: 'https://example.test/back.jpg', name, type: 'card-treachery' },
});

test('the tracker reads one entry per face, with its copies and the line under its name', () => {
  const capture = {
    decks: {
      treachery: {
        contents: {
          definitions: [
            { id: 'a', type: 'card-treachery', data: { name: 'Shield', subName: 'Defense - Projectile' } },
            { id: 'b', type: 'card-treachery', data: { name: 'Baliset', subName: 'Worthless' } },
          ],
          pieces: [
            {
              items: [
                card('1', 'Shield', 'https://example.test/shield.jpg'),
                card('2', 'Shield', 'https://example.test/shield.jpg'),
                card('3', 'Baliset', 'https://example.test/baliset.jpg'),
              ],
            },
          ],
        },
      },
    },
  } as unknown as RulesetCapture;
  expect(treacheryDeckCards(capture)).toEqual([
    {
      key: 'https://example.test/shield.jpg',
      name: 'Shield',
      detail: 'Defense - Projectile',
      face: 'https://example.test/shield.jpg',
      count: 2,
    },
    {
      key: 'https://example.test/baliset.jpg',
      name: 'Baliset',
      detail: 'Worthless',
      face: 'https://example.test/baliset.jpg',
      count: 1,
    },
  ]);
});

test('a game without a captured Treachery deck has nothing to track', () => {
  expect(treacheryDeckCards(undefined)).toBeNull();
  expect(treacheryDeckCards({ decks: { treachery: null } } as unknown as RulesetCapture)).toBeNull();
});
