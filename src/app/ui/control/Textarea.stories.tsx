import { Textarea } from '@mantine/core';
import preview from '@sb/preview';

const meta = preview.meta({
  component: Textarea,
  globals: {
    backgrounds: { value: 'dark', grid: false },
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
