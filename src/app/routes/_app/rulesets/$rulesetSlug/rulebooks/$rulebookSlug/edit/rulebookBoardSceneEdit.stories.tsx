import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { SceneEditorStory } from './rulebookScenes.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Board scene/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});
export const MarkersAndAnnotations = meta.story({
  render: () => <SceneEditorStory kind="board" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('switch', { name: 'Show storm' }));
    const angle = canvas.getByRole('textbox', { name: 'Storm angle' });
    await userEvent.clear(angle);
    await userEvent.type(angle, '45');
    await userEvent.tab();
    await expect(angle).toHaveValue('45');
    await userEvent.click(canvas.getByRole('button', { name: 'Annotations (0)' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Add annotation' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Annotation 1 title' }), 'Shared territory');
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Annotation 1 explanation' }),
      'Both factions have troops here.'
    );
    await expect(canvas.getByText('Both factions have troops here.', { selector: 'p' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('switch', { name: 'Point at another location' }));
    await expect(canvas.getByRole('textbox', { name: 'Annotation 1 target x' })).toBeVisible();
    await userEvent.click(canvas.getByRole('switch', { name: 'Focus on part of the board' }));
    await expect(canvas.getByRole('textbox', { name: 'Crop x' })).toHaveValue('0');
  },
});
