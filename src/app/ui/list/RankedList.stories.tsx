import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { RankedList } from './RankedList';

const meta = preview.meta({
  component: RankedList,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div style={{ maxWidth: '24rem' }}>{Story()}</div>],
  args: {
    label: 'Faction designers ranking',
    items: [
      { key: 'central', rank: 1, subject: 'Central', score: '19' },
      { key: 'pinecone', rank: 2, subject: 'IHasPinecone', score: '10' },
      { key: 'tautrimas', rank: 3, subject: 'Tautrimas', score: '6' },
      { key: 'amon', rank: 4, subject: 'Amon_Tellur', score: '3' },
      { key: 'ridwan', rank: 4, subject: 'Ridwan', score: '3' },
    ],
  },
});

/** Equal counts share a place, and the top three stand out. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole('list', { name: 'Faction designers ranking' });
    const rows = within(list).getAllByRole('listitem');
    await expect(rows).toHaveLength(5);
    await expect(rows[4]).toHaveTextContent('4Ridwan3');
  },
});

/** A line under the subject, such as the faces of a Group's members. */
export const WithDetail = meta.story({
  args: {
    label: 'Groups ranking',
    items: [
      { key: 'dreamers', rank: 1, subject: 'dreamers', detail: '5 members', score: '11' },
      { key: 'gf9', rank: 2, subject: 'GF9', detail: '1 member', score: '18' },
    ],
  },
});
