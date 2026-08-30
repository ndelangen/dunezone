import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { DocumentEditorLayout } from './DocumentEditorLayout';
import type { DocumentEditorFit } from './DocumentEditorLayout';
import { LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';

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

function expectPreviewFillToStayContained(canvasElement: HTMLElement) {
  const previewFrame = canvasElement.querySelector<HTMLElement>('[data-document-editor-preview] > div');
  expect(previewFrame).not.toBeNull();
  const requiredPreviewFrame = previewFrame as HTMLElement;
  const previewFill = requiredPreviewFrame.firstElementChild;
  expect(previewFill).not.toBeNull();
  const requiredPreviewFill = previewFill as HTMLElement;

  const frameRect = requiredPreviewFrame.getBoundingClientRect();
  const fillRect = requiredPreviewFill.getBoundingClientRect();
  expect(fillRect.x).toBeCloseTo(frameRect.x, 0);
  expect(fillRect.y).toBeCloseTo(frameRect.y, 0);
  expect(fillRect.width).toBeCloseTo(frameRect.width, 0);
  expect(fillRect.height).toBeCloseTo(frameRect.height, 0);
}

function expectSidebarToMatchPreviewMinimum(canvasElement: HTMLElement) {
  const sidebarContent = canvasElement.querySelector<HTMLElement>('[data-document-editor-sidebar] > div');
  const previewFrame = canvasElement.querySelector<HTMLElement>('[data-document-editor-preview] > div');
  const sidebarSlot = sidebarContent?.firstElementChild;
  expect(sidebarContent).not.toBeNull();
  expect(sidebarSlot).not.toBeNull();
  expect(previewFrame).not.toBeNull();
  const previewHeight = previewFrame?.getBoundingClientRect().height ?? Number.POSITIVE_INFINITY;
  expect(sidebarContent?.getBoundingClientRect().height).toBeGreaterThanOrEqual(previewHeight);
  expect(sidebarSlot?.getBoundingClientRect().height).toBeGreaterThanOrEqual(previewHeight);
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

/** Use the Controls panel to cross every allocation seam. */
export const Playground = meta.story({
  globals: { viewport: { value: 'appAuthoringWide' } },
});

/** The A4 Preview targets the viewport height. Sidebar receives the remaining width. */
export const WideFitHeight = meta.story({
  args: { fit: 'height', sidebarContentHeight: 540 },
  globals: { viewport: { value: 'appAuthoringWide' } },
  play: ({ canvasElement }) => {
    expectSidebarToMatchPreviewMinimum(canvasElement);
  },
});

/** Sidebar keeps its useful width while Preview receives the rest. */
export const WideFitWidth = meta.story({
  args: { fit: 'width', sidebarContentHeight: 540 },
  globals: { viewport: { value: 'appAuthoringWide' } },
});

/** The narrow track opens on Sidebar and leaves a visible piece of Preview. */
export const NarrowSidebarFirst = meta.story({
  args: { sidebarContentHeight: 340 },
  globals: { viewport: { value: 'appMobile' } },
  play: ({ canvasElement }) => {
    expectPreviewFillToStayContained(canvasElement);
    expectSidebarToMatchPreviewMinimum(canvasElement);
  },
});

/** The same narrow track opens at its Preview snap position. */
export const NarrowPreviewFirst = meta.story({
  args: { sidebarContentHeight: 340 },
  globals: { viewport: { value: 'appMobile' } },
  play: ({ canvasElement }) => {
    const layout = canvasElement.querySelector<HTMLElement>('[data-document-editor-layout]');
    if (layout) {
      layout.scrollLeft = layout.scrollWidth;
    }
    expectPreviewFillToStayContained(canvasElement);
    expectSidebarToMatchPreviewMinimum(canvasElement);
  },
});

/** Preview can stay visible while taller Sidebar content continues down the document. */
export const TallerSidebar = meta.story({
  args: { sidebarContentHeight: 1280 },
  globals: { viewport: { value: 'appAuthoringWide' } },
  render: renderInDocument,
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
});

/** A ratio of 1 produces a square Preview. */
export const SquarePreview = meta.story({
  args: { ratio: 1, sidebarContentHeight: 520 },
  globals: { viewport: { value: 'appAuthoringWide' } },
});

/** A wide ratio produces a landscape Preview without changing the public membrane. */
export const LandscapePreview = meta.story({
  args: { ratio: 16 / 9, sidebarContentHeight: 520 },
  globals: { viewport: { value: 'appLarge' } },
});
