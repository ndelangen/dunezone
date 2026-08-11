import { TextInput } from '@mantine/core';
import preview from '@sb/preview';

const meta = preview.meta({
  component: TextInput,
  globals: {
    backgrounds: { value: 'light', grid: false },
  },
  parameters: {
    layout: 'centered',
  },
  args: {
    'aria-label': 'Text input',
    defaultValue: 'House Meridia',
  },
});

export const Default = meta.story({});

export const ValidationError = meta.story({
  args: {
    error: 'This name is already in use.',
  },
});

export const Disabled = meta.story({
  args: {
    disabled: true,
  },
});
