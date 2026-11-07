import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { ActionError } from './ActionError';

const meta = preview.meta({
  component: ActionError,
  parameters: { layout: 'padded' },
  args: {
    subject: 'Rulebook',
    verb: 'delete' as const,
    error: 'Only the ruleset owner can delete this Rulebook.',
  },
});

/** The title names the thing and what did not happen to it; the reason follows, and the alert is announced. */
export const Delete = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent('Rulebook could not be deleted');
  },
});

/** A lower-case subject is capitalised at the start of the title. */
export const Save = meta.story({
  args: { subject: 'deck', verb: 'save' as const, error: new Error('The server did not answer. Try again.') },
});

/** A server refusal is shown in the server's own words, not the transport's wrapping around them. */
export const ServerRefusal = meta.story({
  args: {
    subject: 'Group',
    verb: 'save' as const,
    error: Object.assign(new Error('[Request ID: 1] Server Error Uncaught ConvexError: That name is taken.'), {
      data: 'That name is taken.',
    }),
  },
  play: async ({ canvasElement }) => {
    const alert = within(canvasElement).getByRole('alert');
    await expect(alert).toHaveTextContent('That name is taken.');
    await expect(alert).not.toHaveTextContent('Request ID');
  },
});

/** No error, no alert: callers pass their mutation's error as it stands. */
export const NoError = meta.story({
  args: { error: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('alert')).toBeNull();
  },
});
