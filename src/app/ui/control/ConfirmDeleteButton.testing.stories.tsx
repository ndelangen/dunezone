import { testingPreview } from '@sb/preview';
import { expect, fn, within } from 'storybook/test';

import { ConfirmDeleteButton } from './ConfirmDeleteButton';

/* How a loading or disabled button looks is the Button's own story; these check that this one turns them on (ADR-0005). */
const meta = testingPreview.meta({
  title: 'ConfirmDeleteButton',
  component: ConfirmDeleteButton,
  parameters: { layout: 'centered' },
  args: {
    label: 'Delete account',
    pending: false,
    onConfirm: fn(),
  },
});

/** While the caller's mutation is in flight the button latches, so an impatient second hold cannot fire it twice. */
export const Pending = meta.story({
  args: { pending: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* Mantine's loading state disables the button, which is the latch made visible. */
    await expect(page.getByRole('button')).toBeDisabled();
  },
});

/**
 * Gated on a precondition the caller owns, such as an unacknowledged checkbox.
 * Distinct from `pending`: nothing is running, the hold is not available yet.
 */
export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole('button', { name: 'Delete account' })).toBeDisabled();
  },
});
