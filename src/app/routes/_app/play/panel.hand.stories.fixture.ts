import { gameMeta, install } from './game.stories.fixture';
import { productTransport, playingSnapshot as initialSnapshot } from './product.stories.fixture';

export const handAndSpiceMeta = {
  ...gameMeta,
  /* Load the table chunk before rendering, outside the first interaction wait. */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
};

export const emptySpiceReserve = install(() =>
  productTransport('seat-1', {
    ...initialSnapshot('seat-1'),
    bank: { factionId: 'house-atreides', balance: 0 },
  })
);
