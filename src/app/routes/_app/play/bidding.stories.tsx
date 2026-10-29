import preview from '@sb/preview';
import { STANDARD_PHASES } from '@shared/play/phases';
import { rosterFactionIds } from '@shared/play/protocol';
import type { GameSnapshot } from '@shared/play/protocol';
import { expect, within } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';

import { biddingSetup, clockSetup } from './bidding.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
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
