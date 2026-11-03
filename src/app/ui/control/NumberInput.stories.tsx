import { NumberInput } from '@mantine/core';
import preview from '@sb/preview';

const meta = preview.meta({
  component: NumberInput,
  globals: {
    backgrounds: { value: 'dark', grid: false },
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

/** The steppers take the error tint with the field. */
export const WithError = meta.story({
  args: {
    error: 'Use a positive whole number.',
  },
});
