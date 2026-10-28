import preview from '@sb/preview';
import { fn } from 'storybook/test';

import { ConfirmDeleteAction } from './ConfirmDeleteAction';

const meta = preview.meta({
  component: ConfirmDeleteAction,
  parameters: { layout: 'centered' },
  globals: { backgrounds: { value: 'dark', grid: false } },
  args: {
    label: 'Delete faction',
    pending: false,
    onConfirm: fn(),
  },
});

/** One red glyph among the other toolbar actions, named for people who cannot see it. Hovering says "hold to delete". */
export const Default = meta.story({});
