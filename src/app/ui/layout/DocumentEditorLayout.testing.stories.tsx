import { testingPreview } from '@sb/preview';
import { expect } from 'storybook/test';

import {
  A4_RATIO,
  expectPreviewFillToStayContained,
  expectSidebarToMatchPreviewMinimum,
  paneWhileScrolling,
  renderInDocument,
} from './DocumentEditorLayout.stories.fixture';
import { documentEditorLayoutMeta } from './DocumentEditorLayout.stories.fixture';

const meta = testingPreview.meta({ ...documentEditorLayoutMeta, title: 'DocumentEditorLayout' });

/** The same narrow track opens at its Preview snap position. */
export const NarrowPreviewFirst = meta.story({
  args: { sidebarContentHeight: 340 },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const layout = canvasElement.querySelector<HTMLElement>('[data-document-editor-layout]');
    if (layout) {
      layout.scrollLeft = layout.scrollWidth;
    }
    await expectPreviewFillToStayContained(canvasElement);
    await expectSidebarToMatchPreviewMinimum(canvasElement);
    /* Snapped to its end, the track shows the whole Preview, which the Sidebar-first story only peeks at. */
    const track = layout!.getBoundingClientRect();
    const preview = canvasElement.querySelector('[data-document-editor-preview]')!.getBoundingClientRect();
    await expect(preview.left).toBeGreaterThanOrEqual(track.left);
    await expect(preview.right).toBeLessThanOrEqual(track.right + 1);
  },
});

/** The shorter pane stays bottom-pinned when both panes are taller than the viewport. */
export const BothTallerThanViewport = meta.story({
  args: { ratio: A4_RATIO, fit: 'width', sidebarContentHeight: 1480 },
  globals: { viewport: { value: 'appAuthoringWide' } },
  render: renderInDocument,
  play: async ({ canvasElement }) => {
    /* Too tall to fit, the Preview's top runs off while its foot holds still above the viewport's. */
    const { rects, viewportHeight } = await paneWhileScrolling(canvasElement, 'preview', [300, 450]);
    await expect(rects[0]!.top).toBeLessThan(0);
    await expect(rects[1]!.bottom).toBeCloseTo(rects[0]!.bottom, 0);
    await expect(rects[0]!.bottom).toBeLessThanOrEqual(viewportHeight);
  },
});
