import preview from '@sb/preview';
import { STANDARD_PHASES } from '@shared/play/phases';
import { rosterFactionIds } from '@shared/play/protocol';
import type { GameSnapshot } from '@shared/play/protocol';
import { expect, within } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';

import { biddingSetup, clockSetup, opponentsSetup } from './bidding.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
import { showBidderVariant } from './multiplayer/BidControls';
import type { BidderVariant } from './multiplayer/BidControls';
import { productTransport, playingSnapshot } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Bidding',
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

/*
 * Prototypes of a more fluent bidder (#2983): the other factions bid on their own, card after card, while the viewer tries each way to bid.
 * Every variant but today's bids and hands the bidder on in one step.
 */
const prototype = (variant: BidderVariant) => ({
  beforeEach: () => {
    showBidderVariant(variant);
    const dispose = opponentsSetup()();
    return () => {
      dispose();
      showBidderVariant('today');
    };
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('group', { name: 'Your bid' }, { timeout: 30_000 })).resolves.toBeInTheDocument();
  },
});

/* As the bidder plays now: + raises one spice at a time, − takes one back, Pass hands the bidder on. */
export const PrototypeToday = meta.story(prototype('today'));

/* Pick the amount with ↑ ↓ or the wheel, then Enter bids it and hands the bidder on. */
export const PrototypeAmount = meta.story(prototype('amount'));

/* +1, +2 and +5 over the table's bid, each one click that also hands the bidder on. */
export const PrototypeQuickRaises = meta.story(prototype('quick'));

/* Today's buttons, and "Pass this card" passes for you whenever the bidder comes round this card. */
export const PrototypePassThisCard = meta.story(prototype('passCard'));

/* Today's buttons, and a limit: the bidder bids one over for you until the bid reaches it, then passes. */
export const PrototypeBidUpTo = meta.story(prototype('limit'));

/* Amount, quick raises, "Pass this card" and a limit together. */
export const PrototypeEverything = meta.story(prototype('all'));
