import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { sectionHeadingChange, SectionHeadingStory } from './rulebookBlockEditors.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Section heading/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

export const SectionHeading = meta.story({
  render: () => <SectionHeadingStory initialValue={{ title: 'Shipment and movement' }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Title' }), ' phase');
    expect(sectionHeadingChange).toHaveBeenLastCalledWith({ title: 'Shipment and movement phase' });
  },
});
