import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { textOnChange, TextBlockStory, expectBlockOnlyPreview } from './rulebookBlockEditors.shared.stories.fixture';
import { RelatedRulesStory } from './rulebookIllustratedBook.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Text/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

export const TextBlock = meta.story({
  render: () => <TextBlockStory initialValue={{ text: 'Keep one hand on the shield wall.' }} />,
  play: async ({ canvasElement }) => {
    expectBlockOnlyPreview(canvasElement);
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
    expect(previewBlock).not.toBeNull();
    await expect(within(previewBlock!).getByText('Keep one hand on the shield wall. Stay alert.')).toBeVisible();
  },
});

export const InvalidFormattedText = meta.story({
  render: () => <TextBlockStory initialValue={{ text: 'An *unfinished instruction' }} />,
  play: async ({ canvasElement }) => {
    expectBlockOnlyPreview(canvasElement);
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

export const ProcedureStep = meta.story({
  render: () => <TextBlockStory initialValue={{ name: 'Prepare the deck', text: 'Shuffle the cards.' }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Step number' }), '1');
    await expect(canvas.getByRole('region', { name: 'Step 1: Prepare the deck' })).toBeVisible();
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Step number' }));
    await expect(canvas.queryByRole('region', { name: 'Step 1: Prepare the deck' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Prepare the deck' })).toBeVisible();
  },
});
