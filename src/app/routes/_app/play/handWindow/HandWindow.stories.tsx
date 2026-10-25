import preview from '@sb/preview';
import type { GameSnapshot } from '@shared/play/protocol';

import { gameMeta, install } from '../game.stories.fixture';
import { battleStory } from '../playing.stories.fixture';
import { productTransport, playingSnapshot } from '../product.stories.fixture';
import { HandWindowHarness } from './HandWindowHarness.stories.fixture';

/*
 * Four prototypes of the Hand & spice window's content, each on its own in a bottom-left slot.
 * The data is the product fixture's (captured from production): Harkonnen's leaders and Traitor cards,
 * with the loose Treachery card taken into the hand, ten spice, and a battle at Arrakeen being prepared.
 */
const meta = preview.meta({
  title: 'Play/Explorations/Hand and spice',
  component: HandWindowHarness,
  decorators: gameMeta.decorators,
  globals: { motion: 'on' },
  parameters: { layout: 'fullscreen', controls: { disable: true }, chromatic: { disableSnapshot: true } },
  tags: ['!test'],
});

/* The loose Treachery card moves into the viewer's hand, so the hand holds more than one kind of card. */
function withTreachery(snapshot: GameSnapshot) {
  const card = snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose');
  if (card && snapshot.hand) {
    snapshot.hand.push({ ...card, owner: 'house-harkonnen' });
    snapshot.table.pieces = snapshot.table.pieces.filter((piece) => piece.id !== card.id);
  }
  return snapshot;
}

const inBattle = install(() => productTransport('seat-2', withTreachery(battleStory('preparing'))));
const quiet = install(() =>
  productTransport('seat-2', {
    ...withTreachery(playingSnapshot('seat-2')),
    bank: { factionId: 'house-harkonnen', balance: 10 },
  })
);

/** A. Shelves: rows by kind, hover a piece for its one-click actions, spice by one-click amounts. */
export const AShelves = meta.story({ name: 'A Shelves', args: { variant: 'shelves' }, beforeEach: inBattle });

/** B. Fan: the cards held as a fanned hand, hover to read, click to pick, then act from the bar. */
export const BFan = meta.story({ name: 'B Fan', args: { variant: 'fan' }, beforeEach: inBattle });

/** C. Ledger: a readable row per piece, filtered by kind, spice by slider. */
export const CLedger = meta.story({ name: 'C Ledger', args: { variant: 'ledger' }, beforeEach: inBattle });

/** D. Battle-aware: in a battle the plan leads and a click moves a piece in or out of it. */
export const DBattleAware = meta.story({ name: 'D Battle-aware', args: { variant: 'battle' }, beforeEach: inBattle });

/** D outside a battle: it falls back to the shelves. */
export const DBattleAwareQuiet = meta.story({
  name: 'D Battle-aware, no battle',
  args: { variant: 'battle' },
  beforeEach: quiet,
});
