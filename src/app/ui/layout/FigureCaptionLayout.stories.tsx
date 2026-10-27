import preview from '@sb/preview';

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
          'A figure with its caption centred beneath it; from 26rem of its own width the figure stands beside its caption instead.',
      },
    },
  },
  render: () => figure,
});

/** Under 26rem of its own width, the caption sits beneath the figure, so it keeps the width to read. */
export const Stacked = meta.story({
  decorators: [(Story) => <div style={{ width: '18rem' }}>{Story()}</div>],
  play: async ({ canvasElement }) => {
    await expectStackedSlots(canvasElement, ['figure', 'caption']);
  },
});

/** From 26rem of its own width, the figure stands beside its caption. */
export const Wide = meta.story({
  decorators: [(Story) => <div style={{ width: '32rem' }}>{Story()}</div>],
  play: async ({ canvasElement }) => {
    await expectSideBySideSlots(canvasElement, ['figure', 'caption']);
  },
});
