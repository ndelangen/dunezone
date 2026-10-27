import preview from '@sb/preview';
import { CardGrid } from '@ui/list/CardGrid';

import { FigureCaptionLayout } from './FigureCaptionLayout';
import {
  expectSideBySideSlots,
  expectStackedSlots,
  LayoutSlotPlaceholder,
} from './LayoutSlotPlaceholder.stories.fixture';

const figure = (
  <FigureCaptionLayout>
    <FigureCaptionLayout.Figure>
      <LayoutSlotPlaceholder name="figure" tone="primary" minHeight={100} />
    </FigureCaptionLayout.Figure>
    <FigureCaptionLayout.Caption>
      <LayoutSlotPlaceholder name="caption" tone="secondary" minHeight={100} />
    </FigureCaptionLayout.Caption>
  </FigureCaptionLayout>
);

const meta = preview.meta({
  component: FigureCaptionLayout,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A figure with its caption centred beneath it; in a one-column CardGrid the figure stands beside its caption instead.',
      },
    },
  },
  render: () => figure,
});

/** On its own, the caption sits beneath the figure. */
export const Stacked = meta.story({
  play: async ({ canvasElement }) => {
    await expectStackedSlots(canvasElement, ['figure', 'caption']);
  },
});

/** In a CardGrid narrow enough for one column, the figure stands beside its caption. */
export const InANarrowGrid = meta.story({
  render: () => (
    <CardGrid aria-label="Cards">
      <CardGrid.Item>{figure}</CardGrid.Item>
    </CardGrid>
  ),
  decorators: [(Story) => <div style={{ width: '24rem' }}>{Story()}</div>],
  play: async ({ canvasElement }) => {
    await expectSideBySideSlots(canvasElement, ['figure', 'caption']);
  },
});

/** In a CardGrid of two or more columns, the caption sits beneath the figure again. */
export const InAWideGrid = meta.story({
  render: () => (
    <CardGrid aria-label="Cards">
      <CardGrid.Item>{figure}</CardGrid.Item>
      <CardGrid.Item>
        <LayoutSlotPlaceholder name="other" tone="secondary" minHeight={60} />
      </CardGrid.Item>
    </CardGrid>
  ),
  decorators: [(Story) => <div style={{ width: '40rem' }}>{Story()}</div>],
  play: async ({ canvasElement }) => {
    await expectStackedSlots(canvasElement, ['figure', 'caption']);
  },
});
