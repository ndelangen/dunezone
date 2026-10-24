import preview from '@sb/preview';
import type { GameSnapshot } from '@shared/play/protocol';
import type { Decorator } from '@storybook/tanstack-react';

import { faction } from '../alliances.stories.fixture';
import { gameMeta, install } from '../game.stories.fixture';
import { battleStory } from '../playing.stories.fixture';
import { productTransport } from '../product.stories.fixture';
import { ControlsExperimentContext } from './experiment';

/*
 * The command palette's fourth stage (Norbert, 2026-10-24): the compass with search at its centre and suggestions below,
 * and two slots, bottom left and bottom right, that a window can be pinned into. The camera dial sits top right.
 */
const withExperiment: Decorator = (Story) => (
  <ControlsExperimentContext value="palette-4">
    <Story />
  </ControlsExperimentContext>
);

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Explorations/Controls layout/Stage 4 Pinned slots',
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

/* What the slots start with: the story either pins its pair or starts empty, whatever an earlier visit left. */
function pinned(slots: Record<'left' | 'right', { key: string; tab: string } | null>, keep: boolean) {
  try {
    localStorage.setItem(
      'dunezone-controls-experiment:palette-4-slots',
      JSON.stringify(keep ? slots : { left: null, right: null })
    );
  } catch {
    /* Without storage the slots start empty. */
  }
}

/* The viewer allied with seat 4, so the ally arm has someone to talk to. */
function allied(snapshot: GameSnapshot) {
  snapshot.alliances = {
    groups: [{ members: [faction(snapshot, 'seat-2'), faction(snapshot, 'seat-4')], mark: 0 }],
    offers: [],
  };
  return snapshot;
}

/** In a battle and allied, with nothing pinned yet. */
export const InBattleAndAllied = meta.story({
  beforeEach: [
    install(() => productTransport('seat-2', allied(battleStory('preparing')))),
    () => pinned({ left: { key: 'hand', tab: 'public' }, right: { key: 'player:seat-4', tab: 'conversation' } }, false),
  ],
});

/** The same game with Hand & spice pinned bottom left and the ally's chat bottom right. */
export const PinnedHandAndAlly = meta.story({
  beforeEach: [
    install(() => productTransport('seat-2', allied(battleStory('preparing')))),
    () => pinned({ left: { key: 'hand', tab: 'public' }, right: { key: 'player:seat-4', tab: 'conversation' } }, true),
  ],
});

/** A quiet moment: no battle and no ally, so those two arms show what's missing. */
export const Quiet = meta.story({
  beforeEach: [install(() => productTransport('seat-2')), () => pinned({ left: null, right: null }, false)],
});
