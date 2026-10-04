import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { calloutChange, CalloutStory } from './rulebookBlockEditors.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Callout/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

export const NoteCallout = meta.story({
  render: () => (
    <CalloutStory
      initialValue={{ variant: 'note', title: 'Occupancy limit', text: 'Two factions can occupy the same stronghold.' }}
    />
  ),
});

export const ExampleCallout = meta.story({
  render: () => (
    <CalloutStory
      initialValue={{
        variant: 'example',
        title: 'A shipment',
        text: 'Shipping three forces to a stronghold costs three spice.',
      }}
    />
  ),
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
    expect(calloutChange.mock.lastCall?.[0].attribution).toBeUndefined();
  },
});
