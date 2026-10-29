import preview from '@sb/preview';
import { DUKE_PRAD_VIDAL_TOKEN } from '@shared/assets/leaderToken';

import { asset, db } from '@db/storybook';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({ title: 'Assets/Leader token', ...pageStoryMeta });

export const ApprovedDuke = meta.story({
  args: { path: '/assets/token-leader/duke-prad-vidal/edit' },
  parameters: {
    database: db((baseline) => {
      baseline.assets.push(asset({ type: 'token-leader', data: DUKE_PRAD_VIDAL_TOKEN }));
    }),
  },
});
