import preview from '@sb/preview';

import { AtlasLayout } from './AtlasLayout';
import { sidebar } from './AtlasLayout.stories.fixture';
import { expectStackedSlots, LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';

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
});

/** Above the container breakpoint: sidebar beside the content. */
export const WithSidebar = meta.story({
  render: () => (
    <AtlasLayout>
      <AtlasLayout.Sidebar>{sidebar}</AtlasLayout.Sidebar>
      <AtlasLayout.Content>
        <LayoutSlotPlaceholder name="children" tone="primary" minHeight={720} />
      </AtlasLayout.Content>
    </AtlasLayout>
  ),
  globals: { viewport: { value: 'appDesktop' } },
});

/** Below it: the sidebar becomes the first block of one column. */
export const Stacked = meta.story({
  render: () => (
    <AtlasLayout>
      <AtlasLayout.Sidebar>{sidebar}</AtlasLayout.Sidebar>
      <AtlasLayout.Content>
        <LayoutSlotPlaceholder name="children" tone="primary" minHeight={720} />
      </AtlasLayout.Content>
    </AtlasLayout>
  ),
  globals: { viewport: { value: 'appConstrained' } },
  play: async ({ canvasElement }) => {
    await expectStackedSlots(canvasElement, ['sidebar', 'children']);
  },
});
