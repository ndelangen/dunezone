import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { SceneEditorStory } from './rulebookScenes.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Piece movement/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});
export const GroupsAndNotes = meta.story({
  render: () => <SceneEditorStory kind="movement" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const portal = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: 'Add left piece' }));
    await userEvent.click(canvas.getByRole('combobox', { name: 'left piece 1 type' }));
    await userEvent.click(portal.getByRole('option', { name: 'Troops' }));
    await expect(canvas.getByRole('button', { name: 'Choose left piece 1 faction' })).toBeVisible();
    const count = canvas.getByRole('textbox', { name: 'left piece 1 count' });
    await userEvent.clear(count);
    await userEvent.type(count, '4');
    await userEvent.tab();
    await expect(count).toHaveValue('4');
    await userEvent.click(canvas.getByRole('button', { name: 'Add movement note' }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Movement note 1' }),
      'Resolve the exchange before discarding.'
    );
    await expect(canvas.getByText('Resolve the exchange before discarding.', { selector: 'span' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('switch', { name: 'Include board scene' }));
    await expect(canvas.getByRole('combobox', { name: 'Board' })).toBeVisible();
  },
});
