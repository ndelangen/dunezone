import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { calloutChange, CalloutStory } from './rulebookBlockEditors.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Callout/Editing',
  parameters: { layout: 'fullscreen' },
});

/** A note callout's title is its own field, and an edit to it reaches both the change and the preview. */
export const NoteCallout = meta.story({
  render: () => (
    <CalloutStory
      initialValue={{ variant: 'note', title: 'Occupancy limit', text: 'Two factions can occupy the same stronghold.' }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    calloutChange.mockClear();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Title' }), ' reached');
    await expect(calloutChange.mock.lastCall?.[0].title).toBe('Occupancy limit reached');
    const preview = within(canvasElement.querySelector<HTMLElement>('[data-rulebook-block-canvas]')!);
    await expect(preview.getByText('Occupancy limit reached')).toBeVisible();
  },
});

export const QuotationCallout = meta.story({
  render: () => (
    <CalloutStory
      initialValue={{ variant: 'quotation', text: 'The spice must flow.', attribution: 'The Spacing Guild' }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Attribution' }));
    await expect(calloutChange.mock.lastCall?.[0].attribution).toBeUndefined();
  },
});
