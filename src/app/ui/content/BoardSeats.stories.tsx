import { Group } from '@mantine/core';
import preview from '@sb/preview';
import { tableSeatAngles } from '@shared/play/tableSettings';
import { expect, within } from 'storybook/test';

import { BoardSeats } from './BoardSeats';

const meta = preview.meta({
  component: BoardSeats,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: '15rem' }}>{Story()}</div>],
  args: {
    angles: tableSeatAngles(6),
    board: '/vector/background/map.svg',
    label: '6 seats round the board',
  },
});

/** Six seats round the board, the first marked as the viewer's, nearest them. */
export const SixSeats = meta.story({
  play: async ({ canvasElement }) => {
    const board = within(canvasElement).getByRole('img', { name: '6 seats round the board' });
    await expect(board.querySelectorAll('g')).toHaveLength(6);
    await expect(within(canvasElement).getByText('You')).toBeInTheDocument();
  },
});

/** The fewest and most seats a table lays out. */
export const SeatCounts = meta.story({
  decorators: [],
  render: (args) => (
    <Group gap="lg">
      {([2, 10] as const).map((count) => (
        <div key={count} style={{ width: '12rem' }}>
          <BoardSeats {...args} angles={tableSeatAngles(count)} label={`${count} seats round the board`} />
        </div>
      ))}
    </Group>
  ),
});
