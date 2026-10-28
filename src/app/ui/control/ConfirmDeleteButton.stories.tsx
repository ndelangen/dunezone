import preview from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { ConfirmDeleteButton } from './ConfirmDeleteButton';

const meta = preview.meta({
  component: ConfirmDeleteButton,
  parameters: { layout: 'centered' },
  args: {
    label: 'Delete account',
    pending: false,
    onConfirm: fn(),
  },
});

/** The resting shape. A plain click fires nothing, so the hover text says "hold to delete" and that silence explains itself. */
export const Default = meta.story({});

/**
 * Mid-hold, and the reason this shape exists rather than the glyph one.
 * The label itself becomes the countdown, so a button that is already words spends them on the state rather than growing a second indicator beside it.
 * The first second shows on the press itself, before any tick, which is what makes it assertable here without waiting.
 */
export const Holding = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole('button', { name: 'Delete account' });

    await userEvent.pointer([{ keys: '[MouseLeft>]', target: trigger }]);
    await expect(trigger).toHaveTextContent('deletion in 5..');
    await userEvent.pointer([{ keys: '[/MouseLeft]', target: trigger }]);
  },
});
