import preview from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { DocumentEditorLayout } from './DocumentEditorLayout';
import type { DocumentEditorFit } from './DocumentEditorLayout';
import { LayoutSlotPlaceholder, slotRect } from './LayoutSlotPlaceholder.stories.fixture';

const A4_RATIO = 210 / 297;

interface StoryFixtureProps {
  ratio: number;
  fit: DocumentEditorFit;
  sidebarContentHeight: number;
}

function DocumentEditorLayoutFixture({ ratio, fit, sidebarContentHeight }: StoryFixtureProps) {
  return (
    <DocumentEditorLayout ratio={ratio} fit={fit}>
      <DocumentEditorLayout.Sidebar>
        <LayoutSlotPlaceholder name="Sidebar" tone="secondary" minHeight={sidebarContentHeight} />
      </DocumentEditorLayout.Sidebar>
      <DocumentEditorLayout.Preview>
        <LayoutSlotPlaceholder name="Preview" tone="primary" minHeight={0} />
      </DocumentEditorLayout.Preview>
    </DocumentEditorLayout>
  );
}

async function expectPreviewFillToStayContained(canvasElement: HTMLElement) {
  const previewFrame = canvasElement.querySelector<HTMLElement>('[data-document-editor-preview] > div');
  await expect(previewFrame).not.toBeNull();
  const requiredPreviewFrame = previewFrame as HTMLElement;
  const previewFill = requiredPreviewFrame.firstElementChild;
  await expect(previewFill).not.toBeNull();
  const requiredPreviewFill = previewFill as HTMLElement;

  const frameRect = requiredPreviewFrame.getBoundingClientRect();
  const fillRect = requiredPreviewFill.getBoundingClientRect();
  await expect(fillRect.x).toBeCloseTo(frameRect.x, 0);
  await expect(fillRect.y).toBeCloseTo(frameRect.y, 0);
  await expect(fillRect.width).toBeCloseTo(frameRect.width, 0);
  await expect(fillRect.height).toBeCloseTo(frameRect.height, 0);
}

async function expectSidebarToMatchPreviewMinimum(canvasElement: HTMLElement) {
  const sidebarContent = canvasElement.querySelector<HTMLElement>('[data-document-editor-sidebar] > div');
  const previewFrame = canvasElement.querySelector<HTMLElement>('[data-document-editor-preview] > div');
  const sidebarSlot = sidebarContent?.firstElementChild;
  await expect(sidebarContent).not.toBeNull();
  await expect(sidebarSlot).not.toBeNull();
  await expect(previewFrame).not.toBeNull();
  const previewHeight = previewFrame?.getBoundingClientRect().height ?? Number.POSITIVE_INFINITY;
  await expect(sidebarContent?.getBoundingClientRect().height).toBeGreaterThanOrEqual(previewHeight);
  await expect(sidebarSlot?.getBoundingClientRect().height).toBeGreaterThanOrEqual(previewHeight);
}

function paneElement(canvasElement: HTMLElement, pane: 'sidebar' | 'preview') {
  return canvasElement.querySelector<HTMLElement>(`[data-document-editor-${pane}] > div:last-child`)!;
}

/**
 * Scrolls the document until the Layout's top edge sits each of `depths` pixels above the viewport, while the panes still run on below it, and returns where the named pane was at each.
 * The pane's stickiness is decided from measured heights, so the scrolling starts once it is set.
 */
async function paneWhileScrolling(
  canvasElement: HTMLElement,
  pane: 'sidebar' | 'preview',
  depths: readonly [number, number]
) {
  const element = paneElement(canvasElement, pane);
  await waitFor(() => expect(element).toHaveAttribute('data-sticky'));
  const view = canvasElement.ownerDocument.defaultView!;
  /* The Layout's top in document coordinates, so a scroll left over from an earlier story cannot shift the targets. */
  const layoutTop =
    canvasElement.querySelector('[data-document-editor-layout]')!.getBoundingClientRect().top + view.scrollY;
  const rects: DOMRect[] = [];
  try {
    for (const depth of depths) {
      view.scrollTo(0, layoutTop + depth);
      await waitFor(() => expect(view.scrollY).toBeCloseTo(layoutTop + depth, 0));
      rects.push(element.getBoundingClientRect());
    }
  } finally {
    view.scrollTo(0, 0);
  }
  return { rects, viewportHeight: view.innerHeight };
}

/** The pane held its place across both scroll positions and stayed whole inside the viewport. */
async function expectPaneHeldInView(canvasElement: HTMLElement, pane: 'sidebar' | 'preview') {
  const { rects, viewportHeight } = await paneWhileScrolling(canvasElement, pane, [100, 200]);
  await expect(rects[1]!.top).toBeCloseTo(rects[0]!.top, 0);
  await expect(rects[0]!.top).toBeGreaterThanOrEqual(0);
  await expect(rects[0]!.bottom).toBeLessThanOrEqual(viewportHeight);
}

const defaultArgs = {
  ratio: A4_RATIO,
  fit: 'height',
  sidebarContentHeight: 560,
} satisfies StoryFixtureProps;

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

function renderInDocument(args: StoryFixtureProps) {
  return (
    <>
      <LayoutSlotPlaceholder name="Document before Layout" tone="tertiary" minHeight={420} />
      <DocumentEditorLayoutFixture {...args} />
      <LayoutSlotPlaceholder name="Document after Layout" tone="tertiary" minHeight={720} />
    </>
  );
}

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
