import preview from '@sb/preview';
import { applyBidding, biddingFactions, expireBid, idleBidding, isBiddingAction } from '@shared/play/bidding';
import type { BiddingState } from '@shared/play/bidding';
import { STANDARD_PHASES } from '@shared/play/phases';
import { rosterFactionIds } from '@shared/play/protocol';
import type { GameSnapshot } from '@shared/play/protocol';
import { stormOrder } from '@shared/play/stormSector';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';

import { gameMeta, install, lastCommand } from './game.stories.fixture';
import { productTransport, playingSnapshot } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Bidding',
});

/* Seat 2 holds House Harkonnen; the Emperor's token lies face down, so the Emperor sits this round out. */
function biddingSetup(bidding: Partial<BiddingState> | null, viewer = 'seat-2') {
  return install(() => {
    const snapshot: GameSnapshot = playingSnapshot(viewer);
    snapshot.phase = (snapshot.phases ?? STANDARD_PHASES).findIndex((entry) => entry.id === 'bidding');
    const emperor = snapshot.table.pieces.find((piece) => piece.stackKey === 'faction-token:emperor');
    if (emperor) {
      emperor.items = emperor.items.map((item) => ({ ...item, faceUp: false }));
    }
    if (bidding) {
      snapshot.bidding = { ...idleBidding(), ...bidding };
    }
    return productTransport(viewer, snapshot);
  });
}

let storyClock: { hold(): void; advance(milliseconds: number): void; resume(): void } | null = null;

/* The real bidder and command reducer, with an isolated story clock in place of the room alarm. */
function clockSetup(timed: boolean) {
  return install(() => {
    const snapshot = playingSnapshot('seat-2');
    snapshot.phase = (snapshot.phases ?? STANDARD_PHASES).findIndex((entry) => entry.id === 'bidding');
    snapshot.bidding = {
      ...idleBidding(20, timed),
      stage: 'open',
      round: 1,
      opener: 'house-harkonnen',
      turn: 'house-harkonnen',
    };
    const anchor = performance.now();
    let held: number | null = null;
    let paused = 0;
    const monotonicNow = () => held ?? performance.now() - anchor - paused;
    const clock = {
      hold() {
        held = monotonicNow();
      },
      advance(milliseconds: number) {
        held = monotonicNow() + milliseconds;
      },
      resume() {
        paused = performance.now() - anchor - monotonicNow();
        held = null;
      },
    };
    storyClock = clock;
    const now = () => STORYBOOK_NOW + Math.floor(monotonicNow());
    const context = () => ({
      factionId: 'house-harkonnen',
      order: stormOrder(snapshot.table.stormSectorIndex, snapshot.roster, snapshot.table.pieces),
      eligible: biddingFactions(snapshot.table.stormSectorIndex, snapshot.roster, snapshot.table.pieces),
      now: now(),
    });
    const transport = productTransport('seat-2', snapshot, {
      admitView: () => ({ ...transport.view(snapshot), serverNow: now() }),
      answerCommand: (message) => {
        if (isBiddingAction(message.action)) {
          snapshot.bidding = applyBidding(snapshot.bidding!, message.action, context());
          snapshot.revision += 1;
        }
        return { ...transport.view(snapshot, message.commandId), serverNow: now() };
      },
    });
    const timer = setInterval(() => {
      const next = expireBid(snapshot.bidding!, context());
      if (next && transport.connected()) {
        snapshot.bidding = next;
        snapshot.revision += 1;
        const frame = { ...transport.view(snapshot), serverNow: now() };
        transport.deliver(frame);
      }
    }, 100);
    const dispose = transport.dispose;
    return {
      ...transport,
      runtime: { ...transport.runtime, monotonicNow },
      dispose() {
        clearInterval(timer);
        if (storyClock === clock) {
          storyClock = null;
        }
        dispose();
      },
    };
  });
}

export const BeforeTheFirstRound = meta.story({
  beforeEach: biddingSetup(null),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const startAt = await page.findByRole('group', { name: 'Start new bidding starting at' }, { timeout: 30_000 });
    /* The Emperor's token lies face down: its button stays in place, greyed out, so flipping a token never moves the others. */
    await expect(within(startAt).getByRole('button', { name: /Emperor/ })).toBeDisabled();
    await userEvent.click(within(startAt).getByRole('button', { name: /Start bidding at .*Fremen/ }));
    await waitFor(() => expect(lastCommand()?.action).toEqual({ kind: 'bid-start', factionId: 'fremen' }));
  },
});

