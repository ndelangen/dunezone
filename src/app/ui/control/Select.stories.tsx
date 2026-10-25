import { Select } from '@mantine/core';
import preview from '@sb/preview';

const options = [
  { value: 'green', label: 'Green' },
  { value: 'teal', label: 'Teal' },
  { value: 'orange', label: 'Orange' },
];

const meta = preview.meta({
  component: Select,
  globals: {
    backgrounds: { value: 'dark', grid: false },
  },
  parameters: {
    layout: 'centered',
  },
  args: {
    'aria-label': 'Select',
    data: options,
    defaultValue: 'green',
  },
});

export const Default = meta.story({});

export const Empty = meta.story({
  args: {
    defaultValue: null,
    placeholder: 'Choose a color',
  },
});
