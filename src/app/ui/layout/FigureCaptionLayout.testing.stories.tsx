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
    <CardGrid
      aria-label="Cards"
      items={[
        {
          key: 'card',
          title: 'A card',
          figure: <LayoutSlotPlaceholder name="figure" tone="primary" minHeight={100} />,
          caption: <LayoutSlotPlaceholder name="caption" tone="secondary" minHeight={100} />,
        },
      ]}
    />
  ),
  decorators: [(Story) => <div style={{ width: '29.5rem' }}>{Story()}</div>],
  play: async ({ canvasElement }) => {
    await expectSideBySideSlots(canvasElement, ['figure', 'caption']);
  },
});
