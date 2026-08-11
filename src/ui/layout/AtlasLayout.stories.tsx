import preview from '@sb/preview';

import { AtlasLayout } from './AtlasLayout';
import { LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';

const meta = preview.meta({
  component: AtlasLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A sticky sidebar beside a long scrolling column, collapsing to one column once its container drops below 56.25rem.',
      },
    },
  },
  args: {
    sidebar: <LayoutSlotPlaceholder name="sidebar" minHeight={240} />,
    children: <LayoutSlotPlaceholder name="children" minHeight={720} />,
  },
  argTypes: { className: { control: false }, sidebarClassName: { control: false } },
});

/** Above the container breakpoint: sidebar beside the content. */
export const WithSidebar = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
});

/** Below it: the sidebar becomes the first block of one column. */
export const Stacked = meta.story({
  globals: { viewport: { value: 'appConstrained' } },
});

/** Long content is what the sticky sidebar exists for — scroll the canvas. */
export const StickySidebarWhileScrolling = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  args: { children: <LayoutSlotPlaceholder name="scrolling children" minHeight={1600} /> },
});
