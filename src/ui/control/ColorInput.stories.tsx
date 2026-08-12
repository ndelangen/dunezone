import { ColorInput } from '@mantine/core';
import preview from '@sb/preview';

const meta = preview.meta({
  component: ColorInput,
  globals: {
    backgrounds: { value: 'light', grid: false },
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

export const Empty = meta.story({
  args: {
    defaultValue: '',
  },
});

export const Disabled = meta.story({
  args: {
    disabled: true,
  },
});
