import preview from '@sb/preview';
import type { Decorator } from '@storybook/tanstack-react';

import { STORYBOOK_NOW } from '@db/storybook';

import { biddingSetup, clockSetup } from './bidding.stories.fixture';
import { gameMeta } from './game.stories.fixture';
import { BidderShapeContext } from './multiplayer/bidderShapes';
import type { BidderShape } from './multiplayer/bidderShapes';

/* The bidder shape exploration (Norbert, 2026-11-08): the same open round, drawn in each shape on trial. */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Bidding/Bidder shapes',
});

/* Fremen's turn over Harkonnen's high bid of 4, seen from Harkonnen's seat. */
const fremenTurn = biddingSetup({
  stage: 'open',
  round: 1,
  opener: 'house-atreides',
  turn: 'fremen',
  bid: { factionId: 'house-harkonnen', amount: 4 },
  deadline: STORYBOOK_NOW + 12_000,
});

const drawn = (shape: BidderShape, beforeEach = fremenTurn) => ({
  beforeEach,
  decorators: [
    ((Story) => (
      <BidderShapeContext value={shape}>
        <Story />
      </BidderShapeContext>
    )) satisfies Decorator,
  ],
});

export const Current = meta.story(drawn('current'));
export const Needle = meta.story(drawn('needle'));
export const ClockHand = meta.story(drawn('clockHand'));
export const SoftDrop = meta.story(drawn('softDrop'));
export const Chevron = meta.story(drawn('chevron'));
export const BluntDrop = meta.story(drawn('bluntDrop'));
export const Dial = meta.story(drawn('dial'));
export const HollowBluntDrop = meta.story(drawn('hollowBluntDrop'));

/* The same shape while the bidder points at the viewer's Harkonnen in a live round: the bigger face with its raise, lower and pass buttons, which work. */
export const HollowBluntDropYourTurn = meta.story(drawn('hollowBluntDrop', clockSetup(true)));
