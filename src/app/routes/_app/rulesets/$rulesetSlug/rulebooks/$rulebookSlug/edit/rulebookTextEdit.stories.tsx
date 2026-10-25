import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { textOnChange, TextBlockStory, expectBlockOnlyPreview } from './rulebookBlockEditors.shared.stories.fixture';
import { RelatedRulesStory } from './rulebookIllustratedBook.stories.fixture';

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

export const NamedText = meta.story({
  render: () => (
    <TextBlockStory
      initialValue={{ name: 'Ornithopters', text: 'Control Arrakeen or Carthag to move up to three territories.' }}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('textbox', { name: 'Name' })).toHaveValue('Ornithopters');
    const previewBlock = canvasElement.querySelector<HTMLElement>('[data-rulebook-block-id="DEMO"]');
    await expect(previewBlock).not.toBeNull();
    /* The name runs in bold ahead of the text rather than standing as a heading of its own. */
    const name = within(previewBlock!).getByText('Ornithopters');
    await expect(Number(getComputedStyle(name).fontWeight)).toBeGreaterThanOrEqual(600);
    await expect(within(previewBlock!).getByText(/Control Arrakeen or Carthag/)).toBeVisible();
  },
});

export const RelatedRules = meta.story({
  render: () => <RelatedRulesStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Shield, page 2' })).toHaveAttribute('href', '#shield');
    await userEvent.click(canvas.getByRole('button', { name: 'Move component page' }));
    await expect(canvas.getByRole('link', { name: 'Shield, page 1' })).toHaveAttribute('href', '#shield');
    await userEvent.click(canvas.getByRole('button', { name: 'Move component page' }));
    await expect(canvas.getByRole('link', { name: 'Shield, page 2' })).toBeVisible();
  },
});
