import preview from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import type { Decorator } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';

import { gameMeta } from './game.stories.fixture';
import { ChatNoticeStyleContext } from './multiplayer/SoftNotices';
import type { ChatNoticeStyle } from './multiplayer/SoftNotices';
import {
  holdNotices,
  liveSnapshot,
  noticeLog,
  noticeSetup,
  otherFactions,
  ownFaction,
  tableShown,
  writeToViewer,
} from './softNotices.stories.fixture';

/*
 * PROTOTYPE (#2981 follow-up): options for the notice an @mention raises, while the owner picks one.
 * Another faction names the viewer's faction in the table chat; the toast opens the table chat.
 * The last option also notifies a private chat message.
 */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Soft notifications/Mention options',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
  decorators: [...gameMeta.decorators, holdNotices],
  beforeEach: noticeSetup(),
  globals: { motion: 'on' },
});

const styled =
  (style: ChatNoticeStyle): Decorator =>
  (Story) => (
    <ChatNoticeStyleContext value={style}>
      <Story />
    </ChatNoticeStyleContext>
  );

/* The table chat names the viewer, as a player asking for a favour would. */
async function mentionViewer(canvasElement: HTMLElement, alsoPrivate = false) {
  const page = await tableShown(canvasElement);
  const snapshot = liveSnapshot();
  const [asker, other] = otherFactions(snapshot);
  writeToViewer(
    asker!.id,
    `@${ownFaction(snapshot).name} can you spare 3 spice for my shipment to Arrakeen? I will pay you back next turn.`
  );
  if (alsoPrivate) {
    writeToViewer(other!.id, 'Want to team up against the Emperor this turn? Ally chat is open.', other!.id);
  }
  const { log } = noticeLog(page);
  const toast = await waitForFrame(() => log.getByRole('button', { name: new RegExp(asker!.name) }));
  await expect(finishTransitions(toast)).toBeVisible();
}

/* 1. The toast names who mentioned the viewer, nothing more: "Atreides mentioned you". */
export const Named = meta.story({
  decorators: [styled('named')],
  play: ({ canvasElement }) => mentionViewer(canvasElement),
});

/* 2. Their words follow on the same line, cut at its end: "Atreides: @Harkonnen can you spare…". */
export const Quoted = meta.story({
  decorators: [styled('quoted')],
  play: ({ canvasElement }) => mentionViewer(canvasElement),
});

/* 3. "Atreides mentioned you", with their words quieter under it, up to two lines. */
export const TwoLines = meta.story({
  decorators: [styled('twoLines')],
  play: ({ canvasElement }) => mentionViewer(canvasElement),
});

/* 4. As 3, with the viewer's own name stronger in the words. */
export const NameMarked = meta.story({
  decorators: [styled('marked')],
  play: ({ canvasElement }) => mentionViewer(canvasElement),
});

/* 5. As 3, and a private chat message notifies too ("Fremen wrote to you"), opening that chat. */
export const PrivateChatsToo = meta.story({
  decorators: [styled('private')],
  play: ({ canvasElement }) => mentionViewer(canvasElement, true),
});
