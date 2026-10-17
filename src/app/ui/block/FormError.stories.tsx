import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { FormError } from './FormError';

const meta = preview.meta({
  component: FormError,
  parameters: { layout: 'padded' },
  args: {
    title: 'Ruleset could not be saved',
    children: 'A ruleset with this name already exists in your group.',
  },
});

/** Rendered only after an attempt failed, never as a standing placeholder. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const alert = within(canvasElement).getByRole('alert');
    await expect(alert).toHaveTextContent('Ruleset could not be saved');
    await expect(alert).toHaveTextContent('A ruleset with this name already exists in your group.');
  },
});

/** Server messages can be long and unpunctuated; the alert wraps rather than truncating them. */
export const LongServerMessage = meta.story({
  args: {
    title: 'Faction could not be published',
    children:
      'The renderer rejected this faction because two supporting leaders share a portrait, and the sheet cannot be captured until one of them is changed',
  },
});
