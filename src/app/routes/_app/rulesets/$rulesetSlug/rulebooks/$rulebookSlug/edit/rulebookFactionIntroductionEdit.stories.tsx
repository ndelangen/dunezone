import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { FactionIntroductionStory } from './rulebookBlockEditors.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Faction introduction/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

export const UnavailableFactionIntroduction = meta.story({
  render: () => (
    <FactionIntroductionStory
      initialValue={{ factionId: 'unavailable-faction', text: 'These warriors know the desert and its dangers.' }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('switch', { name: 'Flip layout' })).not.toBeChecked();
    await userEvent.click(canvas.getByRole('switch', { name: 'Flip layout' }));
    await expect(canvas.getByRole('switch', { name: 'Flip layout' })).toBeChecked();
    await expect(canvas.getByRole('button', { name: 'Unavailable faction' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Clear faction' }));
    await expect(canvas.getByRole('textbox', { name: 'Introduction' })).toHaveValue(
      'These warriors know the desert and its dangers.'
    );
  },
});
