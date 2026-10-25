import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { CataloguePager } from './CataloguePager';

const meta = preview.meta({
  component: CataloguePager,
  globals: {
    backgrounds: { value: 'dark', grid: false },
  },
  parameters: {
    layout: 'padded',
  },
  args: {
    page: 3,
    pageCount: 9,
    pageSize: 24,
    total: 213,
    complete: true,
    noun: 'treachery cards',
    label: 'Treachery card pages',
    pageLinkProps: (page: number) => ({ component: 'a', href: `?page=${page}` }),
  },
});

/* Every control is a real link, so a page can be opened in a new tab and crawled. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('49–72 of 213 treachery cards')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '?page=4');
  },
});

export const LastPage = meta.story({
  args: { page: 9 },
});

/* A search that matched more than one read holds: the count is a floor, and the reader is told how to narrow it. */
export const IncompleteSearch = meta.story({
  args: { page: 1, pageCount: 43, total: 1024, complete: false },
});
