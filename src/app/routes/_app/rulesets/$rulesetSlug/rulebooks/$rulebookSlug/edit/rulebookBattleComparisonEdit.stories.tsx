import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { SceneEditorStory } from './rulebookScenes.stories.fixture';

const meta = testingPreview.meta({
  title: 'Blocks/Battle comparison/Editing',
  parameters: { layout: 'fullscreen' },
});
export const IndependentExamples = meta.story({
  render: () => <SceneEditorStory kind="comparison" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('textbox', { name: 'Example 1 Step' })).toBeNull();
    const first = canvas.getByRole('textbox', { name: 'Example 1 Title' });
    await userEvent.clear(first);
    await userEvent.type(first, 'Supported troops');
    await userEvent.click(canvas.getByRole('button', { name: 'Example 2: Another battle plan' }));
    const second = await canvas.findByRole('textbox', { name: 'Example 2 Title' });
    await userEvent.clear(second);
    await userEvent.type(second, 'Unsupported troops');
    await expect(first).toHaveValue('Supported troops');
    await expect(canvas.getByRole('heading', { name: 'Supported troops' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Unsupported troops' })).toBeVisible();
  },
});
