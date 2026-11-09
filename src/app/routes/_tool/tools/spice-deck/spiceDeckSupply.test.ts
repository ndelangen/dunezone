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

test('a card with no spice is Shai-Hulud only when it names a worm; others are special cards the players follow', () => {
  /* Each card copies the shape of a member the catalogue sent, with its own name. */
  const custom = (id: string, name: string, subName: string) => ({
    ...supply.members[0]!,
    asset: { id, slug: id, type: 'card-custom', name, data: { name, subName } },
    count: 1,
  });
  const gf9 = spiceDeckFromSupply(
    { id: 'gf9', name: 'GF9 Spice Deck', ruleset: 'GF9' },
    {
      ...supply,
      members: [
        custom('worm', 'GF9 Shai-Hulud', 'Sandworm alert'),
        custom('maker', 'GF9 Great Maker', 'Sandworm alert special'),
        custom('trout', 'GF9 Sandtrout', 'Spice blow special'),
        custom('discovery', 'GF9 Old Gap', 'Discovery spice blow'),
      ],
    }
  );
  expect(gf9.cards.filter(isWorm).map((card) => card.key)).toEqual(['worm', 'maker']);
  expect(gf9.cards.filter((card) => card.special).map((card) => card.key)).toEqual(['trout', 'discovery']);
});

test('a deck with a card whose face is not published is not played', () => {
  const faceless = { ...supply, members: [{ ...supply.members[0]!, front: null }, ...supply.members.slice(1)] };
  expect(() => spiceDeckFromSupply({ id: 'faceless', name: 'Faceless deck', ruleset: 'Faceless' }, faceless)).toThrow(
    /not published/
  );
});
