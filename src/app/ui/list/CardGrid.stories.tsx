import preview from '@sb/preview';
import { Card } from '@ui/surface/Card';
import { expect, within } from 'storybook/test';

import { CardGrid } from './CardGrid';

const cards = ['Arrakeen picnic', 'Sietch Tabr supper', 'Carthag court', 'Giedi Prime gala', 'Kaitain ball'];

const meta = preview.meta({
  component: CardGrid,
  parameters: { layout: 'padded' },
  args: {
    'aria-label': 'Games',
    children: cards.map((name) => (
      <CardGrid.Item key={name}>
        <Card title={name} padding="md">
          A card in the grid.
        </Card>
      </CardGrid.Item>
    )),
  },
});

/** Three to a row on a wide page. */
export const Wide = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  play: async ({ canvasElement }) => {
    const items = within(within(canvasElement).getByRole('list', { name: 'Games' })).getAllByRole('listitem');
    const tops = items.map((item) => Math.round(item.getBoundingClientRect().top));
    await expect(tops.filter((top) => top === tops[0])).toHaveLength(3);
  },
});

/** One to a row when the grid itself is narrow. */
export const Narrow = meta.story({
  globals: { viewport: { value: 'contentNarrow' } },
  play: async ({ canvasElement }) => {
    const items = within(within(canvasElement).getByRole('list', { name: 'Games' })).getAllByRole('listitem');
    const lefts = items.map((item) => Math.round(item.getBoundingClientRect().left));
    await expect(new Set(lefts).size).toBe(1);
  },
});
