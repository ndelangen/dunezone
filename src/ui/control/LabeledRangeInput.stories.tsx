import preview from '@sb/preview';

import { LabeledRangeInput } from './LabeledRangeInput';

const meta = preview.meta({
  component: LabeledRangeInput,
  decorators: [
    (Story) => (
      <div style={{ width: 'min(100%, 20rem)' }}>
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({
  args: {
    id: 'story-range',
    label: 'Opacity (0–1)',
    min: 0,
    max: 1,
    step: 0.01,
    value: 0.42,
    onChange: () => {},
    formatDisplay: (n) => n.toFixed(2),
  },
});

export const IntegerClamped = meta.story({
  args: {
    id: 'story-int-range',
    label: 'Offset (−500–500)',
    min: -500,
    max: 500,
    step: 1,
    integer: true,
    value: 620,
    onChange: () => {},
  },
});
