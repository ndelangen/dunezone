import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';

import { AutoGrid } from './AutoGrid';

const meta = preview.meta({
  component: AutoGrid,
  parameters: {
    ...legacyStoryParameters,
    layout: 'padded',
  },
});

const demoCellIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export const Default = meta.story({
  render: () => (
    <AutoGrid minColumnWidth="140px" gap={4}>
      {demoCellIds.map((id, i) => (
        <div
          key={id}
          style={{
            padding: '1rem',
            background: 'rgba(0,0,0,0.06)',
            borderRadius: 8,
            textAlign: 'center',
          }}
        >
          {i + 1}
        </div>
      ))}
    </AutoGrid>
  ),
});
