import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { SceneEditorStory } from './rulebookScenes.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Battle comparison/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});
export const IndependentExamples = meta.story({
  render: () => <SceneEditorStory kind="comparison" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('textbox', { name: 'Example 1 Step' })).toBeNull();
    const first = canvas.getByRole('textbox', { name: 'Example 1 Title' });
    await userEvent.clear(first);
    await userEvent.type(first, 'Supported forces');
    await userEvent.click(canvas.getByRole('button', { name: 'Example 2: Another battle plan' }));
    const second = await canvas.findByRole('textbox', { name: 'Example 2 Title' });
    await userEvent.clear(second);
    await userEvent.type(second, 'Unsupported forces');
    await expect(first).toHaveValue('Supported forces');
    await expect(canvas.getByRole('heading', { name: 'Supported forces' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Unsupported forces' })).toBeVisible();
  },
});
