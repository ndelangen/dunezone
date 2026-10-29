import { waitForFrame } from '@sb/storyWaits';
import { applyBidding, biddingFactions, expireBid, idleBidding, isBiddingAction } from '@shared/play/bidding';
import type { BiddingState } from '@shared/play/bidding';
import { STANDARD_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { stormOrder } from '@shared/play/stormSector';
import { userEvent, within } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';

import { install } from './game.stories.fixture';
import { productTransport, playingSnapshot } from './product.stories.fixture';

/** Opens the game menu and returns its timed-bidding control. */
export async function openBiddingSettings(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(page.getByRole('button', { name: 'Game menu' }));
  return waitForFrame(() => page.getByRole('menuitemcheckbox', { name: /Timed bidding/ }));
}

/* The Bidding phase with the named factions' tokens face down, so they sit the bidding out. */
function biddingSnapshot(bidding: Partial<BiddingState> | null, viewer: string, sittingOut: readonly string[]) {
  const snapshot: GameSnapshot = playingSnapshot(viewer);
  snapshot.phase = (snapshot.phases ?? STANDARD_PHASES).findIndex((entry) => entry.id === 'bidding');
  for (const faction of sittingOut) {
    const token = snapshot.table.pieces.find((piece) => piece.stackKey === `faction-token:${faction}`);
    if (token) {
      token.items = token.items.map((item) => ({ ...item, faceUp: false }));
    }
  }
  if (bidding) {
    snapshot.bidding = { ...idleBidding(), ...bidding };
  }
  return snapshot;
}

/* Seat 2 holds House Harkonnen; the Emperor's token lies face down, so the Emperor sits this round out. */
export function biddingSetup(bidding: Partial<BiddingState> | null, viewer = 'seat-2') {
  return install(() => productTransport(viewer, biddingSnapshot(bidding, viewer, ['emperor'])));
}

/* Seat 2's Harkonnen token lies face down beside the Emperor's, and the table turns a token over when asked, as the room does. */
export function sittingOutSetup() {
  return install(() => {
    const snapshot = biddingSnapshot(null, 'seat-2', ['emperor', 'house-harkonnen']);
    const transport = productTransport('seat-2', snapshot, {
      answerCommand: (message) => {
        const action = message.action;
        const piece =
          action.kind === 'flip' ? snapshot.table.pieces.find((entry) => entry.id === action.pieceId) : null;
        if (piece) {
          piece.items = piece.items.map((item) => ({ ...item, faceUp: !item.faceUp }));
          snapshot.revision += 1;
        }
        return transport.view(snapshot, message.commandId);
      },
    });
    return transport;
  });
}

export let storyClock: { hold(): void; advance(milliseconds: number): void; resume(): void } | null = null;

/* The real bidder and command reducer, with an isolated story clock in place of the room alarm. */
export function clockSetup(timed: boolean) {
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
