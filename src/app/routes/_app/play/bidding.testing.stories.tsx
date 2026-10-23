import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { STORYBOOK_NOW } from '@db/storybook';

import { biddingSetup, clockSetup, openBiddingSettings, storyClock } from './bidding.stories.fixture';
import { gameMeta, lastCommand } from './game.stories.fixture';

const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Bidding',
});

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
      const toggle = await openBiddingSettings(canvasElement);
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
