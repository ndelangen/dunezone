import preview from '@sb/preview';

import { voiceParameters } from './_app/play/voice.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Admin/Discord',
  ...pageStoryMeta,
});

export const Dashboard = meta.story({
  args: { path: '/admin/discord' },
  parameters: voiceParameters(),
});
