import { expect, test } from 'vitest';

import type { RulesetCapture } from './capture';
import { treacheryDeckCards } from './treacheryDeck';

const card = (id: string, name: string, front: string) => ({
  id: `member-${id}`,
  faceUp: false,
  artwork: { front, back: 'https://example.test/back.jpg', name, type: 'card-treachery' },
});

test('the tracker reads one entry per face, with its copies and the line under its name', () => {
  const capture = {
    decks: {
      treachery: {
        contents: {
          members: [
            { assetId: 'a', count: 2 },
            { assetId: 'b', count: 1 },
          ],
          definitions: [
            { id: 'a', type: 'card-treachery', data: { name: 'Shield', subName: 'Defense - Projectile' } },
            { id: 'b', type: 'card-treachery', data: { name: 'Baliset', subName: 'Worthless' } },
          ],
          pieces: [
            {
              items: [
                card('0-0', 'Shield', 'https://example.test/shield.jpg'),
                card('0-1', 'Shield', 'https://example.test/shield.jpg'),
                card('1-0', 'Baliset', 'https://example.test/baliset.jpg'),
              ],
            },
          ],
        },
      },
    },
  } as unknown as RulesetCapture;
  expect(treacheryDeckCards(capture)).toEqual([
    {
      key: 'a',
      name: 'Shield',
      detail: 'Defense - Projectile',
      face: 'https://example.test/shield.jpg',
      count: 2,
    },
    {
      key: 'b',
      name: 'Baliset',
      detail: 'Worthless',
      face: 'https://example.test/baliset.jpg',
      count: 1,
    },
  ]);
});

test('two cards that share a name keep their own lines', () => {
  const capture = {
    decks: {
      treachery: {
        contents: {
          members: [
            { assetId: 'p', count: 1 },
            { assetId: 'q', count: 1 },
          ],
          definitions: [
            { id: 'p', type: 'card-treachery', data: { name: 'Knife', subName: 'Weapon - Poison' } },
            { id: 'q', type: 'card-treachery', data: { name: 'Knife', subName: 'Weapon - Projectile' } },
          ],
          pieces: [
            {
              items: [
                card('0-0', 'Knife', 'https://example.test/knife-p.jpg'),
                card('1-0', 'Knife', 'https://example.test/knife-q.jpg'),
              ],
            },
          ],
        },
      },
    },
  } as unknown as RulesetCapture;
  expect(treacheryDeckCards(capture)?.map((entry) => entry.detail)).toEqual(['Weapon - Poison', 'Weapon - Projectile']);
});

test('a game without a captured Treachery deck has nothing to track', () => {
  expect(treacheryDeckCards(undefined)).toBeNull();
  expect(treacheryDeckCards({ decks: { treachery: null } } as unknown as RulesetCapture)).toBeNull();
});
