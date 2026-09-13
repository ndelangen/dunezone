import preview from '@sb/preview';

import { CalloutSurface } from './CalloutSurface';
import { SurfaceFiller } from './SurfaceFiller.stories.fixture';

const meta = preview.meta({
  title: 'CalloutSurface',
  component: CalloutSurface,
  parameters: { layout: 'padded' },
  args: {
    children: <SurfaceFiller height={220} />,
    actions: <span>Attached actions</span>,
  },
});

export const CapsuleWithPointer = meta.story({});
