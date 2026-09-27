import preview from '@sb/preview';
import type { GameSnapshot } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { gameMeta, install, lastCommand } from './game.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { playingSnapshot, productTransport, SIX } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Results',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

const MENTAT_PAUSE = 8;
const factionOf = (snapshot: GameSnapshot, index: number) => snapshot.roster!.seats[index]!.faction!;

/* Turn 1 Mentat pause with every seat filled; the viewer's own faction holds a locked prediction if asked. */
function mentatSnapshot(viewerSeat: string, { prediction = false } = {}): GameSnapshot {
  const snapshot = playingSnapshot(viewerSeat === SPECTATOR_SEAT ? 'seat-2' : viewerSeat);
  snapshot.phase = MENTAT_PAUSE;
  snapshot.controls!.seats = SIX.map((player) => player.seat);
  if (prediction) {
    snapshot.predictions = {
      prediction: { factionId: factionOf(snapshot, 1).id, lockedAt: 1, revealedAt: null },
    };
  }
  return snapshot;
}

function finishedSnapshot(viewerSeat: string): GameSnapshot {
  const snapshot = mentatSnapshot(viewerSeat);
  snapshot.stage = 'finished';
  snapshot.result = {
    kind: 'alliance',
    factionIds: [factionOf(snapshot, 0).id, factionOf(snapshot, 2).id],
    by: { seat: 'seat-1', name: SIX[0]!.name },
    declaredAt: 1,
  };
  return snapshot;
}

export const DetermineWinner = meta.story({
  beforeEach: install(() => productTransport('seat-2', mentatSnapshot('seat-2'))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* Determine winner is a plain control of the Mentat pause phase, beside the phase's guidance. */
    await openTab(page, 'Phase');
    await userEvent.click(await page.findByRole('button', { name: 'Determine winner' }));
    expect(lastCommand()?.action).toEqual({ kind: 'result-open' });
  },
});

export const Declaring = meta.story({
  beforeEach: install(() => {
    const snapshot = mentatSnapshot('seat-2');
    snapshot.ending = { by: { seat: 'seat-2', name: SIX[1]!.name }, startedAt: 1 };
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const bar = (await page.findByText('Declare the result', {}, { timeout: 30_000 })).closest('section')!;
    const declare = within(bar).getByRole('button', { name: 'Declare' });
    expect(declare).toBeDisabled();
    expect(page.queryByRole('button', { name: 'Determine winner' })).toBeNull();
    await userEvent.click(within(bar).getByText('No winner'));
    await waitFor(() => expect(declare).toBeEnabled());
    await userEvent.click(declare);
    expect(lastCommand()?.action).toEqual({ kind: 'result-declare', result: 'none', factionIds: [] });
    await userEvent.click(within(bar).getByRole('button', { name: 'Stop' }));
    expect(lastCommand()?.action).toEqual({ kind: 'result-cancel' });
  },
});

export const DeterminingElsewhere = meta.story({
  beforeEach: install(() => {
    const snapshot = mentatSnapshot('seat-2', { prediction: true });
    snapshot.ending = { by: { seat: 'seat-1', name: SIX[0]!.name }, startedAt: 1 };
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const title = await page.findByText(`${SIX[0]!.name} is determining the winner`, {}, { timeout: 30_000 });
    const bar = title.closest('section')!;
    expect(within(bar).getByText(/You hold a locked prediction/)).toBeVisible();
    expect(within(bar).queryByRole('button', { name: 'Declare' })).toBeNull();
    await userEvent.click(within(bar).getByRole('button', { name: 'Reveal prediction' }));
    expect(lastCommand()?.action).toEqual({ kind: 'prediction-reveal', stepId: 'prediction' });
  },
});

export const Finished = meta.story({
  beforeEach: install(() => productTransport('seat-2', finishedSnapshot('seat-2'))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const snapshot = finishedSnapshot('seat-2');
    const [first, second] = [factionOf(snapshot, 0).name, factionOf(snapshot, 2).name];
    const title = await page.findByText(`${first} and ${second} won as an alliance`, {}, { timeout: 30_000 });
    const bar = title.closest('section')!;
    expect(within(bar).getByText(new RegExp(`Declared by ${SIX[0]!.name}`))).toBeVisible();
    await userEvent.click(within(bar).getByRole('button', { name: 'Continue playing' }));
    expect(lastCommand()?.action).toEqual({ kind: 'result-continue' });
    /* A finished table keeps its panels, so its players can still replay how the game went. */
    await openTab(page, 'Phase');
    expect(await page.findByRole('button', { name: 'Replay from start' })).toBeVisible();
    expect(page.queryByRole('button', { name: 'Determine winner' })).toBeNull();
  },
});

export const FinishedSpectator = meta.story({
  beforeEach: install(() => productTransport(SPECTATOR_SEAT, finishedSnapshot(SPECTATOR_SEAT))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const title = await page.findByText(/won as an alliance/, {}, { timeout: 30_000 });
    const bar = title.closest('section')!;
    expect(within(bar).getByText(/The table stays as it was/)).toBeVisible();
    expect(within(bar).queryByRole('button', { name: 'Continue playing' })).toBeNull();
  },
});
