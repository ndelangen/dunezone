import { Box } from '@mantine/core';
import preview from '@sb/preview';
import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import { DocumentEditorLayout } from './DocumentEditorLayout';
import type { DocumentEditorFit } from './DocumentEditorLayout';
import { LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';

const A4_RATIO = 210 / 297;

interface StoryFixtureProps {
  ratio: number;
  fit: DocumentEditorFit;
  containerWidth: number;
  sidebarContentHeight: number;
  previewFirst?: boolean;
}

function DocumentEditorLayoutFixture({
  ratio,
  fit,
  containerWidth,
  sidebarContentHeight,
  previewFirst = false,
}: StoryFixtureProps) {
  const fixtureRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!previewFirst) {
      return;
    }
    const layout = fixtureRef.current?.querySelector<HTMLElement>('[data-document-editor-layout]');
    if (!layout) {
      return;
    }
    layout.scrollLeft = layout.scrollWidth;
  }, [containerWidth, fit, previewFirst, ratio]);

  return (
    <Box ref={fixtureRef} w={containerWidth} maw="100%" mx="auto">
      <DocumentEditorLayout ratio={ratio} fit={fit}>
        <DocumentEditorLayout.Sidebar>
          <LayoutSlotPlaceholder name="Sidebar" minHeight={sidebarContentHeight} />
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <LayoutSlotPlaceholder name="Preview" minHeight={0} />
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}

function StoryCanvas({ children }: { children: ReactNode }) {
  return (
    <Box mih="100dvh" p="lg">
      {children}
    </Box>
  );
}

const defaultArgs = {
  ratio: A4_RATIO,
  fit: 'height',
  containerWidth: 1040,
  sidebarContentHeight: 560,
  previewFirst: false,
} satisfies StoryFixtureProps;

const meta = preview.meta({
  title: 'DocumentEditorLayout',
  component: DocumentEditorLayoutFixture,
  args: defaultArgs,
  argTypes: {
    ratio: { control: { type: 'number', min: 0.45, max: 1.8, step: 0.01 } },
    fit: { control: { type: 'inline-radio' }, options: ['height', 'width'] satisfies DocumentEditorFit[] },
    containerWidth: { control: { type: 'range', min: 352, max: 1400, step: 8 } },
    sidebarContentHeight: { control: { type: 'range', min: 240, max: 1600, step: 20 } },
    previewFirst: { control: false, table: { disable: true } },
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'DocumentEditorLayout takes only ratio, fit, Sidebar, and Preview. Container width and Sidebar content height belong to this story fixture so the Controls panel can exercise the Layout without expanding its membrane.',
      },
    },
  },
  decorators: [
    function PaddedCanvas(Story) {
      return (
        <StoryCanvas>
          <Story />
        </StoryCanvas>
      );
    },
  ],
});

/** Use the Controls panel to cross every allocation seam. */
export const Playground = meta.story({});

/** The A4 Preview targets the viewport height. Sidebar receives the remaining width. */
export const WideFitHeight = meta.story({
  args: { fit: 'height', containerWidth: 1240, sidebarContentHeight: 540 },
});

/** Sidebar keeps its useful width while Preview receives the rest. */
export const WideFitWidth = meta.story({
  args: { fit: 'width', containerWidth: 1240, sidebarContentHeight: 540 },
});

/** The narrow track opens on Sidebar and leaves a visible piece of Preview. */
export const NarrowSidebarFirst = meta.story({
  args: { containerWidth: 560, sidebarContentHeight: 520 },
});

/** The same narrow track opens at its Preview snap position. */
export const NarrowPreviewFirst = meta.story({
  args: { containerWidth: 560, sidebarContentHeight: 520, previewFirst: true },
});

/** Preview can stay visible while taller Sidebar content continues down the document. */
export const TallerSidebar = meta.story({
  args: { containerWidth: 1240, sidebarContentHeight: 1280 },
  render: (args) => (
    <>
      <LayoutSlotPlaceholder name="Document before Layout" minHeight={420} />
      <DocumentEditorLayoutFixture {...args} />
      <LayoutSlotPlaceholder name="Document after Layout" minHeight={720} />
    </>
  ),
});

/** Sidebar can stay visible while the taller Preview continues down the document. */
export const TallerPreview = meta.story({
  args: { ratio: 0.5, fit: 'width', containerWidth: 1240, sidebarContentHeight: 360 },
  render: (args) => (
    <>
      <LayoutSlotPlaceholder name="Document before Layout" minHeight={420} />
      <DocumentEditorLayoutFixture {...args} />
      <LayoutSlotPlaceholder name="Document after Layout" minHeight={720} />
    </>
  ),
});

/** Neither pane sticks when both are taller than the viewport. */
export const BothTallerThanViewport = meta.story({
  args: { ratio: 0.5, fit: 'width', containerWidth: 1240, sidebarContentHeight: 1480 },
  render: (args) => (
    <>
      <LayoutSlotPlaceholder name="Document before Layout" minHeight={420} />
      <DocumentEditorLayoutFixture {...args} />
      <LayoutSlotPlaceholder name="Document after Layout" minHeight={720} />
    </>
  ),
});

/** A ratio of 1 produces a square Preview. */
export const SquarePreview = meta.story({
  args: { ratio: 1, containerWidth: 1240, sidebarContentHeight: 520 },
});

/** A wide ratio produces a landscape Preview without changing the public membrane. */
export const LandscapePreview = meta.story({
  args: { ratio: 16 / 9, containerWidth: 1400, sidebarContentHeight: 520 },
});
