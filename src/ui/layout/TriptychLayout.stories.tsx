import preview from '@sb/preview';

import { LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';
import { TriptychLayout } from './TriptychLayout';

const meta = preview.meta({
  component: TriptychLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Three regions side by side with the centre given its own fill, collapsing to one column once its container drops below 61.25rem.',
      },
    },
  },
  args: {
    left: <LayoutSlotPlaceholder name="left" minHeight={320} />,
    center: <LayoutSlotPlaceholder name="center" minHeight={320} />,
    right: <LayoutSlotPlaceholder name="right" minHeight={320} />,
  },
  argTypes: { className: { control: false }, centerClassName: { control: false } },
});

/** Above the container breakpoint: three columns, centre filled. */
export const ThreeColumns = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
});

/** Below it: one column, in source order. */
export const Stacked = meta.story({
  globals: { viewport: { value: 'appConstrained' } },
});
