import { ColorInput } from '@mantine/core';
import preview from '@sb/preview';

const meta = preview.meta({
  component: ColorInput,
  globals: {
    backgrounds: { value: 'dark', grid: false },
  },
  parameters: {
    layout: 'centered',
  },
  args: {
    'aria-label': 'Color input',
    format: 'hex',
    defaultValue: '#444444',
  },
});

export const Default = meta.story({});
