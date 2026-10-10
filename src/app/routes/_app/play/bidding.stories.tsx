import preview from "@sb/preview";
import { idleBidding } from "@shared/play/bidding";
import type { BiddingState } from "@shared/play/bidding";
import { STANDARD_PHASES } from "@shared/play/phases";
import type { GameSnapshot } from "@shared/play/protocol";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { STORYBOOK_NOW } from "@db/storybook";

import { gameMeta, install, lastCommand } from "./game.stories.fixture";
import { productTransport, playingSnapshot } from "./product.stories.fixture";

const meta = preview.meta({
  ...gameMeta,
  title: "Play/Playing/Bidding",
});

/* Seat 2 holds House Harkonnen; the Emperor's token lies face down, so the Emperor sits this round out. */
function biddingSetup(
  bidding: Partial<BiddingState> | null,
  viewer = "seat-2",
) {
  return install(() => {
    const snapshot: GameSnapshot = playingSnapshot(viewer);
    snapshot.phase = (snapshot.phases ?? STANDARD_PHASES).findIndex(
      (entry) => entry.id === "bidding",
    );
    const emperor = snapshot.table.pieces.find(
      (piece) => piece.stackKey === "faction-token:emperor",
    );
    if (emperor) {
      emperor.items = emperor.items.map((item) => ({ ...item, faceUp: false }));
    }
    if (bidding) {
      snapshot.bidding = { ...idleBidding(), ...bidding };
    }
    return productTransport(viewer, snapshot);
  });
}

export const BidderBeforeTheFirstRound = meta.story({
  beforeEach: biddingSetup(null),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const startAt = await page.findByRole(
      "group",
      { name: "Start new bidding starting at" },
      { timeout: 30_000 },
    );
    /* The Emperor's token lies face down: its button stays in place, greyed out, so flipping a token never moves the others. */
    await expect(
      within(startAt).getByRole("button", { name: /Emperor/ }),
    ).toBeDisabled();
    await userEvent.click(
      within(startAt).getByRole("button", {
        name: /Start bidding at .*Fremen/,
      }),
    );
    await waitFor(() =>
      expect(lastCommand()?.action).toEqual({
        kind: "bid-start",
        factionId: "fremen",
      }),
    );
  },
});

export const BidderOnYourFaction = meta.story({
  beforeEach: biddingSetup({
    stage: "open",
    round: 1,
    opener: "house-atreides",
    turn: "house-harkonnen",
    bid: { factionId: "house-atreides", amount: 3 },
    deadline: STORYBOOK_NOW + 30_000,
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const bidder = await page.findByRole(
      "button",
      { name: /Raise the bid to 4/ },
      { timeout: 30_000 },
    );
    await userEvent.click(bidder);
    await waitFor(() =>
      expect(lastCommand()?.action).toEqual({ kind: "bid-raise", round: 1 }),
    );
    bidder.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
      }),
    );
    await waitFor(() =>
      expect(lastCommand()?.action).toEqual({ kind: "bid-pass", round: 1 }),
    );
  },
});

export const BidderOnAnotherFaction = meta.story({
  beforeEach: biddingSetup({
    stage: "open",
    round: 1,
    opener: "house-atreides",
    turn: "fremen",
    bid: { factionId: "house-harkonnen", amount: 4 },
    deadline: STORYBOOK_NOW + 30_000,
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByRole(
        "button",
        { name: /Waiting for/ },
        { timeout: 30_000 },
      ),
    ).toBeDisabled();
  },
});

export const BidderAfterAWin = meta.story({
  beforeEach: biddingSetup({
    stage: "won",
    round: 1,
    opener: "house-atreides",
    turn: "house-harkonnen",
    bid: { factionId: "house-harkonnen", amount: 5 },
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const startAt = await page.findByRole(
      "group",
      { name: "Start new bidding starting at" },
      { timeout: 30_000 },
    );
    await expect(
      within(startAt).getByRole("button", { name: /Harkonnen/ }),
    ).toBeEnabled();
    await userEvent.click(page.getByRole("button", { name: "Reset bidder" }));
    await waitFor(() =>
      expect(lastCommand()?.action).toEqual({ kind: "bid-reset" }),
    );
  },
});

export const BidderFaded = meta.story({
  beforeEach: biddingSetup({
    stage: "open",
    round: 1,
    opener: "house-atreides",
    turn: "house-harkonnen",
    bid: { factionId: "house-atreides", amount: 3 },
    deadline: STORYBOOK_NOW + 30_000,
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* The bidder's face draws with the table, after the top bar, so the story waits for it before fading. */
    const bidder = await page.findByRole(
      "button",
      { name: /Raise the bid to 4/ },
      { timeout: 30_000 },
    );
    await userEvent.click(page.getByRole("button", { name: "Fade bidder" }));
    await expect(
      page.getByRole("button", { name: "Show bidder" }),
    ).toHaveAttribute("aria-pressed", "true");
    /* A faded bidder still takes the raise. */
    await userEvent.click(bidder);
    await waitFor(() =>
      expect(lastCommand()?.action).toEqual({ kind: "bid-raise", round: 1 }),
    );
  },
});

/* Every faction's Treachery card count sits beside its token, for every viewer: the size of a hand is public. */
export const HandCounts = meta.story({
  beforeEach: install(() => {
    const snapshot: GameSnapshot = playingSnapshot("seat-2");
    snapshot.phase = (snapshot.phases ?? STANDARD_PHASES).findIndex(
      (entry) => entry.id === "bidding",
    );
    const factions =
      snapshot.roster?.seats.flatMap(({ faction }) =>
        faction ? [faction.id] : [],
      ) ?? [];
    snapshot.handCounts = Object.fromEntries(
      factions.map((id, index) => [id, [0, 1, 2, 4, 3, 8][index % 6]!]),
    );
    return productTransport("seat-2", snapshot);
  }),
  play: async ({ canvasElement }) => {
    await waitFor(
      () =>
        expect(
          canvasElement.ownerDocument.querySelector('[data-hand-count="4"]'),
        ).not.toBeNull(),
      {
        timeout: 30_000,
      },
    );
  },
});
