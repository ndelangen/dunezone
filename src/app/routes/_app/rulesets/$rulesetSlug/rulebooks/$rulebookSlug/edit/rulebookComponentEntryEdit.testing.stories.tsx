import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { CardEntryStory } from './rulebookCardBlockEditors.shared.stories.fixture';

const meta = testingPreview.meta({
  title: 'Blocks/Component entry/Editing',
  parameters: { layout: 'fullscreen' },
});

export const CardEntry = meta.story({
  render: () => <CardEntryStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Image side' }));
    await userEvent.click(within(canvasElement.ownerDocument.body).getByRole('option', { name: 'Right' }));
    await userEvent.click(canvas.getByRole('combobox', { name: 'Text flow' }));
    await userEvent.click(within(canvasElement.ownerDocument.body).getByRole('option', { name: 'Wrap below image' }));
    await expect(canvasElement.querySelector('.rulebookCardGuide')).toHaveAttribute('data-image-side', 'right');
    await expect(canvasElement.querySelector('.rulebookCardGuide')).toHaveAttribute('data-text-flow', 'wrap');
    const guidance = canvas.getByRole('textbox', { name: 'Guidance' });
    const original = (guidance as HTMLTextAreaElement).value;
    await userEvent.click(canvas.getByRole('button', { name: 'Clear source' }));
    await expect(guidance).toHaveValue(original);
    await expect(canvas.getByRole('button', { name: 'Choose source' })).toBeVisible();
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Quantity' }));
    await expect(canvas.getByRole('textbox', { name: 'Quantity' })).toHaveValue('');
  },
});
