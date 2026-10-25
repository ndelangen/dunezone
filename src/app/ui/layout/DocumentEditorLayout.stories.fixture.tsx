import type { Meta } from '@storybook/tanstack-react';
import { expect, waitFor } from 'storybook/test';

import { DocumentEditorLayout } from './DocumentEditorLayout';
import type { DocumentEditorFit } from './DocumentEditorLayout';
import { LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';

export const A4_RATIO = 210 / 297;

export interface StoryFixtureProps {
  ratio: number;
  fit: DocumentEditorFit;
  sidebarContentHeight: number;
}

export function DocumentEditorLayoutFixture({ ratio, fit, sidebarContentHeight }: StoryFixtureProps) {
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

export async function expectPreviewFillToStayContained(canvasElement: HTMLElement) {
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

export async function expectSidebarToMatchPreviewMinimum(canvasElement: HTMLElement) {
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

export function paneElement(canvasElement: HTMLElement, pane: 'sidebar' | 'preview') {
  return canvasElement.querySelector<HTMLElement>(`[data-document-editor-${pane}] > div:last-child`)!;
}

/**
 * Scrolls the document until the Layout's top edge sits each of `depths` pixels above the viewport, while the panes still run on below it, and returns where the named pane was at each.
 * The pane's stickiness is decided from measured heights, so the scrolling starts once it is set.
 */
export async function paneWhileScrolling(
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

const defaultArgs = {
  ratio: A4_RATIO,
  fit: 'height',
  sidebarContentHeight: 560,
} satisfies StoryFixtureProps;

export function renderInDocument(args: StoryFixtureProps) {
  return (
    <>
      <LayoutSlotPlaceholder name="Document before Layout" tone="tertiary" minHeight={420} />
      <DocumentEditorLayoutFixture {...args} />
      <LayoutSlotPlaceholder name="Document after Layout" tone="tertiary" minHeight={720} />
    </>
  );
}

export const documentEditorLayoutMeta = {
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
} satisfies Meta<typeof DocumentEditorLayoutFixture>;
