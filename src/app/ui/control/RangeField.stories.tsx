import preview from '@sb/preview';
import { useState } from 'react';

import { RangeField } from './RangeField';

const meta = preview.meta({
  component: RangeField,
  parameters: { layout: 'padded' },
  globals: { backgrounds: { value: 'dark', grid: false } },
  decorators: [(Story) => <div style={{ maxWidth: '24rem' }}>{Story()}</div>],
  args: {
    title: 'Icon scale',
    description: 'Resize the icon within its disc; 1 is the reference size.',
    value: 1,
    min: 0.5,
    max: 2,
    step: 0.05,
    onChange: () => undefined,
  },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <RangeField {...args} value={value} onChange={setValue} />;
  },
});

/** A fractional step: the box and the slider's label both show two places. */
export const Default = meta.story({});

/** A whole step around zero, the way an offset moves either side of centre. */
export const WholeSteps = meta.story({
  args: {
    title: 'Horizontal offset',
    name: 'Horizontal icon offset',
    description: 'Move the icon left with a negative value or right with a positive value.',
    value: 0,
    min: -60,
    max: 60,
    step: 1,
    typedBeyondRange: true,
  },
});
