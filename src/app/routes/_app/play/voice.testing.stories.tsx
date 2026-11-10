import { testingPreview } from '@sb/preview';
import { expect, waitFor } from 'storybook/test';

import { VOICE_INVITE, voiceParameters } from '../../discord.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
import { playingSnapshot, productTransport } from './product.stories.fixture';
import { openVoiceMenu } from './voice.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Playing/Voice',
  beforeEach: install(() => productTransport('seat-1', playingSnapshot('seat-1'))),
  loaders: [async () => await import('./multiplayer/HostedTable')],
});

export const Disabled = meta.story({
  parameters: voiceParameters(false),
  play: async ({ canvasElement }) => {
    const page = await openVoiceMenu(canvasElement);
    await expect(page.queryByRole('link', { name: 'Join voice chat (opens in a new tab)' })).toBeNull();
  },
});

export const Spectator = meta.story({
  beforeEach: install(() => productTransport('neutral', playingSnapshot('neutral'))),
  parameters: voiceParameters(),
  play: async ({ canvasElement }) => {
    const page = await openVoiceMenu(canvasElement);
    const invite = page.getByRole('link', { name: 'Join voice chat (opens in a new tab)' });
    await expect(invite).toHaveAttribute('href', VOICE_INVITE);
    await expect(invite).toHaveAttribute('target', '_blank');
  },
});

export const InviteOnAPhone = meta.story({
  parameters: voiceParameters(),
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) => {
    const page = await openVoiceMenu(canvasElement);
    const invite = page.getByRole('link', { name: 'Join voice chat (opens in a new tab)' });
    const menu = page.getByRole('menu');
    const view = canvasElement.ownerDocument.defaultView!;
    await waitFor(async () => {
      await expect(invite).toBeVisible();
      await expect(invite).toHaveAttribute('href', VOICE_INVITE);
      await expect(invite).toHaveAttribute('target', '_blank');
      const menuBounds = menu.getBoundingClientRect();
      const inviteBounds = invite.getBoundingClientRect();
      await expect(menuBounds.left).toBeGreaterThanOrEqual(0);
      await expect(menuBounds.right).toBeLessThanOrEqual(view.innerWidth);
      await expect(menuBounds.top).toBeGreaterThanOrEqual(0);
      await expect(menuBounds.bottom).toBeLessThanOrEqual(view.innerHeight);
      await expect(inviteBounds.left).toBeGreaterThanOrEqual(menuBounds.left);
      await expect(inviteBounds.right).toBeLessThanOrEqual(menuBounds.right);
      await expect(inviteBounds.top).toBeGreaterThanOrEqual(menuBounds.top);
      await expect(inviteBounds.bottom).toBeLessThanOrEqual(menuBounds.bottom);
      await expect(invite.scrollWidth).toBeLessThanOrEqual(invite.clientWidth);
    });
  },
});
