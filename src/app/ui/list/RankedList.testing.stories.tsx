import { testingPreview } from '@sb/preview';
import { expect, within } from 'storybook/test';

import { RankedList } from './RankedList';

const meta = testingPreview.meta({
  component: RankedList,
  parameters: { layout: 'padded' },
  args: {
    label: 'Faction designers ranking',
    items: [
      { key: 'central', rank: 1, subject: 'Central', score: '19' },
      { key: 'amon', rank: 2, subject: 'Amon_Tellur', score: '3' },
      { key: 'ridwan', rank: 2, subject: 'Ridwan', score: '3' },
    ],
  },
});

/** Each row reads its place before the subject, and a tie repeats the place. */
export const ReadsPlaces = meta.story({
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole('list', { name: 'Faction designers ranking' });
    const rows = within(list).getAllByRole('listitem');
    await expect(rows).toHaveLength(3);
    await expect(rows[2]).toHaveTextContent('Rank 2: Ridwan3');
  },
});
