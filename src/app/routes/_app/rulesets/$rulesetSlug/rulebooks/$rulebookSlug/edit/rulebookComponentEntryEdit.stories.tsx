import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { StockComponentStory } from './rulebookIllustratedBook.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Component entry/Editing',
  parameters: { layout: 'fullscreen' },
});

/** A stock artwork source: the editor names it, and the page draws it beside the entry's heading. */
export const StockArtwork = meta.story({
  render: () => <StockComponentStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      within(canvas.getByRole('group', { name: 'Source' })).getByRole('button', { name: 'shield' })
    ).toBeVisible();
    const page = within(canvas.getByRole('article', { name: 'Rulebook page: Cards and tokens' }));
    await expect(page.getByRole('heading', { name: 'Shield' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'shield' })).toHaveAttribute('src', '/vector/decal/shield.svg');
  },
});
