import { Group } from '@mantine/core';
import preview from '@sb/preview';
import { CloudDownload, PenLine } from 'lucide-react';
import { expect, within } from 'storybook/test';

import { LabeledAction } from '../control/LabeledAction';
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

/** A failure the reader settles on the spot carries its choices under the words. */
export const WithAction = meta.story({
  args: {
    title: 'Book settings changed in another editor',
    children: 'Choose which size and design to save. Your Contents changes stay in the draft.',
    action: (
      <Group>
        <LabeledAction icon={<PenLine size={16} />}>Keep my settings</LabeledAction>
        <LabeledAction icon={<CloudDownload size={16} />}>Use saved settings</LabeledAction>
      </Group>
    ),
  },
});
