import preview from '@sb/preview';

import { pageStoryMeta } from './-storybookConfig';

const meta = preview.meta({
  title: 'Admin',
  ...pageStoryMeta,
});

export const Migrations = meta.story({ args: { path: '/admin/migrations' } });