export const OnYourFaction = meta.story({
  beforeEach: biddingSetup({
    stage: 'open',
    round: 1,
    opener: 'house-atreides',
    turn: 'house-harkonnen',
    bid: { factionId: 'house-atreides', amount: 3 },
    deadline: STORYBOOK_NOW + 12_000,
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const bidder = await page.findByRole('button', { name: /Raise the bid to 4/ }, { timeout: 30_000 });
    await userEvent.click(bidder);
    await waitFor(() => expect(lastCommand()?.action).toEqual({ kind: 'bid-raise', round: 1 }));
    bidder.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    await waitFor(() => expect(lastCommand()?.action).toEqual({ kind: 'bid-pass', round: 1 }));
  },
});

export const OnAnotherFaction = meta.story({
  beforeEach: biddingSetup({
    stage: 'open',
    round: 1,
    opener: 'house-atreides',
    turn: 'fremen',
    bid: { factionId: 'house-harkonnen', amount: 4 },
    deadline: STORYBOOK_NOW + 12_000,
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole('button', { name: /Waiting for/ }, { timeout: 30_000 })).toBeDisabled();
  },
});

export const AfterAWin = meta.story({
  beforeEach: biddingSetup({
    stage: 'won',
    round: 1,
    opener: 'house-atreides',
    turn: 'house-harkonnen',
    bid: { factionId: 'house-harkonnen', amount: 5 },
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const startAt = await page.findByRole('group', { name: 'Start new bidding starting at' }, { timeout: 30_000 });
    await expect(within(startAt).getByRole('button', { name: /Harkonnen/ })).toBeEnabled();
    await expect(page.getByText('House Harkonnen wins with 5')).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Reset bidder' }));
    await waitFor(() => expect(lastCommand()?.action).toEqual({ kind: 'bid-reset' }));
  },
});

/** How opaque an element is drawn, its own opacity times every ancestor's. */
function drawnOpacity(element: Element) {
  let opacity = 1;
  for (let node: Element | null = element; node; node = node.parentElement) {
    opacity *= Number(getComputedStyle(node).opacity);
  }
  return opacity;
}

export const Faded = meta.story({
  beforeEach: biddingSetup({
    stage: 'open',
    round: 1,
    opener: 'house-atreides',
    turn: 'house-harkonnen',
    bid: { factionId: 'house-atreides', amount: 3 },
    deadline: STORYBOOK_NOW + 12_000,
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* The bidder's face draws with the table, after the top bar, so the story waits for it before fading. */
    const bidder = await page.findByRole('button', { name: /Raise the bid to 4/ }, { timeout: 30_000 });
    await expect(drawnOpacity(bidder)).toBe(1);
    await userEvent.click(page.getByRole('button', { name: 'Fade bidder' }));
    await expect(page.getByRole('button', { name: 'Show bidder' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(drawnOpacity(bidder)).toBeLessThan(0.5));
    /* A faded bidder still takes the raise. */
    await userEvent.click(bidder);
    await waitFor(() => expect(lastCommand()?.action).toEqual({ kind: 'bid-raise', round: 1 }));
  },
});

/* Every faction's Treachery card count, in storm order, in the left card bay's empty slot: the size of a hand is public. */
export const HandCounts = meta.story({
  beforeEach: install(() => {
    const snapshot: GameSnapshot = playingSnapshot('seat-2');
    snapshot.phase = (snapshot.phases ?? STANDARD_PHASES).findIndex((entry) => entry.id === 'bidding');
    const emperor = snapshot.table.pieces.find((piece) => piece.stackKey === 'faction-token:emperor');
    if (emperor) {
      emperor.items = emperor.items.map((item) => ({ ...item, faceUp: false }));
    }
    const factions = rosterFactionIds(snapshot.roster);
    snapshot.handCounts = Object.fromEntries(factions.map((id, index) => [id, [0, 1, 2, 4, 3, 8][index % 6]!]));
    return productTransport('seat-2', snapshot);
  }),
  /* The counts are painted into the table's canvas, so the story can only wait for the bidding phase they belong to. */
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('group', { name: 'Start new bidding starting at' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
  },
});

export const Timed = meta.story({ beforeEach: clockSetup(true) });
export const Untimed = meta.story({
  beforeEach: clockSetup(false),
  play: async ({ canvasElement }) => {
    const clock = storyClock!;
    clock.hold();
    try {
      const page = within(canvasElement.ownerDocument.body);
      const button = await page.findByRole('button', { name: 'Bid 1. Right click to pass.' }, { timeout: 30_000 });
      await userEvent.click(button);
      await expect(page.queryByRole('timer')).not.toBeInTheDocument();
      await userEvent.click(page.getByRole('button', { name: 'Game menu' }));
      const toggle = await page.findByRole('menuitemcheckbox', { name: /Timed bidding/ });
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
      await userEvent.click(toggle);
      await waitFor(() => expect(page.getByRole('timer')).toHaveTextContent('20s'));
      const arc = canvasElement.ownerDocument.querySelector('circle[pathLength="100"]')!;
      await waitFor(() => expect(arc.getAnimations()[0]).toBeDefined());
      const animation = arc.getAnimations()[0]!;
      animation.pause();
      try {
        clock.advance(13_000);
        await waitFor(() => expect(page.getByRole('timer')).toHaveTextContent('7s'));
        await waitFor(async () => {
          const offset = Number.parseFloat(getComputedStyle(arc).strokeDashoffset);
          await expect(offset).toBeCloseTo(65, 1);
        });
      } finally {
        animation.play();
      }
      await userEvent.click(toggle);
      await waitFor(() => expect(page.queryByRole('timer')).not.toBeInTheDocument());
      await userEvent.click(toggle);
      await waitFor(() => expect(page.getByRole('timer')).toHaveTextContent('20s'));
      await expect(page.getByRole('button', { name: 'Raise the bid to 2. Right click to pass.' })).toBeEnabled();
    } finally {
      clock.resume();
    }
  },
});
