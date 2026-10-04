import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { ReferencedIllustrationStory } from './rulebookBlockEditors.shared.stories.fixture';
import { IllustrationSizeStory } from './rulebookIllustratedBook.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Illustration/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

export const ReferencedIllustration = meta.story({
  render: () => (
    <ReferencedIllustrationStory
      initialValue={{ source: { kind: 'board', boardId: 'arrakis' }, caption: 'The northern hemisphere of Arrakis.' }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Arrakis board' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Clear source' }));
    await expect(canvas.getByRole('textbox', { name: 'Caption' })).toHaveValue('The northern hemisphere of Arrakis.');
    await expect(canvas.getByRole('button', { name: 'Choose source' })).toBeVisible();
  },
});

export const Sizes = meta.story({
  render: () => <IllustrationSizeStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const portal = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Illustration size' }));
    await userEvent.click(portal.getByRole('option', { name: /^Small$/ }));
    const figure = canvasElement.querySelector('[data-rulebook-block-id="FGRR"]');
    await expect(figure).toHaveAttribute('data-illustration-size', 'small');
  },
});
