import preview from '@sb/preview';
import type { Decorator } from '@storybook/tanstack-react';

import { gameMeta, install } from '../game.stories.fixture';
import { productTransport } from '../product.stories.fixture';
import { ControlsExperimentContext } from './experiment';

/*
 * The command palette's second stage (Norbert, 2026-10-24), beside the frozen start of the prototype.
 * Space opens the palette; Space held with a key opens a window; each player is a window; the chat bar stays on screen.
 */
const withExperiment: Decorator = (Story) => (
  <ControlsExperimentContext value="palette-2">
    <Story />
  </ControlsExperimentContext>
);

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Explorations/Controls layout/Stage 2 Command palette',
  globals: { motion: 'on' },
  decorators: [...gameMeta.decorators, withExperiment],
  parameters: { ...gameMeta.parameters, chromatic: { disableSnapshot: true } },
  tags: ['!test'],
  loaders: [
    async () => {
      await import('../multiplayer/HostedTable');
    },
  ],
});

/** A seated player in play. */
export const Seated = meta.story({ beforeEach: install(() => productTransport('seat-2')) });

/** A spectator: no hand, but the same palette and chats. */
export const Spectator = meta.story({ beforeEach: install(() => productTransport('neutral')) });
