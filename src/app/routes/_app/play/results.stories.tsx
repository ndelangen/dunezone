import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import type { GameSnapshot } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';

import { gameMeta, install, lastCommand, session, withPredictionCard } from './game.stories.fixture';
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

/* Turn 1 Mentat Pause with every seat filled; the viewer's own faction holds a locked prediction if asked. */
function mentatSnapshot(viewerSeat: string, { prediction = false, card = false } = {}): GameSnapshot {
  const snapshot = playingSnapshot(viewerSeat === SPECTATOR_SEAT ? 'seat-2' : viewerSeat);
  snapshot.phase = MENTAT_PAUSE;
  snapshot.controls!.seats = SIX.map((player) => player.seat);
  if (prediction) {
    snapshot.predictions = {
      prediction: { factionId: factionOf(snapshot, 1).id, lockedAt: 1, revealedAt: null },
    };
  }
  if (prediction && card) {
    withPredictionCard(snapshot, factionOf(snapshot, 1).id, factionOf(snapshot, 0).id);
  }
  return snapshot;
}

function finishedSnapshot(viewerSeat: string, declaredAt = 1): GameSnapshot {
  const snapshot = mentatSnapshot(viewerSeat);
  snapshot.stage = 'finished';
  snapshot.result = {
    kind: 'alliance',
    factionIds: [factionOf(snapshot, 0).id, factionOf(snapshot, 2).id],
    by: { seat: 'seat-1', name: SIX[0]!.name },
    declaredAt,
  };
  return snapshot;
}

export const DetermineWinner = meta.story({
  beforeEach: install(() => productTransport('seat-2', mentatSnapshot('seat-2'))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* Determine winner is a plain control of the Mentat Pause phase, in the Phase tab. */
    await openTab(page, 'Phase');
    await userEvent.click(await page.findByRole('button', { name: 'Determine winner' }));
    await expect(lastCommand()?.action).toEqual({ kind: 'result-open' });
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
    await expect(declare).toBeDisabled();
    await expect(page.queryByRole('button', { name: 'Determine winner' })).toBeNull();
    await userEvent.click(within(bar).getByText('No winner'));
    await waitFor(() => expect(declare).toBeEnabled());
    await userEvent.click(declare);
    await expect(lastCommand()?.action).toEqual({ kind: 'result-declare', result: 'none', factionIds: [] });
    await userEvent.click(within(bar).getByRole('button', { name: 'Stop' }));
    await expect(lastCommand()?.action).toEqual({ kind: 'result-cancel' });
  },
});

/* Browsing another tab, such as Hand to reveal a prediction, keeps the choice made in the Result tab. */
export const DeclaringKeepsChoiceAcrossTabs = meta.story({
  beforeEach: install(() => {
    const snapshot = mentatSnapshot('seat-2');
    snapshot.ending = { by: { seat: 'seat-2', name: SIX[1]!.name }, startedAt: 1 };
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const bar = (await page.findByText('Declare the result', {}, { timeout: 30_000 })).closest('section')!;
    await userEvent.click(within(bar).getByText('No winner'));
    await openTab(page, 'Hand');
    await waitFor(() => expect(page.queryByText('Declare the result')).toBeNull());
    await openTab(page, 'Result');
    const back = (await page.findByText('Declare the result')).closest('section')!;
    await userEvent.click(within(back).getByRole('button', { name: 'Declare' }));
    await expect(lastCommand()?.action).toEqual({ kind: 'result-declare', result: 'none', factionIds: [] });
  },
});

/* Once the Result tab closes, the Game group opens on a tab that still exists, so Phase stays in reach. */
export const StoppedDeclaringKeepsGameReachable = meta.story({
  beforeEach: install(() => {
    const snapshot = mentatSnapshot('seat-2');
    snapshot.ending = { by: { seat: 'seat-2', name: SIX[1]!.name }, startedAt: 1 };
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByText('Declare the result', {}, { timeout: 30_000 });
    session.transport.deliver(session.transport.view({ ...mentatSnapshot('seat-2'), revision: 1 }));
    await waitFor(() => expect(page.queryByRole('tab', { name: 'Result' })).toBeNull());
    await openTab(page, 'Phase');
    await expect(page.findByRole('button', { name: 'Determine winner' })).resolves.toBeVisible();
  },
});

/* The ancestors a finger can scroll, nearest first, as overflow hidden is not. */
function touchScrollers(element: Element) {
  const scrollers: HTMLElement[] = [];
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/^(auto|scroll)$/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) {
      scrollers.push(node);
    }
  }
  return scrollers;
}

