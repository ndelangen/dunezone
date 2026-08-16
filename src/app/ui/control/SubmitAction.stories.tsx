import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { SubmitAction } from './SubmitAction';

const meta = preview.meta({
  component: SubmitAction,
  parameters: { layout: 'padded' },
  args: {
    children: 'Save group',
    pending: false,
  },
});

/** Ready to commit. The confirm colour marks it as the positive action. */
export const Default = meta.story({});

/**
 * In flight: the label becomes progress and the button latches, so an impatient second click cannot submit the same form twice.
 */
export const Pending = meta.story({
  args: { pending: true },
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector('button');

    await expect(button).toBeDisabled();
    await expect(button?.textContent).toContain('Saving…');
  },
});

/** Blocked by the form's own rule — a required field still empty. */
export const Disabled = meta.story({
  args: { disabled: true },
});

/** Where "Saving…" would misdescribe the work. */
export const CustomPendingLabel = meta.story({
  args: { children: 'Publish faction', pending: true, pendingLabel: 'Publishing…' },
});
