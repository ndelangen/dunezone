/*
 * PROTOTYPE, #1321 F55. Throwaway, on prototype/1321-1321-f55-play-spacing, which never merges.
 *
 * The six-seat product game mid-play, seen from Thialfi's seat, with Erickenneth's hand over the table and every piece's name and count held on.
 * `?variant=a|b|c` picks the seated header's spacing: A is today, B reads md and sm, C takes the smaller step where two are near.
 * The names, counts, view picker and remote hand read named properties in all three and render as today.
 * Set a phone viewport to see the header's two rows, or flip the floating bar at the bottom.
 */
import preview from '@sb/preview';
import { CARRIED_BASE_Y } from '@shared/play/tableGeometry';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { refText, SEED_REF_TOKEN, STORYBOOK_NOW } from '@db/storybook';

import { gameMeta, install } from './game.stories.fixture';
import { GAME_KEY, playingSnapshot, productTransport, SIX } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Prototype 1321 1321-f55-play-spacing',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/* Erickenneth sits at seat 4; a seated player's hand takes their faction's colour, as the Worker gives it. */
function remoteHandTransport() {
  const snapshot = playingSnapshot();
  const seat = snapshot.roster?.seats.find((entry) => entry.id === 'seat-4');
  const player = SIX.find((entry) => entry.seat === 'seat-4');
  if (!seat?.faction || !player) {
    throw new Error('The product game has no faction at seat 4.');
  }
  return productTransport('seat-2', snapshot, {
    pointers: [
      {
        connectionId: 'story-seat-4',
        viewerSeat: 'seat-4',
        displayName: player.name,
        color: seat.faction.color,
        position: [-1.3, CARRIED_BASE_Y, 1.7],
        updatedAt: STORYBOOK_NOW,
      },
    ],
  });
}

/* Waits for the table, its label face and the remote hand, then holds Control and Alt so every name and count shows. */
async function holdLabels({ canvasElement }: { canvasElement: HTMLElement }) {
  const document = canvasElement.ownerDocument;
  const page = within(document.body);
  await page.findByRole('group', { name: 'Table view' }, { timeout: 30_000 });
  await waitFor(
    () => {
      const canvas = document.querySelector('.dune-play-shell canvas');
      expect(canvas?.getBoundingClientRect().height).toBeGreaterThan(100);
      expect(document.querySelector('[data-piece-id="treachery-deck"]')).toHaveTextContent('10');
      const scene = document.querySelector<HTMLElement>('.dune-play-shell .scene');
      expect(scene && within(scene).getByText(SIX[3]!.name)).toBeVisible();
      expect(
        Array.from(document.fonts).some(
          (font) => font.family.replaceAll('"', '') === 'Dune Play Table Label' && font.status === 'loaded'
        )
      ).toBe(true);
    },
    { timeout: 30_000 }
  );
  await userEvent.keyboard('{Control>}{Alt>}');
  const shell = document.querySelector('.dune-play-shell');
  expect(shell).toHaveAttribute('data-show-names', 'true');
  expect(shell).toHaveAttribute('data-show-counts', 'true');
}

export const SpacingA = meta.story({
  args: { path: refText(GAME_KEY, `/play/${SEED_REF_TOKEN}?variant=a`) },
  beforeEach: install(remoteHandTransport),
  play: holdLabels,
});

export const SpacingB = meta.story({
  args: { path: refText(GAME_KEY, `/play/${SEED_REF_TOKEN}?variant=b`) },
  beforeEach: install(remoteHandTransport),
  play: holdLabels,
});

export const SpacingC = meta.story({
  args: { path: refText(GAME_KEY, `/play/${SEED_REF_TOKEN}?variant=c`) },
  beforeEach: install(remoteHandTransport),
  play: holdLabels,
});
