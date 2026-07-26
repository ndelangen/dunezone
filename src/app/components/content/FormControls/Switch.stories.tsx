import { Switch } from '@mantine/core';
import preview from '@sb/preview';

const meta = preview.meta({
  title: 'Form Controls/Switch',
  component: Switch,
  globals: {
    backgrounds: { value: 'light', grid: false },
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

export const Disabled = meta.story({
  args: {
    disabled: true,
  },
});
