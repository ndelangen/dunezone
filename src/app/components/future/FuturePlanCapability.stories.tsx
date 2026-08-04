import preview from '@sb/preview';
import { BookOpen } from 'lucide-react';

import { FuturePlanCapability } from './FuturePlanCapability';

const meta = preview.meta({
  component: FuturePlanCapability,
  parameters: { layout: 'centered' },
  args: {
    icon: <BookOpen />,
    title: 'Faithful editions',
    detail: 'Preserve the books people know.',
  },
});

export const Default = meta.story({});
