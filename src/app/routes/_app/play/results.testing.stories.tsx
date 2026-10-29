import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';

import { unpinWindow, WAIT, windowNamed } from './controls.stories.fixture';
import { gameMeta, install, lastCommand, session } from './game.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { playingSnapshot, productTransport, SIX } from './product.stories.fixture';
import { factionOf, mentatSnapshot, finishedSnapshot } from './results.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Results',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

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
    await unpinWindow(page, 'Result');
    await waitFor(() => expect(page.queryByText('Declare the result')).toBeNull());
    await openTab(page, 'Result');
    const back = (await page.findByText('Declare the result')).closest('section')!;
    await userEvent.click(within(back).getByRole('button', { name: 'Declare' }));
    await expect(lastCommand()?.action).toEqual({ kind: 'result-declare', result: 'none', factionIds: [] });
  },
});

/* Once the Result panel goes, its window goes with it, and Phase stays in reach. */
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
    await waitFor(() => expect(windowNamed(page, 'Result')).toBeNull());
    await openTab(page, 'Phase');
    await expect(page.findByRole('button', { name: 'Determine winner' })).resolves.toBeVisible();
  },
});

/* What sits over a point instead, named by its nearest label and the window holding it, for a failure to read. */
function coverOf(hit: Element | null) {
  const frame = hit?.closest('[data-window]');
  const label = hit?.closest('[aria-label]')?.getAttribute('aria-label');
  return `${hit?.tagName ?? 'nothing'} ${label ?? ''} in ${frame ? `the ${frame.getAttribute('data-side')} window` : 'no window'}`;
}

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

/* On a phone the Result window outgrows the screen; it scrolls inside its frame, so Declare is in reach. */
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
      /* Below the window, or below the bottom of the slot that clips it, where the board shows instead. */
      const covered = !declare.contains(canvasElement.ownerDocument.elementFromPoint(box.left + 4, box.top + 4));
      if (box.bottom > view.innerHeight || covered) {
        const scrollers = touchScrollers(declare);
        await expect(scrollers, 'Declare sits below the window with nothing to scroll it into view').not.toHaveLength(
          0
        );
        /* Each scroller scrolls to Declare, not to its end: the section first and then the window around it. */
        for (const scroller of scrollers) {
          const bottom = Math.min(scroller.getBoundingClientRect().bottom, view.innerHeight);
          scroller.scrollTop += Math.max(0, declare.getBoundingClientRect().bottom - bottom);
        }
      }
      const shown = declare.getBoundingClientRect();
      await expect(shown.bottom).toBeLessThanOrEqual(view.innerHeight);
      const hit = canvasElement.ownerDocument.elementFromPoint(shown.left + 4, shown.top + 4);
      await expect(declare.contains(hit), `Declare is covered by ${coverOf(hit)}`).toBe(true);
      /* The section holds its whole content, so Declare sits inside its frame. */
      await expect(shown.bottom).toBeLessThanOrEqual(bar.getBoundingClientRect().bottom);
      /* The window the table opened by itself settles into its slot over a few frames, which a slow runner draws seconds apart. */
    }, WAIT);
    /* An alliance is declared only once its factions are picked, and the declaration names them. */
    await expect(declare).toBeDisabled();
    const snapshot = mentatSnapshot('seat-2');
    const allies = [factionOf(snapshot, 0), factionOf(snapshot, 2)];
    /* The field's own input takes no pointer, so it is opened from the keyboard. */
    for (const ally of allies) {
      within(bar).getByLabelText('Winning alliance').focus();
      await userEvent.keyboard('{ArrowDown}');
      await userEvent.click(await waitForFrame(() => page.getByRole('option', { name: ally.name })));
    }
    await waitFor(() => expect(declare).toBeEnabled());
    await userEvent.click(declare);
    await expect(lastCommand()?.action).toEqual({
      kind: 'result-declare',
      result: 'alliance',
      factionIds: allies.map((ally) => ally.id),
    });
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

/* A result declared just now: the allied winners' slots fire their foil across the table. */
export const Celebration = meta.story({
  globals: { motion: 'on' },
  beforeEach: install(() => productTransport('seat-2', finishedSnapshot('seat-2', STORYBOOK_NOW))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByText(/Declared by/, {}, { timeout: 30_000 });
    /* The foil is drawn on the table's canvas; the game menu offering to clear it is what says it is running. */
    await userEvent.click(page.getByRole('button', { name: 'Game menu' }));
    await expect(
      waitForFrame(() => page.getByRole('menuitem', { name: 'Clear confetti' }))
    ).resolves.toBeInTheDocument();
  },
});

/* The game menu stops the stream and clears the table for this viewer, then has nothing left to clear. */
export const ClearingCelebration = meta.story({
  globals: { motion: 'on' },
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

/* Replaying a finished game: the past board is the public table, so a seat sees no hand, reserve or action of its own. */
export const ReplayingAFinishedGame = meta.story({
  beforeEach: install(() => productTransport('seat-2', finishedSnapshot('seat-2'))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByText(/Declared by/, {}, { timeout: 30_000 });
    await openTab(page, 'Replay');
    await userEvent.click(await page.findByRole('button', { name: 'Replay from start' }));
    await expect(session.transport.messages).toContainEqual({ type: 'history', step: 0 });
    const { hand: _hand, bank: _bank, handOrder: _order, ...past } = playingSnapshot('seat-2');
    session.transport.deliver({ type: 'history', step: 0, lastStep: 12, snapshot: past });
    await expect(await page.findByText('Playback checkpoint 0 of 12')).toBeVisible();
    /* A replay is watched as a spectator watches: no phase, result or alliance action is offered, not even greyed. */
    for (const name of ['Next phase', 'Continue playing', 'Place storm randomly']) {
      await expect(page.queryByRole('button', { name })).toBeNull();
    }
    await openTab(page, 'Alliances');
    await expect(page.queryByRole('button', { name: 'Offer alliance' })).toBeNull();
  },
});

/* A refused checkpoint stays visible in the Replay window, which offers the replay again. */
export const ReplayRefusal = meta.story({
  beforeEach: install(() => productTransport('seat-2', finishedSnapshot('seat-2'))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByText(/Declared by/, {}, { timeout: 30_000 });
    await openTab(page, 'Replay');
    await userEvent.click(await page.findByRole('button', { name: 'Replay from start' }));
    session.transport.deliver({
      type: 'rejected',
      requestId: 'message',
      message: 'That checkpoint could not be loaded.',
    });
    const replay = within(windowNamed(page, 'Replay')!);
    await expect(replay.findByText('That checkpoint could not be loaded.')).resolves.toBeVisible();
    await expect(replay.getByRole('button', { name: 'Replay from start' })).toBeEnabled();
  },
});
