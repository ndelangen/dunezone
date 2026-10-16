import preview from '@sb/preview';
import type { ClientMessage, GameSnapshot } from '@shared/play/protocol';
import { applyTerritoryTint, isTerritoryTintAction } from '@shared/play/territoryTints';
import { expect, userEvent, waitFor } from 'storybook/test';

import { openPanel } from './controls.stories.fixture';
import { gameMeta, install, lastCommand } from './game.stories.fixture';
import { playingSnapshot, productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Territory tints',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

const VIEWER = 'seat-2';

function tintedSnapshot(): GameSnapshot {
  return {
    ...playingSnapshot(VIEWER),
    bank: { factionId: 'house-harkonnen', balance: 0 },
    tints: [
      {
        id: 'tint-fremen',
        name: 'Fremen deployment',
        color: '#2f7fe0',
        territories: [
          'the_great_flat',
          'the_greater_flat',
          'wind_pass',
          'plastic_basin',
          'funeral_plain',
          'habbanya_erg',
          'false_wall_west',
          'cielago_west',
          'hagga_basin',
          'wind_pass_north',
          'polar_sink',
          'tsimpo',
          'broken_land',
          'rock_outcroppings',
          'bight_of_the_cliff',
          'tabr',
        ],
      },
      {
        id: 'tint-shield',
        name: 'Shield Wall destroyed',
        color: '#d63a2a',
        stamp: 'atomics',
        territories: ['shield_wall'],
      },
    ],
  };
}

/** The table as the Worker runs it: tint commands are applied by the shared rules, so painting can be tried by hand. */
function liveTransport(start: GameSnapshot) {
  let snapshot = start;
  const transport = productTransport(VIEWER, snapshot, {
    answerCommand: (message: Extract<ClientMessage, { type: 'command' }>) => {
      if (isTerritoryTintAction(message.action)) {
        try {
          const { tints } = applyTerritoryTint(snapshot.tints ?? [], message.action);
          snapshot = { ...snapshot, revision: snapshot.revision + 1, tints };
        } catch {
          // A refused command leaves the table as it was, as the Worker would.
        }
      }
      return transport.view(snapshot, message.commandId);
    },
  });
  return transport;
}

/** Try it by hand: make a tint or lay a preset, turn on its paintbrush, and click territories on the board; Escape stops painting. */
export const Live = meta.story({
  beforeEach: install(() =>
    liveTransport({ ...playingSnapshot(VIEWER), bank: { factionId: 'house-harkonnen', balance: 0 } })
  ),
  play: async ({ canvasElement }) => {
    await openPanel(canvasElement, 'Territory tints');
  },
});

/** The two presets laid, with the Fremen deployment tint's paintbrush on. */
export const Painting = meta.story({
  beforeEach: install(() => liveTransport(tintedSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Territory tints');
    const brush = await page.findByRole('button', { name: 'Paint Fremen deployment' }, { timeout: 30_000 });
    await userEvent.click(brush);
    await waitFor(() => expect(brush).toHaveAttribute('aria-pressed', 'true'));
    await expect(page.findByText('Painting: click territories on the board')).resolves.toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(brush).toHaveAttribute('aria-pressed', 'false'));
    await userEvent.click(brush);
  },
});

/** A preset is laid as one new tint, ready to paint. */
export const Preset = meta.story({
  beforeEach: install(() =>
    liveTransport({ ...playingSnapshot(VIEWER), bank: { factionId: 'house-harkonnen', balance: 0 } })
  ),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Territory tints');
    await userEvent.click(await page.findByRole('button', { name: 'Shield Wall destroyed' }, { timeout: 30_000 }));
    await waitFor(() =>
      expect(lastCommand()?.action).toMatchObject({
        kind: 'tint-create',
        name: 'Shield Wall destroyed',
        stamp: 'atomics',
        territories: ['shield_wall'],
      })
    );
    await expect(page.findByRole('button', { name: 'Paint Shield Wall destroyed' })).resolves.toBeVisible();
  },
});
