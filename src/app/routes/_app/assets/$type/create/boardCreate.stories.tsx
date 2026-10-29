import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from '../../../../storybookConfig';

const meta = preview.meta({ ...pageStoryMeta, title: 'Assets/Board editor', args: { path: '/assets/board/create' } });
/** The blank editor at rest: an unnamed board whose disc is still one undivided territory. */
export const Blank = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('textbox', { name: 'Board name' }, { timeout: 30_000 })).resolves.toHaveValue('');
    const territories = within(page.getByRole('tablist', { name: 'Territories' }));
    await expect(territories.getAllByRole('tab')).toHaveLength(1);
  },
});
