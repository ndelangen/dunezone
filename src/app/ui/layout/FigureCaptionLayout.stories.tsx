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
          'A figure with its caption centred beneath it; under 20rem of its own width the figure stands beside its caption instead.',
      },
    },
  },
  render: () => figure,
});

/** With room, the caption sits beneath the figure. */
export const Stacked = meta.story({
  decorators: [(Story) => <div style={{ width: '24rem' }}>{Story()}</div>],
  play: async ({ canvasElement }) => {
    await expectStackedSlots(canvasElement, ['figure', 'caption']);
  },
});

/** Under 20rem of its own width, the figure stands beside its caption. */
export const Narrow = meta.story({
  decorators: [(Story) => <div style={{ width: '18rem' }}>{Story()}</div>],
  play: async ({ canvasElement }) => {
    await expectSideBySideSlots(canvasElement, ['figure', 'caption']);
  },
});

/** It answers to its own width, not to what holds it: in a grid cell of the same width it arranges the same. */
export const NarrowInAGrid = meta.story({
  render: () => (
    <CardGrid aria-label="Cards">
      <CardGrid.Item>{figure}</CardGrid.Item>
    </CardGrid>
  ),
  decorators: [(Story) => <div style={{ width: '18rem' }}>{Story()}</div>],
  play: async ({ canvasElement }) => {
    await expectSideBySideSlots(canvasElement, ['figure', 'caption']);
  },
});
