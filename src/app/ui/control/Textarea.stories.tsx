import { Textarea } from '@mantine/core';
import preview from '@sb/preview';

const meta = preview.meta({
  component: Textarea,
  globals: {
    backgrounds: { value: 'light', grid: false },
  },
  parameters: {
    layout: 'centered',
  },
  args: {
    'aria-label': 'Textarea',
    defaultValue: 'The sleeper must awaken.',
    minRows: 3,
  },
});

export const Default = meta.story({});

export const Autosize = meta.story({
  args: {
    autosize: true,
  },
});

export const Disabled = meta.story({
  args: {
    disabled: true,
  },
});
