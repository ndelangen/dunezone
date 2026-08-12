import { NumberInput } from '@mantine/core';
import preview from '@sb/preview';

const meta = preview.meta({
  component: NumberInput,
  globals: {
    backgrounds: { value: 'light', grid: false },
  },
  parameters: {
    layout: 'centered',
  },
  args: {
    'aria-label': 'Number input',
    defaultValue: 10,
  },
});

export const Default = meta.story({});

export const Bounded = meta.story({
  args: {
    min: 0,
    max: 20,
  },
});

export const Disabled = meta.story({
  args: {
    disabled: true,
  },
});
