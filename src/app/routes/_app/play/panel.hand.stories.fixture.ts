import { gameMeta } from './game.stories.fixture';

export const handAndSpiceMeta = {
  ...gameMeta,
  /* Load the table chunk before rendering, outside the first interaction wait. */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
};
