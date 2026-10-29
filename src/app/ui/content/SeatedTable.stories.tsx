import { Group } from '@mantine/core';
import preview from '@sb/preview';
import { assetPublishingFaction } from '@shared/factions/fixtures/assetPublishingFaction';
import { TUTORIAL_PLAYERS } from '@shared/tutorial/players';
import { Trophy } from 'lucide-react';
import { expect, within } from 'storybook/test';

import { Token } from '@game/assets/faction/token/Token';

import { nameDiscColor } from './nameDisc';
import { SeatedTable } from './SeatedTable';
import type { TableSeat } from './SeatedTable';

const seat = (name: string, edge: string | null, extra: Partial<TableSeat> = {}): TableSeat => ({
  label: name,
  fill: nameDiscColor(name),
  edge,
  image: TUTORIAL_PLAYERS.find((player) => player.name === name)?.avatar ?? null,
  initial: name.charAt(0),
  token: null,
  crowned: false,
  highlighted: false,
  ...extra,
});

const meta = preview.meta({
  component: SeatedTable,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: '14rem' }}>{Story()}</div>],
  args: {
    label: 'Seats at Arrakeen picnic, 6 of 6 taken',
    seats: [
      seat('Krell', '#3f7a3a', { highlighted: true, label: 'Krell (you)' }),
      seat('Central', '#b3832a'),
      seat('Jaded AF', '#8c2f2f'),
      seat('Eichmal', '#2f5f8c'),
      seat('Ridwan', '#5b6e2a'),
      seat('Tautrimas', '#7a5a9a'),
    ],
    progress: 0.27,
    centre: { above: 'Turn', number: 3, below: 'of 10' },
  },
});

/** A game in play: every seat taken, the viewer's outlined, and the arc filled to the turn the game is on. */
export const InPlay = meta.story({
  play: async ({ canvasElement }) => {
    const table = within(canvasElement).getByRole('group', { name: /Seats at Arrakeen picnic/ });
    await expect(within(table).getAllByRole('img')).toHaveLength(6);
    await expect(within(table).getByText('3')).toBeVisible();
  },
});

/** A dealt faction covers its player's portrait until the seat is hovered. */
export const FactionToken = meta.story({
  args: {
    label: 'Seats at Arrakeen picnic, 1 of 2 taken',
    seats: [
      seat('Krell', '#4b4c0d', {
        label: 'Krell, Atreides',
        token: <Token logo={assetPublishingFaction.logo} background={assetPublishingFaction.background} />,
      }),
      null,
    ],
  },
});

/** Before play: open seats are dashed, the centre names the stage, and there is no turn tracker. */
export const SeatsOpen = meta.story({
  args: {
    label: 'Seats at Midnight Caladan tea break, 3 of 6 taken',
    seats: [seat('Krell', null), null, seat('Jaded AF', null), null, seat('Central', null), null],
    progress: null,
    centre: { word: 'Drafting', below: '3 of 6' },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('img', { name: 'Open seat' })).toHaveLength(3);
  },
});

/** A finished game: the winners wear crowns and the centre shows a trophy. */
export const Finished = meta.story({
  args: {
    label: 'Seats at Sietch supper, 4 of 4 taken',
    seats: [
      seat('Krell', '#3f7a3a', { crowned: true, label: 'Krell, a winner' }),
      seat('Central', '#b3832a', { crowned: true, label: 'Central, a winner' }),
      seat('Jaded AF', '#8c2f2f'),
      seat('Eichmal', '#2f5f8c'),
    ],
    progress: null,
    centre: { glyph: <Trophy aria-hidden /> },
  },
});

/** The size a seat takes shrinks as the table fills, so ten seats still sit apart round the rim. */
export const SeatCounts = meta.story({
  decorators: [],
  render: () => (
    <Group gap="lg">
      {[2, 6, 10].map((count) => (
        <div key={count} style={{ width: '12rem' }}>
          <SeatedTable
            label={`${count} seats`}
            seats={Array.from({ length: count }, (_, index) =>
              index % 2 ? null : seat(TUTORIAL_PLAYERS[Math.floor(index / 2)]!.name, null)
            )}
            progress={null}
            centre={{ word: 'Setup', below: `${count} seats` }}
          />
        </div>
      ))}
    </Group>
  ),
});
