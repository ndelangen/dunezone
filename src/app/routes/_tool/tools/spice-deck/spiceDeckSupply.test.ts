import { assetSupplySchema } from '@shared/play/capture';
import { expect, test } from 'vite-plus/test';

import catalogue from '../../../_app/tutorial/setup/catalogue.json';
import { isWorm } from './spiceDeck';
import { spiceDeckFromSupply } from './spiceDeckSupply';

/* The Dreamrules spice deck as the catalogue answered when the tutorial copied it. */
const supply = assetSupplySchema.parse(catalogue.assetSupply['deck/dreamrules-spice-deck']);
const deck = spiceDeckFromSupply({ id: 'dreamrules', name: 'Dreamrules Spice Deck', ruleset: 'Dreamrules' }, supply);

test('every card keeps its copies, its face and the spice it blows; Shai-Hulud blows none', () => {
  const worm = deck.cards.find((card) => card.name === 'Shai-Hulud')!;
  expect(isWorm(worm)).toBe(true);
  expect(worm.count).toBe(6);
  expect(deck.cards.find((card) => card.name === 'Cielago South')).toMatchObject({ amount: 12, count: 1 });
  expect(deck.cards.filter(isWorm)).toHaveLength(1);
  expect(deck.cards.every((card) => card.face?.startsWith('/published/'))).toBe(true);
  expect(deck.back).toBe(supply.back);
  expect(deck.ruleset).toBe('Dreamrules');
});

test('every card has a key of its own', () => {
  expect(new Set(deck.cards.map((card) => card.key)).size).toBe(deck.cards.length);
});

test('a deck the catalogue sent only in part is not played', () => {
  expect(() =>
    spiceDeckFromSupply({ id: 'cut', name: 'Cut deck', ruleset: 'Cut' }, { ...supply, membersTruncated: true })
  ).toThrow(/more cards/);
});
