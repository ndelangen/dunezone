import { Pagination } from '@mantine/core';
import preview from '@sb/preview';

const meta = preview.meta({
  component: Pagination,
  globals: {
    backgrounds: { value: 'dark', grid: false },
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

export const SinglePage = meta.story({
  args: {
    total: 1,
    defaultValue: 1,
  },
});