/* On a phone the Result tab outgrows the dock's floor; it scrolls inside the dock, so Declare is in reach. */
export const DeclaringOnAPhone = meta.story({
  globals: { viewport: { value: 'appMobile' }, motion: 'reduce' },
  beforeEach: install(() => {
    const snapshot = mentatSnapshot('seat-2');
    snapshot.ending = { by: { seat: 'seat-2', name: SIX[1]!.name }, startedAt: 1 };
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const view = canvasElement.ownerDocument.defaultView!;
    const bar = (await page.findByText('Declare the result', {}, { timeout: 30_000 })).closest('section')!;
    await userEvent.click(within(bar).getByText('Alliance'));
    const declare = within(bar).getByRole('button', { name: 'Declare' });
    await waitFor(async () => {
      const box = declare.getBoundingClientRect();
      if (box.bottom > view.innerHeight) {
        const scrollers = touchScrollers(declare);
        await expect(scrollers, 'Declare sits below the window with nothing to scroll it into view').not.toHaveLength(
          0
        );
        /* The Result tab sits above the players' pane in the phone's stacked dock, so each pane scrolls to Declare, not to its end, the panel first and then the dock around it. */
        for (const scroller of scrollers) {
          const bottom = Math.min(scroller.getBoundingClientRect().bottom, view.innerHeight);
          scroller.scrollTop += Math.max(0, declare.getBoundingClientRect().bottom - bottom);
        }
      }
      const shown = declare.getBoundingClientRect();
      await expect(shown.bottom).toBeLessThanOrEqual(view.innerHeight);
      await expect(declare.contains(canvasElement.ownerDocument.elementFromPoint(shown.left + 4, shown.top + 4))).toBe(
        true
      );
      /* The section holds its whole content, so Declare sits inside its frame. */
      await expect(shown.bottom).toBeLessThanOrEqual(bar.getBoundingClientRect().bottom);
    });
  },
});

/** A real game deals the locked prediction as a card, so placing that card on the table is the reveal and the bar offers no button. */
export const DeterminingElsewhere = meta.story({
  beforeEach: install(() => {
    const snapshot = mentatSnapshot('seat-2', { prediction: true, card: true });
    snapshot.ending = { by: { seat: 'seat-1', name: SIX[0]!.name }, startedAt: 1 };
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const title = await page.findByText(`${SIX[0]!.name} is determining the winner`, {}, { timeout: 30_000 });
    const bar = title.closest('section')!;
    await expect(within(bar).getByText(/You hold a locked prediction. Place its card on the table now/)).toBeVisible();
    await expect(within(bar).queryByRole('button', { name: 'Declare' })).toBeNull();
    await expect(within(bar).queryByRole('button', { name: 'Reveal prediction' })).toBeNull();
  },
});

/** Without captured prediction faces the Worker deals no card, so the Result tab falls back to a reveal button. */
export const DeterminingElsewhereWithoutACard = meta.story({
  beforeEach: install(() => {
    const snapshot = mentatSnapshot('seat-2', { prediction: true });
    snapshot.ending = { by: { seat: 'seat-1', name: SIX[0]!.name }, startedAt: 1 };
    return productTransport('seat-2', snapshot);
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const title = await page.findByText(`${SIX[0]!.name} is determining the winner`, {}, { timeout: 30_000 });
    const bar = title.closest('section')!;
    await expect(within(bar).getByText(/You hold a locked prediction. Reveal it now/)).toBeVisible();
    await userEvent.click(within(bar).getByRole('button', { name: 'Reveal prediction' }));
    await expect(lastCommand()?.action).toEqual({ kind: 'prediction-reveal', stepId: 'prediction' });
  },
});

export const Finished = meta.story({
  beforeEach: install(() => productTransport('seat-2', finishedSnapshot('seat-2'))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const snapshot = finishedSnapshot('seat-2');
    const [first, second] = [factionOf(snapshot, 0).name, factionOf(snapshot, 2).name];
    /* The phase chip names the result, and the Result tab, opened on arrival, says who declared it. */
    const header = await waitFor(
      async () => {
        const found = canvasElement.ownerDocument.querySelector('.seated-header');
        await expect(found).toBeInstanceOf(HTMLElement);
        return found as HTMLElement;
      },
      { timeout: 30_000 }
    );
    await expect(
      within(header).findByText(`${first} and ${second} won as an alliance`, {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(
      page.findByText(new RegExp(`Declared by ${SIX[0]!.name}`), {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    /* History keeps the finished game's record. */
    await openTab(page, 'Battles');
    await expect(page.getByText('No agreed battle results yet.')).toBeVisible();
    /* Continue playing sits where Next phase did. */
    await userEvent.click(within(header).getByRole('button', { name: 'Continue playing' }));
    await expect(lastCommand()?.action).toEqual({ kind: 'result-continue' });
    /* A finished table keeps its panels, so its players can still replay how the game went. */
    await openTab(page, 'Replay');
    await expect(await page.findByRole('button', { name: 'Replay from start' })).toBeVisible();
    await expect(page.queryByRole('button', { name: 'Determine winner' })).toBeNull();
  },
});

export const FinishedSpectator = meta.story({
  beforeEach: install(() => productTransport(SPECTATOR_SEAT, finishedSnapshot(SPECTATOR_SEAT))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText(/The table stays as it was/, {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: 'Continue playing' })).toBeNull();
  },
});

/* A result declared just now: the allied winners' slots fire their foil across the table. */
export const Celebration = meta.story({
  beforeEach: install(() => productTransport('seat-2', finishedSnapshot('seat-2', STORYBOOK_NOW))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByText(/Declared by/, {}, { timeout: 30_000 });
  },
});

/* The game menu stops the stream and clears the table for this viewer, then has nothing left to clear. */
export const ClearingCelebration = meta.story({
  beforeEach: install(() => productTransport('seat-2', finishedSnapshot('seat-2', STORYBOOK_NOW))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByText(/Declared by/, {}, { timeout: 30_000 });
    await userEvent.click(page.getByRole('button', { name: 'Game menu' }));
    await userEvent.click(await waitForFrame(() => page.getByRole('menuitem', { name: 'Clear confetti' })));
    await userEvent.click(page.getByRole('button', { name: 'Game menu' }));
    await page.findByRole('menuitem', { name: 'Hold to give up your seat' });
    await expect(page.queryByRole('menuitem', { name: 'Clear confetti' })).toBeNull();
  },
});

/* A result declared long ago celebrates nothing, so there is nothing to clear. */
export const FinishedWithoutCelebration = meta.story({
  beforeEach: install(() => productTransport('seat-2', finishedSnapshot('seat-2'))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByText(/Declared by/, {}, { timeout: 30_000 });
    await userEvent.click(page.getByRole('button', { name: 'Game menu' }));
    await waitForFrame(() => page.getByRole('menuitem', { name: 'Hold to give up your seat' }));
    await expect(page.queryByRole('menuitem', { name: 'Clear confetti' })).toBeNull();
  },
});
