import preview from '@sb/preview';
import type { ClientMessage, GameSnapshot } from '@shared/play/protocol';
import { applyTerritoryTint, isTerritoryTintAction } from '@shared/play/territoryTints';
import { expect, userEvent, waitFor, within } from 'storybook/test';

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
        color: '#2b5ea7',
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
        color: '#1b1b1b',
        territories: ['shield_wall'],
      },
    ],
  };
}

/** The table as the Worker runs it, refusals included, so painting can be tried by hand; refuseCreate refuses every new tint, as a full table would. */
function liveTransport(start: GameSnapshot, { refuseCreate = false } = {}) {
  let snapshot = start;
  const transport = productTransport(VIEWER, snapshot, {
    receive: (message: ClientMessage) => {
      if (message.type !== 'command' || !isTerritoryTintAction(message.action)) {
        return false;
      }
      const { action, commandId } = message;
      queueMicrotask(() => {
        try {
          if (refuseCreate && action.kind === 'tint-create') {
            throw new Error('The table holds at most 12 tints. Remove one first.');
          }
          const { tints } = applyTerritoryTint(snapshot.tints ?? [], action);
          snapshot = { ...snapshot, revision: snapshot.revision + 1, tints };
          transport.deliver(transport.view(snapshot, commandId));
        } catch (error) {
          transport.deliver({ type: 'rejected', requestId: commandId, message: (error as Error).message });
        }
      });
      return true;
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
    await waitFor(() => expect(brush).toHaveAttribute('aria-pressed', 'true'), { timeout: 10_000 });
    await expect(page.findByText('Painting: click territories on the board')).resolves.toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(brush).toHaveAttribute('aria-pressed', 'false'), { timeout: 10_000 });
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
        stamps: ['explode'],
        territories: ['shield_wall'],
      })
    );
    await expect(page.findByRole('button', { name: 'Paint Shield Wall destroyed' })).resolves.toBeVisible();
  },
});

/** Hiding a tint, outlining one, switching stickers on and recolouring one change the table for everyone, and the row follows. */
export const Settings = meta.story({
  beforeEach: install(() => liveTransport(tintedSnapshot())),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Territory tints');
    const shown = await page.findByRole('button', { name: 'Show Fremen deployment' }, { timeout: 30_000 });
    await userEvent.click(shown);
    await waitFor(() =>
      expect(lastCommand()?.action).toEqual({ kind: 'tint-set', tintId: 'tint-fremen', setting: 'hidden', on: true })
    );
    await waitFor(() => expect(shown).toHaveAttribute('aria-pressed', 'false'), { timeout: 10_000 });
    await expect(page.findByRole('button', { name: 'Paint Fremen deployment' })).resolves.toBeDisabled();
    const [, outlines] = await page.findAllByRole('button', { name: 'Outline only' });
    await userEvent.click(outlines);
    await waitFor(() =>
      expect(lastCommand()?.action).toEqual({ kind: 'tint-set', tintId: 'tint-shield', setting: 'outline', on: true })
    );
    await waitFor(() => expect(outlines).toHaveAttribute('aria-pressed', 'true'), { timeout: 10_000 });
    await userEvent.click(await page.findByRole('button', { name: 'Stickers on Shield Wall destroyed' }));
    const city = await within(canvasElement.ownerDocument.body).findByRole('button', { name: 'City' });
    await userEvent.click(city);
    await waitFor(() =>
      expect(lastCommand()?.action).toEqual({ kind: 'tint-set', tintId: 'tint-shield', setting: 'city', on: true })
    );
    await waitFor(() => expect(city).toHaveAttribute('aria-pressed', 'true'), { timeout: 10_000 });
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await page.findByRole('button', { name: 'Colour of Shield Wall destroyed' }));
    await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole('button', { name: '#9450d080' }));
    await waitFor(() =>
      expect(lastCommand()?.action).toEqual({ kind: 'tint-color', tintId: 'tint-shield', color: '#9450d080' })
    );
  },
});

/** A new tint the table refuses puts its paintbrush down again, so clicks on the board send nothing. */
export const Refused = meta.story({
  beforeEach: install(() =>
    liveTransport(
      { ...playingSnapshot(VIEWER), bank: { factionId: 'house-harkonnen', balance: 0 } },
      { refuseCreate: true }
    )
  ),
  play: async ({ canvasElement }) => {
    const page = await openPanel(canvasElement, 'Territory tints');
    await userEvent.click(await page.findByRole('button', { name: 'New green tint' }, { timeout: 30_000 }));
    await waitFor(() => expect(lastCommand()?.action).toMatchObject({ kind: 'tint-create', name: 'Green tint' }));
    await waitFor(() => expect(canvasElement.ownerDocument.querySelector('[style*="--brush-cursor"]')).toBeNull());
  },
});
