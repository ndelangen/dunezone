import preview from '@sb/preview';
import { Trophy } from 'lucide-react';

import { FuturePlanItem } from './FuturePlanItem';

const meta = preview.meta({
  component: FuturePlanItem,
  parameters: { layout: 'centered' },
  args: {
    icon: <Trophy />,
    children: 'Results and leaderboards',
  },
});

export const Default = meta.story({});
