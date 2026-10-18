import preview from '@sb/preview';
import { expect, waitFor } from 'storybook/test';

import { AtlasLayout } from './AtlasLayout';
import { expectStackedSlots, LayoutSlotPlaceholder, slotRect } from './LayoutSlotPlaceholder.stories.fixture';

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

const sidebar = <LayoutSlotPlaceholder name="sidebar" tone="secondary" minHeight={240} />;

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

/** Long content is what the sticky sidebar exists for. Scroll the canvas. */
export const StickySidebarWhileScrolling = meta.story({
  render: () => (
    <AtlasLayout>
      <AtlasLayout.Sidebar>{sidebar}</AtlasLayout.Sidebar>
      <AtlasLayout.Content>
        <LayoutSlotPlaceholder name="scrolling children" tone="primary" minHeight={1600} />
      </AtlasLayout.Content>
    </AtlasLayout>
  ),
  globals: { viewport: { value: 'appDesktop' } },
  play: async ({ canvasElement }) => {
    const view = canvasElement.ownerDocument.defaultView!;
    try {
      /* Two scroll positions past the sidebar's resting place: the content moves between them while the sidebar holds still. */
      view.scrollTo(0, 300);
      await waitFor(() => expect(view.scrollY).toBeCloseTo(300, 0));
      const sidebarBefore = slotRect(canvasElement, 'sidebar').top;
      const contentBefore = slotRect(canvasElement, 'scrolling children').top;
      view.scrollTo(0, 600);
      await waitFor(() => expect(view.scrollY).toBeCloseTo(600, 0));
      await expect(slotRect(canvasElement, 'scrolling children').top).toBeCloseTo(contentBefore - 300, 0);
      await expect(slotRect(canvasElement, 'sidebar').top).toBeCloseTo(sidebarBefore, 0);
      await expect(sidebarBefore).toBeGreaterThanOrEqual(0);
    } finally {
      view.scrollTo(0, 0);
    }
  },
});
