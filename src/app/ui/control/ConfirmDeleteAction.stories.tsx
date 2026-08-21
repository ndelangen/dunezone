import preview from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { ConfirmDeleteAction } from './ConfirmDeleteAction';

const meta = preview.meta({
  component: ConfirmDeleteAction,
  parameters: { layout: 'centered' },
  globals: { backgrounds: { value: 'light', grid: false } },
  args: {
    label: 'Delete faction',
    pending: false,
    onConfirm: fn(),
  },
});

/** One red glyph among the other toolbar actions, named for people who cannot see it. Hovering says "hold to delete". */
export const Default = meta.story({});

/**
 * A press short of the five seconds fires nothing: releasing cancels the countdown.
 * The full hold is pinned by the unit suite with fake timers, since a story should not wait five real seconds.
 */
export const ReleasedEarly = meta.story({
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole('button', { name: 'Delete faction' });

    await userEvent.pointer([{ keys: '[MouseLeft>]', target: trigger }]);
    await userEvent.pointer(['[/MouseLeft]']);

    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
});

/** While the deletion is in flight the trigger latches, so an impatient second hold cannot fire it twice. */
export const Pending = meta.story({
  args: { pending: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* Mantine's loading state disables the button, which is the latch made visible. */
    await expect(page.getByRole('button', { name: 'Delete faction' })).toBeDisabled();
  },
});
