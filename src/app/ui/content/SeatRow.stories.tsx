import { Stack } from '@mantine/core';
import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { SeatRow } from './SeatRow';

const meta = preview.meta({
  component: SeatRow,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: '26rem' }}>{Story()}</div>],
  args: { seats: 6, places: 10 },
});

/** Six of ten seats: the first marked as the viewer's, five more lit, and four left for a larger table. */
export const SixOfTen = meta.story({
  play: async ({ canvasElement }) => {
    const seats = canvasElement.querySelectorAll('li');
    await expect(seats).toHaveLength(10);
    await expect(seats[0]).toHaveTextContent('You');
    await expect([...seats].filter((seat) => seat.dataset['state'] === 'open')).toHaveLength(5);
  },
});

/** The fewest and the most seats. */
export const SeatCounts = meta.story({
  render: (args) => (
    <Stack gap="md">
      <SeatRow {...args} seats={2} />
      <SeatRow {...args} seats={10} />
    </Stack>
  ),
});
