import { Select } from '@mantine/core';
import preview from '@sb/preview';

const options = [
  { value: 'green', label: 'Green' },
  { value: 'teal', label: 'Teal' },
  { value: 'orange', label: 'Orange' },
];

const meta = preview.meta({
  title: 'Form Controls/Select',
  component: Select,
  globals: {
    backgrounds: { value: 'light', grid: false },
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

export const Searchable = meta.story({
  args: {
    searchable: true,
  },
});

export const Empty = meta.story({
  args: {
    defaultValue: null,
    placeholder: 'Choose a color',
  },
});

export const Disabled = meta.story({
  args: {
    disabled: true,
  },
});
