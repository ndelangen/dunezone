import preview from '@sb/preview';

import { adminDiscordRecoveryParameters } from './adminDiscord.stories.fixture';
import { voiceParameters } from './discord.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Admin/Discord',
  ...pageStoryMeta,
});

export const Dashboard = meta.story({
  args: { path: '/admin/discord' },
  parameters: voiceParameters(),
});

export const NeedsAttention = meta.story({
  args: { path: '/admin/discord' },
  parameters: adminDiscordRecoveryParameters(true),
});
