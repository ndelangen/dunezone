import preview from '@sb/preview';
import type { GameSnapshot } from '@shared/play/protocol';

import { faction } from '../alliances.stories.fixture';
import { gameMeta, install } from '../game.stories.fixture';
import { battleStory } from '../playing.stories.fixture';
import { productTransport } from '../product.stories.fixture';

/*
 * The compass controls: the compass with search at its centre and suggestions below,
 * and two slots, bottom left and bottom right, that a window can be pinned into. The camera dial sits top right.
 */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Compass controls',
  globals: { motion: 'on' },
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
    localStorage.setItem('dunezone-compass:slots', JSON.stringify(keep ? slots : { left: null, right: null }));
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

/* Both slots pinned and every chat in the bar, so the bar and the slots have to share the table's width. */
const bothSlotsAndAllChats = [
  install(() => productTransport('seat-2')),
  () => pinned({ left: { key: 'hand', tab: 'public' }, right: { key: 'table-chat', tab: 'conversation' } }, true),
];

/** The narrowest table: the slots rise above the chat bar, which has the width to itself. */
export const Width760 = meta.story({
  globals: { viewport: { value: 'table760' } },
  beforeEach: bothSlotsAndAllChats,
});

/** A middling table: the slots at their least width still leave no room for the bar beside them. */
export const Width1000 = meta.story({
  globals: { viewport: { value: 'table1000' } },
  beforeEach: bothSlotsAndAllChats,
});

/** A wide table: both slots stand on the table's edge beside the bar. */
export const Width1280 = meta.story({
  globals: { viewport: { value: 'table1280' } },
  beforeEach: bothSlotsAndAllChats,
});

/** A quiet moment: no battle and no ally, so those two arms show what's missing. */
export const Quiet = meta.story({
  beforeEach: [install(() => productTransport('seat-2')), () => pinned({ left: null, right: null }, false)],
});
