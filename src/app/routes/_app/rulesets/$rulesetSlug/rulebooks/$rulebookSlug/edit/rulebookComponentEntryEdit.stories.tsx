import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { CardEntryStory } from './rulebookCardBlockEditors.shared.stories.fixture';
import { StockComponentStory } from './rulebookIllustratedBook.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Component entry/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

export const CardEntry = meta.story({
  render: () => <CardEntryStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const guidance = canvas.getByRole('textbox', { name: 'Guidance' });
    const original = (guidance as HTMLTextAreaElement).value;
    await userEvent.click(canvas.getByRole('button', { name: 'Clear source' }));
    await expect(guidance).toHaveValue(original);
    await expect(canvas.getByRole('button', { name: 'Choose source' })).toBeVisible();
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Quantity' }));
    await expect(canvas.getByRole('textbox', { name: 'Quantity' })).toHaveValue('');
  },
});

export const StockArtwork = meta.story({ render: () => <StockComponentStory /> });
