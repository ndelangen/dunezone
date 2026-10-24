import preview from '@sb/preview';
import { item, piece, place } from '@shared/play/setupSupply';
import { cardBaySlotPositions } from '@shared/play/tableFurnitureLayout';

import { gameMeta, install } from './game.stories.fixture';
import { cardBack, playingSnapshot, productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Table',
});

const READABLE_CARDS: [string, string][] = [
  ['Snooper', '/play-fixtures/dreamrules/snooper.jpg'],
  ['Broken Land', '/play-fixtures/dreamrules/broken-land.jpg'],
  ['Atreides Traitor', '/play-fixtures/product/house-atreides-traitor-0.jpg'],
  ['Atreides Traitor', '/play-fixtures/product/house-atreides-traitor-1.jpg'],
  ['Harkonnen Traitor', '/play-fixtures/product/house-harkonnen-traitor-0.jpg'],
];

/* Cards with small print face up in the left card bay: their table faces are scaled to 512 px, which read sharper than the published size in a blind comparison. */
function readableCardsSnapshot() {
  const snapshot = playingSnapshot('seat-2');
  READABLE_CARDS.forEach(([name, path], index) => {
    const front = new URL(path, location.origin).href;
    snapshot.table.pieces.push(
      place(
        {
          ...piece(`readable-card-${index}`, name, 'shared', '#ad8a45', 'card', `readable:${index}`),
          items: [item(`readable-item-${index}`, name, front, cardBack(), 'card-treachery', true, 'Treachery')],
        },
        cardBaySlotPositions('left')[index]!
      )
    );
  });
  snapshot.versions = Object.fromEntries(snapshot.table.pieces.map((entry) => [entry.id, snapshot.revision]));
  return snapshot;
}

export const ReadableCards = meta.story({
  beforeEach: install(() => productTransport('seat-2', readableCardsSnapshot())),
});
