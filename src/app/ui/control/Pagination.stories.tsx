import { Pagination } from '@mantine/core';
import preview from '@sb/preview';

const meta = preview.meta({
  component: Pagination,
  globals: {
    backgrounds: { value: 'light', grid: false },
  },
  parameters: {
    layout: 'padded',
  },
  args: {
    total: 12,
    defaultValue: 5,
    withEdges: true,
    'aria-label': 'Pages',
  },
});

export const Default = meta.story({});

/* What the Faction catalogue renders: every control is a real link, so a page can be opened in a new tab and crawled. */
export const AsLinks = meta.story({
  args: {
    getItemProps: (page: number) => ({ component: 'a', href: `?page=${page}` }),
    getControlProps: () => ({ component: 'a', href: '?page=1' }),
  },
});

export const SinglePage = meta.story({
  args: {
    total: 1,
    defaultValue: 1,
  },
});
