import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { DocumentEditorLayout } from './DocumentEditorLayout';
import type { DocumentEditorFit } from './DocumentEditorLayout';
import {
  DocumentEditorLayoutFixture,
  expectPreviewFillToStayContained,
  expectSidebarToMatchPreviewMinimum,
  paneElement,
  paneWhileScrolling,
  defaultArgs,
  renderInDocument,
} from './DocumentEditorLayout.stories.fixture';
import { LayoutSlotPlaceholder, slotRect } from './LayoutSlotPlaceholder.stories.fixture';

/** The pane held its place across both scroll positions and stayed whole inside the viewport. */
async function expectPaneHeldInView(canvasElement: HTMLElement, pane: 'sidebar' | 'preview') {
  const { rects, viewportHeight } = await paneWhileScrolling(canvasElement, pane, [100, 200]);
  await expect(rects[1]!.top).toBeCloseTo(rects[0]!.top, 0);
  await expect(rects[0]!.top).toBeGreaterThanOrEqual(0);
  await expect(rects[0]!.bottom).toBeLessThanOrEqual(viewportHeight);
}

const meta = preview.meta({
  title: 'DocumentEditorLayout',
  component: DocumentEditorLayoutFixture,
  args: defaultArgs,
  argTypes: {
    ratio: { control: { type: 'number', min: 0.45, max: 1.8, step: 0.01 } },
    fit: { control: { type: 'inline-radio' }, options: ['height', 'width'] satisfies DocumentEditorFit[] },
    sidebarContentHeight: { control: { type: 'range', min: 240, max: 1600, step: 20 } },
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'DocumentEditorLayout takes ratio, fit, Sidebar, and Preview. Use the viewport toolbar to exercise container sizes. Sidebar content height belongs only to the neutral story fixture.',
      },
    },
  },
});

/** The A4 Preview targets the viewport height. Sidebar receives the remaining width. */
export const WideFitHeight = meta.story({
  args: { fit: 'height', sidebarContentHeight: 540 },
  globals: { viewport: { value: 'appAuthoringWide' } },
  play: async ({ canvasElement }) => {
    await expectSidebarToMatchPreviewMinimum(canvasElement);
  },
});

/** Sidebar keeps its useful width while Preview receives the rest. */
export const WideFitWidth = meta.story({
  args: { fit: 'width', sidebarContentHeight: 540 },
  globals: { viewport: { value: 'appAuthoringWide' } },
  play: async ({ canvasElement }) => {
    const layout = canvasElement.querySelector('[data-document-editor-layout]')!.getBoundingClientRect();
    const preview = canvasElement.querySelector('[data-document-editor-preview]')!.getBoundingClientRect();
    /* The Sidebar stops at its preferred 27rem, and the Preview runs from beside it to the Layout's far edge. */
    await expect(slotRect(canvasElement, 'Sidebar').width).toBeLessThanOrEqual(27 * 16);
    await expect(preview.right).toBeCloseTo(layout.right, 0);
    await expect(paneElement(canvasElement, 'preview').getBoundingClientRect().width).toBeCloseTo(preview.width, 0);
  },
});

/** The narrow track opens on Sidebar and leaves a visible piece of Preview. */
export const NarrowSidebarFirst = meta.story({
  args: { sidebarContentHeight: 340 },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    await expectPreviewFillToStayContained(canvasElement);
    await expectSidebarToMatchPreviewMinimum(canvasElement);
  },
});

/** Preview can stay visible while taller Sidebar content continues down the document. */
export const TallerSidebar = meta.story({
  args: { sidebarContentHeight: 1280 },
  globals: { viewport: { value: 'appAuthoringWide' } },
  render: renderInDocument,
  play: async ({ canvasElement }) => {
    await expectPaneHeldInView(canvasElement, 'preview');
  },
});

/** Sidebar can stay visible while the taller Preview continues down the document. */
export const TallerPreview = meta.story({
  args: { ratio: 0.5, fit: 'width', sidebarContentHeight: 360 },
  globals: { viewport: { value: 'appAuthoringWide' } },
  render: renderInDocument,
});

/** A wide ratio produces a landscape Preview without changing the public membrane. */
export const LandscapePreview = meta.story({
  args: { ratio: 16 / 9, sidebarContentHeight: 520 },
  globals: { viewport: { value: 'appLarge' } },
});

export const CompactPreviewWithTools = meta.story({
  args: { ratio: 1, fit: 'width', sidebarContentHeight: 540 },
  render: () => (
    <DocumentEditorLayout ratio={1} fit="width" sidebarSize="compact">
      <DocumentEditorLayout.Sidebar>
        <LayoutSlotPlaceholder name="Sidebar" tone="secondary" minHeight={540} />
      </DocumentEditorLayout.Sidebar>
      <DocumentEditorLayout.PreviewTools>
        <LayoutSlotPlaceholder name="Preview tools" tone="tertiary" minHeight={48} />
      </DocumentEditorLayout.PreviewTools>
      <DocumentEditorLayout.Preview>
        <LayoutSlotPlaceholder name="Preview" tone="primary" minHeight={0} />
      </DocumentEditorLayout.Preview>
    </DocumentEditorLayout>
  ),
  play: async ({ canvasElement }) => {
    const tools = slotRect(canvasElement, 'Preview tools');
    const preview = slotRect(canvasElement, 'Preview');
    await expect(tools.bottom).toBeLessThanOrEqual(preview.top);
    await expect(tools.left).toBeCloseTo(preview.left, 0);
    await expect(within(canvasElement).getByText('Preview tools')).toBeVisible();
  },
});
