import preview from '@sb/preview';

import type { Id } from '../../../../convex/_generated/dataModel';
import { ProfileGroupMemberships } from './ProfileGroupMemberships';

const meta = preview.meta({
  component: ProfileGroupMemberships,
});

export const ActiveGroups = meta.story({
  args: {
    groups: [
      {
        id: 'group-sietch-tabr' as Id<'groups'>,
        name: 'Sietch Tabr',
        slug: 'sietch-tabr',
      },
      {
        id: 'group-fremen-council' as Id<'groups'>,
        name: 'Fremen Council',
        slug: 'fremen-council',
      },
    ],
  },
});

export const NoActiveGroups = meta.story({
  args: {
    groups: [],
  },
});
