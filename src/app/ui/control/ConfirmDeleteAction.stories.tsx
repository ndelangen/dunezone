import preview from '@sb/preview';
import { expect, fn, within } from 'storybook/test';

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

/** While the deletion is in flight the trigger latches, so an impatient second hold cannot fire it twice. */
export const Pending = meta.story({
  args: { pending: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* Mantine's loading state disables the button, which is the latch made visible. */
    await expect(page.getByRole('button', { name: 'Delete faction' })).toBeDisabled();
  },
});
