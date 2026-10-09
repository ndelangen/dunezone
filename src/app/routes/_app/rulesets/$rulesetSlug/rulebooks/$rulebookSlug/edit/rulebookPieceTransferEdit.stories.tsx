import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { SceneEditorStory } from './rulebookScenes.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Piece transfer/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});
export const ReferencedGroups = meta.story({
  render: () => <SceneEditorStory kind="transfer" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Add left piece' }));
    await expect(canvas.getByText('No source selected', { exact: true })).toBeInTheDocument();
    await expect(canvas.queryByRole('textbox', { name: 'Step' })).not.toBeInTheDocument();
    await expect(canvas.getByLabelText('Move right')).toBeVisible();
  },
});
