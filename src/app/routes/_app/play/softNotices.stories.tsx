import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import type { SoftNoticeVariant } from './multiplayer/SoftNotices';
import { productTransport } from './product.stories.fixture';
import { NOTICE_VIEWER, withSoftNotices } from './softNotices.stories.fixture';

/*
 * Prototypes of soft notifications over the table (#2981): the same minute of play, told six ways.
 * Each story plays a loop of what happens to the viewer: their turns, a payment, a ping, an alliance offer and a mention.
 */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Soft notifications',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
  beforeEach: install(() => productTransport(NOTICE_VIEWER)),
});

/* The first notice of the loop, the viewer's turn to bid, arrives over the table. */
const firstNoticeArrives = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const log = within(within(canvasElement.ownerDocument.body).getByRole('log', { name: 'Notifications' }));
  await waitForFrame(() => expect(log.getByText('Your turn to bid')).toBeInTheDocument());
};

const variant = (name: SoftNoticeVariant) => ({ decorators: [withSoftNotices(name)], play: firstNoticeArrives });

/* Toasts stack under the phase header, newest on top, and fade after a few seconds. */
export const HeaderToasts = meta.story(variant('header'));

/* Toasts stack in the lower right, above the table chat button, newest at the bottom. */
export const CornerStack = meta.story(variant('corner'));

/* One line under the header that the newest notice replaces, saying how many more came. */
export const HeaderTicker = meta.story(variant('ticker'));

/* The sender's token under the game's name pulses and speaks the newest notice in a bubble. */
export const TokenBubble = meta.story(variant('bubble'));

/* Header toasts, and the screen's edge glows softly when it is the viewer's turn. */
export const TurnGlow = meta.story(variant('glow'));

/* Tokens down the left edge that stay until clicked, each saying its line on hover. */
export const UnreadRail = meta.story(variant('rail'));
