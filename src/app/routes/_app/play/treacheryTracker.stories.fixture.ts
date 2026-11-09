import type { GameSnapshot } from '@shared/play/protocol';

import { gameMeta } from './game.stories.fixture';
import { chapter } from './journey.stories.fixture';
import { DREAMRULES_DECK } from './panels/treacheryTracker/tracker.stories.fixture';
import { playingSnapshot, productTransport } from './product.stories.fixture';
import { sandboxTransport, seatOf } from './sandbox.stories.fixture';

/** What every Treachery tracker page story shares: the game page, a fresh tracker, and the table chunk loaded first. */
export const trackerMeta = {
  ...gameMeta,
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
      /* Each story starts from a fresh tracker, not the one the story before it filled in. */
      const { forgetTrackers } = await import('./panels/treacheryTracker/trackerStore');
      forgetTrackers();
    },
  ],
};

/* The Dreamrules deck as the room answers a tracking seat's deck read. */
const TREACHERY_DECK = DREAMRULES_DECK.map(({ key, name, detail, face, count }) => ({
  key,
  name,
  detail,
  face,
  count,
}));

/* The room answers seat 1's deck read, the House Atreides seat's, as it does for a faction whose rules keep the tracker; the deck is the Dreamrules deck. */
export function trackerTransport(change?: (snapshot: GameSnapshot) => void) {
  const snapshot = playingSnapshot('seat-1');
  change?.(snapshot);
  return productTransport('seat-1', snapshot, {
    treacheryDeck: TREACHERY_DECK,
  });
}

/* The live table at the Bidding phase, viewed as the seat the recording dealt House Atreides. */
export const atreidesSandbox = () =>
  sandboxTransport(
    { start: chapter('Bidding') - 1, seat: seatOf('house-atreides') },
    { treacheryDeck: TREACHERY_DECK }
  );
