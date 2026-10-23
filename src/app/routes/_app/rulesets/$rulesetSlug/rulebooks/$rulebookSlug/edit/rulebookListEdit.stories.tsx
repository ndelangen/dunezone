import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { ListStory } from './rulebookBlockEditors.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/List/Editing',
  parameters: { layout: 'fullscreen' },
});

/** An empty bulleted list previews as a bulleted list with no items, and offers its first one. */
export const EmptyBulletedList = meta.story({
  render: () => <ListStory initialValue={{ style: 'bulleted', itemOrder: [], itemsById: {} }} />,
  play: async ({ canvasElement }) => {
    const preview = within(canvasElement.querySelector<HTMLElement>('[data-rulebook-block-canvas]')!);
    const list = preview.getByRole('list');
    await expect(list.tagName).toBe('UL');
    await expect(within(list).queryAllByRole('listitem')).toHaveLength(0);
    await expect(within(canvasElement).getByRole('button', { name: 'Add item' })).toBeVisible();
  },
});
