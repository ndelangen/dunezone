import preview from '@sb/preview';

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
 * Whisper notices (playtest feedback, 2026-11-25): in a game created to announce private messages, every private message draws a
 * thread along the bottom bar from the writer's faction token to the reader's, and the table chat says who wrote to whom.
 * Each story keeps the table whispering every couple of seconds, between other factions and the viewer's own.
 */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Whisper notices',
  globals: { motion: 'on' },
  parameters: { ...gameMeta.parameters, chromatic: { disableSnapshot: true } },
  tags: ['!test'],
  loaders: [
    async () => {
      await import('../../../play/table/HostedTable');
    },
  ],
  decorators: [...gameMeta.decorators, holdNotices],
  beforeEach: [
    noticeSetup((snapshot) => {
      snapshot.announceWhispers = true;
    }),
    stopWhisperingAfter,
  ],
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

/**
 * A thread in the writer's faction colour draws itself from their token to the reader's, in front of the table and behind the bar;
 * the reader's token pops as it arrives, and the thread fades.
 */
export const Thread = meta.story({
  play: ({ canvasElement }) => keepWhispering(canvasElement),
});

/** With motion reduced nothing draws or pops: the whole thread shows a moment and fades. */
export const MotionReduced = meta.story({
  globals: { motion: 'reduce' },
  play: ({ canvasElement }) => keepWhispering(canvasElement),
});
