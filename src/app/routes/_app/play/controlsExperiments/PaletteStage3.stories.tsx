import preview from '@sb/preview';
import type { GameSnapshot } from '@shared/play/protocol';
import type { Decorator } from '@storybook/tanstack-react';

import { faction } from '../alliances.stories.fixture';
import { gameMeta, install } from '../game.stories.fixture';
import { battleStory } from '../playing.stories.fixture';
import { productTransport } from '../product.stories.fixture';
import { ControlsExperimentContext } from './experiment';

/*
 * The command palette's third stage (Norbert, 2026-10-24): Space opens a compass, a visual shorthand first and typing second.
 * ← Hand, ← ← Hidden zone, → Table chat, → → Ally chat, ↑ Battle plan, ↓ search with suggestions.
 */
const withExperiment: Decorator = (Story) => (
  <ControlsExperimentContext value="palette-3">
    <Story />
  </ControlsExperimentContext>
);

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Explorations/Controls layout/Stage 3 Compass palette',
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

/* The viewer allied with seat 4, so the ally arm has someone to talk to. */
function allied(snapshot: GameSnapshot) {
  snapshot.alliances = { groups: [{ members: [faction(snapshot, 'seat-2'), faction(snapshot, 'seat-4')], mark: 0 }], offers: [] };
  return snapshot;
}

/** In a battle and allied: every arm of the compass leads somewhere. */
export const InBattleAndAllied = meta.story({
  beforeEach: install(() => productTransport('seat-2', allied(battleStory('preparing')))),
});

/** A quiet moment: no battle and no ally, so those two arms show what's missing. */
export const Quiet = meta.story({ beforeEach: install(() => productTransport('seat-2')) });
