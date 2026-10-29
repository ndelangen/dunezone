import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { textOnChange, TextBlockStory, expectBlockOnlyPreview } from './rulebookBlockEditors.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Text/Editing',
  parameters: { layout: 'fullscreen' },
});

export const TextBlock = meta.story({
  render: () => <TextBlockStory initialValue={{ text: 'Keep one hand on the shield wall.' }} />,
  play: async ({ canvasElement }) => {
    await expectBlockOnlyPreview(canvasElement);
    textOnChange.mockClear();
    const canvas = within(canvasElement);
    const content = canvas.getByRole('textbox', { name: 'Content' });
    await expect(canvas.getByRole('group', { name: 'Content' })).toHaveAccessibleDescription(
      'Write the text shown by this Block.'
    );
    await userEvent.type(content, ' Stay alert.');
    await expect(textOnChange).toHaveBeenLastCalledWith({
      text: 'Keep one hand on the shield wall. Stay alert.',
    });
    const previewBlock = canvasElement.querySelector<HTMLElement>('[data-rulebook-block-id="DEMO"]');
    await expect(previewBlock).not.toBeNull();
    await expect(within(previewBlock!).getByText('Keep one hand on the shield wall. Stay alert.')).toBeVisible();
  },
});

export const InvalidFormattedText = meta.story({
  render: () => <TextBlockStory initialValue={{ text: 'An *unfinished instruction' }} />,
  play: async ({ canvasElement }) => {
    await expectBlockOnlyPreview(canvasElement);
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Content' })).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByText(/Suggestion:/)).toBeVisible();
  },
});
