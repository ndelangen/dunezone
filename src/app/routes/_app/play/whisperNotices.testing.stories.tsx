import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect } from 'storybook/test';

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

/* What a private message shows the table along the bottom bar, in a game created to announce private messages. */
const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Whisper notices',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
  decorators: [...gameMeta.decorators, holdNotices],
  beforeEach: noticeSetup((snapshot) => {
    snapshot.announceWhispers = true;
  }),
});

const threads = (canvasElement: HTMLElement) =>
  canvasElement.ownerDocument.querySelectorAll<SVGPathElement>('[data-whisper-threads] [data-whisper-thread]');

/* The viewer writes to another faction: one thread runs between their tokens in the bar, then goes. */
export const PrivateMessageDrawsAThread = meta.story({
  play: async ({ canvasElement }) => {
    await tableShown(canvasElement);
    const snapshot = liveSnapshot();
    await whisperAtTable(ownFaction(snapshot).id, otherFactions(snapshot)[0]!.id);
    const [thread] = await waitForFrame(
      () => {
        const shown = threads(canvasElement);
        if (shown.length !== 1) {
          throw new Error(`${shown.length} threads drawn.`);
        }
        return shown;
      },
      { timeout: 10_000 }
    );
    await expect(thread!.getAttribute('d')).toMatch(/^M .+ Q .+/);
    await waitForFrame(
      () => {
        if (threads(canvasElement).length) {
          throw new Error('The thread is still drawn.');
        }
      },
      { timeout: 10_000 }
    );
  },
});

/* A game that does not announce private messages draws nothing for them. */
export const NotAnnouncedDrawsNothing = meta.story({
  beforeEach: noticeSetup(),
  play: async ({ canvasElement }) => {
    await tableShown(canvasElement);
    const snapshot = liveSnapshot();
    await whisperAtTable(otherFactions(snapshot)[0]!.id, ownFaction(snapshot).id);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await expect(threads(canvasElement)).toHaveLength(0);
  },
});
