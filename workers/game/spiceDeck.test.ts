import { expect, test } from 'vite-plus/test';

import type { SlotCapture } from '../../src/shared/play/capture';
import { piece } from '../../src/shared/play/setupSupply';
import { spiceDeck } from './setup';

const BACK = 'https://table.test/published/decks/spice/cardback.jpg';

function deck(slug: string, cards: number, back = BACK): SlotCapture {
  return {
    asset: { id: slug, type: 'deck', slug, name: slug },
    contents: {
      assetId: slug,
      type: 'deck',
      members: [],
      definitions: [],
      name: slug,
      pieces: [
        {
          ...piece(slug, `${slug} label`, 'shared', '#d5ba8c', 'card', `deck:${slug}`),
          items: Array.from({ length: cards }, (_, index) => ({
            id: `${slug}-${index}`,
            faceUp: false,
            artwork: {
              front: `https://table.test/${slug}/${index}.jpg`,
              back,
              backName: slug,
              name: `${slug} ${index}`,
              type: 'card-spice',
            },
          })),
        },
      ],
    },
  };
}

const names = (pieces: ReturnType<typeof spiceDeck>) =>
  pieces.flatMap((entry) => entry.items.map((item) => item.artwork?.name ?? '')).sort((a, b) => a.localeCompare(b));

test('ticked extra spice decks shuffle into the one spice deck, which keeps its label, stack and back (#2986)', () => {
  const pieces = spiceDeck({
    spice: deck('spice', 3),
    spiceExtras: [deck('expansion', 2, 'https://table.test/expansion/cardback.jpg')],
  });
  expect(pieces).toHaveLength(1);
  expect(pieces[0]).toMatchObject({ label: 'spice label', stackKey: 'deck:spice' });
  expect(names(pieces)).toEqual(['expansion 0', 'expansion 1', 'spice 0', 'spice 1', 'spice 2']);
  /* Every card wears the spice deck's back, so an extra card cannot be told apart before it is drawn. */
  expect(new Set(pieces[0]!.items.map((item) => `${item.artwork?.back} ${item.artwork?.backName}`))).toEqual(
    new Set([`${BACK} spice`])
  );
});

test('extra spice decks never stand in for a missing spice deck', () => {
  expect(spiceDeck({ spice: null, spiceExtras: [deck('expansion', 2)] })).toEqual([]);
});
