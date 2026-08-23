import preview from '@sb/preview';
import { fn } from 'storybook/test';

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

/**
 * Press and hold to see the countdown take over the label.
 * A plain click does nothing, which is the point: the hover text says "hold to delete" so that silence explains itself.
 */
export const Default = meta.story({});

/** While the caller's mutation is in flight. Latched, so a second hold cannot fire it twice. */
export const Pending = meta.story({
  args: { pending: true },
});

/**
 * Gated on a precondition the caller owns, such as an unacknowledged checkbox.
 * Distinct from `pending`: nothing is running, the hold is not available yet.
 */
export const Disabled = meta.story({
  args: { disabled: true },
});
