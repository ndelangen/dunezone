import { Switch } from '@mantine/core';
import preview from '@sb/preview';

const meta = preview.meta({
  component: Switch,
  globals: {
    backgrounds: { value: 'dark', grid: false },
  },
  parameters: {
    layout: 'centered',
  },
  args: {
    'aria-label': 'Switch',
  },
});

export const Default = meta.story({});

export const Checked = meta.story({
  args: {
    defaultChecked: true,
  },
});
