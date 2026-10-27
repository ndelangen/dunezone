import { Stack } from '@mantine/core';
import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { SeatRow } from './SeatRow';

const meta = preview.meta({
  component: SeatRow,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: '26rem' }}>{Story()}</div>],
  args: { seats: 6, places: 18 },
});

/** Six of eighteen seats, nine to a line: the first marked as the viewer's, five more lit, and the rest left for a larger table. */
export const SixOfTen = meta.story({
  play: async ({ canvasElement }) => {
    const seats = canvasElement.querySelectorAll('li');
    await expect(seats).toHaveLength(18);
    await expect(seats[0]).toHaveTextContent('You');
    await expect([...seats].filter((seat) => seat.dataset['state'] === 'open')).toHaveLength(5);
  },
});

/** The fewest and the most seats. */
export const SeatCounts = meta.story({
  render: (args) => (
    <Stack gap="md">
      <SeatRow {...args} seats={2} />
      <SeatRow {...args} seats={18} />
    </Stack>
  ),
});

/** At the width of the create page's stub: nine to a line, every seat wide enough for its number and You. */
export const StubWidth = meta.story({
  decorators: [(Story) => <div style={{ width: '20rem' }}>{Story()}</div>],
  play: async ({ canvasElement }) => {
    const seats = [...canvasElement.querySelectorAll('li')];
    await expect(new Set(seats.map((seat) => seat.getBoundingClientRect().top)).size).toBe(2);
    for (const seat of seats) {
      await expect(seat.scrollWidth).toBeLessThanOrEqual(seat.clientWidth);
    }
  },
});
