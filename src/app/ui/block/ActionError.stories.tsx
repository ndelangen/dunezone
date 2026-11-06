import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { ActionError } from './ActionError';

const meta = preview.meta({
  component: ActionError,
  parameters: { layout: 'padded' },
  args: {
    subject: 'Rulebook',
    verb: 'delete' as const,
    children: 'Only the ruleset owner can delete this Rulebook.',
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
  args: { subject: 'deck', verb: 'save' as const, children: 'The server did not answer. Try again.' },
});
