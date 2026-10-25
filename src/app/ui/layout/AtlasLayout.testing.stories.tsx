import { testingPreview } from '@sb/preview';
import { expect, waitFor } from 'storybook/test';

import { AtlasLayout } from './AtlasLayout';
import { sidebar } from './AtlasLayout.stories.fixture';
import { LayoutSlotPlaceholder, slotRect } from './LayoutSlotPlaceholder.stories.fixture';

const meta = testingPreview.meta({
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
