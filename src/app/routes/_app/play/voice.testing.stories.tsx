import { testingPreview } from '@sb/preview';
import { expect } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { playingSnapshot, productTransport } from './product.stories.fixture';
import { openVoiceMenu, VOICE_INVITE, voiceParameters } from './voice.stories.fixture';

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
    await expect(page.queryByRole('link', { name: 'Join voice chat' })).toBeNull();
  },
});

export const Spectator = meta.story({
  beforeEach: install(() => productTransport('neutral', playingSnapshot('neutral'))),
  parameters: voiceParameters(),
  play: async ({ canvasElement }) => {
    const page = await openVoiceMenu(canvasElement);
    const invite = page.getByRole('link', { name: 'Join voice chat' });
    await expect(invite).toHaveAttribute('href', VOICE_INVITE);
    await expect(invite).toHaveAttribute('target', '_blank');
  },
});
