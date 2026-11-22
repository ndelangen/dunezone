import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { VOICE_INVITE, voiceParameters } from '../../discord.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
import { playingSnapshot, productTransport } from './product.stories.fixture';
import { openVoiceMenu } from './voice.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Playing/Voice',
  beforeEach: install(() => productTransport('seat-1', playingSnapshot('seat-1'))),
  loaders: [async () => await import('./multiplayer/HostedTable')],
});

export const SharedInvite = meta.story({
  parameters: voiceParameters(),
  play: async ({ canvasElement }) => {
    const page = await openVoiceMenu(canvasElement);
    await expect(page.getByRole('link', { name: 'Join voice chat (opens in a new tab)' })).toHaveAttribute(
      'href',
      VOICE_INVITE
    );
  },
});
