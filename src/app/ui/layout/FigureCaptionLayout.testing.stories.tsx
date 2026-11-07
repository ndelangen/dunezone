import { testingPreview } from '@sb/preview';
import { TileGrid } from '@ui/list/TileGrid';
import { Card } from '@ui/surface/Card';

import { FigureCaptionLayout } from './FigureCaptionLayout';
import { expectSideBySideSlots, LayoutSlotPlaceholder } from './LayoutSlotPlaceholder.stories.fixture';

const meta = testingPreview.meta({
  component: FigureCaptionLayout,
  parameters: { layout: 'padded' },
});

/** It answers to its own width, not to what holds it: in a grid of one column as wide, the figure stands beside its caption as it does alone. */
export const WideInAGrid = meta.story({
  render: () => (
    <TileGrid size="wide" aria-label="Cards">
      <Card title="A card" padding="md">
        <FigureCaptionLayout>
          <FigureCaptionLayout.Figure>
            <LayoutSlotPlaceholder name="figure" tone="primary" minHeight={100} />
          </FigureCaptionLayout.Figure>
          <FigureCaptionLayout.Caption>
            <LayoutSlotPlaceholder name="caption" tone="secondary" minHeight={100} />
          </FigureCaptionLayout.Caption>
        </FigureCaptionLayout>
      </Card>
    </TileGrid>
  ),
  decorators: [(Story) => <div style={{ width: '29.5rem' }}>{Story()}</div>],
  play: async ({ canvasElement }) => {
    await expectSideBySideSlots(canvasElement, ['figure', 'caption']);
  },
});
