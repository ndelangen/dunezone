import preview from '@sb/preview';
import type { Decorator } from '@storybook/tanstack-react';

import { WhisperLookContext } from './compass/WhisperFlights';
import type { WhisperLook } from './compass/WhisperFlights';
import { gameMeta } from './game.stories.fixture';
import {
  holdNotices,
  liveSnapshot,
  noticeSetup,
  otherFactions,
  ownFaction,
  tableShown,
  whisperAtTable,
} from './softNotices.stories.fixture';

/*
 * Whisper notices (playtest feedback, 2026-11-25): in a game created to announce private messages, every private message flies a
 * small bubble along the bottom bar from the writer's faction token to the reader's, and the table chat says who wrote to whom.
 * Each story keeps the table whispering every couple of seconds, between other factions and the viewer's own, in one look.
 */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Whisper notices',
  globals: { motion: 'on' },
  parameters: { ...gameMeta.parameters, chromatic: { disableSnapshot: true } },
  tags: ['!test'],
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
  decorators: [...gameMeta.decorators, holdNotices],
  beforeEach: [noticeSetup(), stopWhisperingAfter],
});

/* Which story's whispering may go on; a story that ends steps it, which stops its loop. */
let generation = 0;
function stopWhisperingAfter() {
  return () => {
    generation += 1;
  };
}

const WHISPER_EVERY_MS = 2200;

/* Keeps the table whispering: other factions to each other, to the viewer, and the viewer to them, in turn. */
async function keepWhispering(canvasElement: HTMLElement) {
  const mine = generation;
  await tableShown(canvasElement);
  const snapshot = liveSnapshot();
  const own = ownFaction(snapshot).id;
  const others = otherFactions(snapshot).map((faction) => faction.id);
  const other = (index: number) => others[index % others.length]!;
  const pairs = [
    [other(0), other(2)],
    [other(1), own],
    [own, other(3)],
    [other(4), other(0)],
    [other(2), other(1)],
  ] as const;
  let next = 0;
  const tick = async () => {
    if (generation !== mine) {
      return;
    }
    const [from, to] = pairs[next % pairs.length]!;
    next += 1;
    await whisperAtTable(from, to);
    setTimeout(() => void tick(), WHISPER_EVERY_MS);
  };
  await tick();
}

function look(value: WhisperLook): Decorator {
  return (Story) => (
    <WhisperLookContext value={value}>
      <Story />
    </WhisperLookContext>
  );
}

/** A: a small speech bubble arcs from the writer's token to the reader's, and the reader's token nods as it lands. */
export const Bubble = meta.story({
  decorators: [look('bubble')],
  play: ({ canvasElement }) => keepWhispering(canvasElement),
});

/** B: a spark of light with a short tail, like a shooting star between the tokens. */
export const Spark = meta.story({
  decorators: [look('spark')],
  play: ({ canvasElement }) => keepWhispering(canvasElement),
});

/** C: a typing pill, its three dots bobbing, floats across. */
export const Typing = meta.story({
  decorators: [look('typing')],
  play: ({ canvasElement }) => keepWhispering(canvasElement),
});

/** D: a small envelope arcs across. */
export const Envelope = meta.story({
  decorators: [look('envelope')],
  play: ({ canvasElement }) => keepWhispering(canvasElement),
});

/** E: nothing travels; a thin thread draws itself between the two tokens, holds a moment, and fades. */
export const Thread = meta.story({
  decorators: [look('thread')],
  play: ({ canvasElement }) => keepWhispering(canvasElement),
});

/** F: a small copy of the writer's own token flies to the reader. */
export const WritersToken = meta.story({
  decorators: [look('token')],
  play: ({ canvasElement }) => keepWhispering(canvasElement),
});

/** With motion reduced nothing travels: the bubble shows a moment above the reader's token and fades. */
export const MotionReduced = meta.story({
  globals: { motion: 'reduce' },
  decorators: [look('bubble')],
  play: ({ canvasElement }) => keepWhispering(canvasElement),
});
