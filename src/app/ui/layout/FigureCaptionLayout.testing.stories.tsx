import { testingPreview } from '@sb/preview';
import { CardGrid } from '@ui/list/CardGrid';

import { FigureCaptionLayout } from './FigureCaptionLayout';
import { expectSideBySideSlots, LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';

const meta = testingPreview.meta({
  component: FigureCaptionLayout,
  parameters: { layout: 'padded' },
});

/** It answers to its own width, not to what holds it: in a grid of one column as wide, the figure stands beside its caption as it does alone. */
export const WideInAGrid = meta.story({
  render: () => (
    <CardGrid aria-label="Cards">
      <CardGrid.Item>
        <FigureCaptionLayout>
          <FigureCaptionLayout.Figure>
            <LayoutSlotPlaceholder name="figure" tone="primary" minHeight={100} />
          </FigureCaptionLayout.Figure>
          <FigureCaptionLayout.Caption>
            <LayoutSlotPlaceholder name="caption" tone="secondary" minHeight={100} />
          </FigureCaptionLayout.Caption>
        </FigureCaptionLayout>
      </CardGrid.Item>
    </CardGrid>
  ),
  decorators: [(Story) => <div style={{ width: '28rem' }}>{Story()}</div>],
  play: async ({ canvasElement }) => {
    await expectSideBySideSlots(canvasElement, ['figure', 'caption']);
  },
});
