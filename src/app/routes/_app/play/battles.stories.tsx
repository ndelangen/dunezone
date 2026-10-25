import preview from '@sb/preview';
import { finishTransitions } from '@sb/storyWaits';
import { expect, waitFor, within } from 'storybook/test';

import { battleSetup, readiness, withConvexIds } from './battles.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
import { battleStory, settled } from './playing.stories.fixture';
import { productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Battles',
});

/**
 * Every element in the wheels whose computed animation name is set.
 * The name stays after the reveal has finished, where `getAnimations` would come back empty, so a still wheel cannot pass for one that turned in before the check ran.
 */
function animatedIn(wheels: readonly HTMLElement[]) {
  return wheels
    .flatMap((wheel) => [wheel, ...wheel.querySelectorAll('*')])
    .filter((element) => getComputedStyle(element).animationName !== 'none');
}

const revealedPieces = install(() => {
  const snapshot = battleStory('revealed');
  const battle = snapshot.battle!;
  const card = snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose')!;
  card.battleOverlay = battle.id;
  battle.revealed![0].pieces = [card];
  battle.revealed![0].cardIds = [card.id];
  return productTransport('seat-2', snapshot);
});

/** The site's Motion setting reaches the wheels: the preparing side's ring holds still and dashed instead of pulsing. */
export const ReadinessStill = meta.story({
  globals: { motion: 'reduce' },
  beforeEach: readiness,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const preparing = await page.findByRole(
      'img',
      { name: 'House Harkonnen, left side, aggressor, Preparing' },
      { timeout: 30_000 }
    );
    const ready = page.getByRole('img', { name: 'House Atreides, right side, Ready' });
    await expect(animatedIn([preparing, ready])).toEqual([]);
    await expect(getComputedStyle(preparing.querySelector('svg[data-ready]')!).strokeDasharray).not.toBe('none');
  },
});

/** A live battle's wheels name both sides from the roster in a real game too. */
export const ReadinessInRealGame = meta.story({
  beforeEach: install(() => productTransport('neutral', withConvexIds(battleStory('preparing', true)))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() =>
      expect(page.getByRole('img', { name: 'House Harkonnen, left side, aggressor, Preparing' })).toBeVisible()
    );
    await expect(page.getByRole('img', { name: 'House Atreides, right side, Ready' })).toBeVisible();
  },
});

export const RevealedPieces = meta.story({
  beforeEach: revealedPieces,
  play: async ({ canvasElement }) => {
    await waitFor(
      async () => {
        const callout = canvasElement.ownerDocument.querySelector<HTMLElement>('[data-battle-stage="revealed"]');
        await expect(callout).not.toBeNull();
        const card = within(callout!).getByRole('button', { name: 'Drag Snooper onto table' });
        await expect(finishTransitions(card)).toBeVisible();
        await expect(card).toBeEnabled();
      },
      { timeout: 30_000 }
    );
  },
});

/** The site's Motion setting reaches the wheels: both plans show at once, with no turn. */
export const RevealedPiecesStill = meta.story({
  globals: { motion: 'reduce' },
  beforeEach: revealedPieces,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const plans = /^House (Harkonnen|Atreides) plan,/;
    /* The viewer is a side, so the Battle window opens with its own plan's wheel; the two on the table are the reveal. */
    const revealed = () => page.getAllByLabelText(plans).filter((plan) => !plan.closest('[data-window]'));
    await settled(() => expect(revealed()).toHaveLength(2));
    await expect(animatedIn(page.getAllByLabelText(plans))).toEqual([]);
    for (const plan of revealed()) {
      await expect(within(plan).getByText('Strength')).toBeVisible();
    }
  },
});

/** A side that called a winner sees who the battle now waits on. */
export const WinnerCalled = meta.story({
  beforeEach: battleSetup('revealed', 'seat-2', (snapshot) => {
    snapshot.battle!.sides[1]!.choice = null;
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() => expect(page.getByText('Waiting for House Atreides to agree')).toBeVisible());
    await expect(page.getByRole('button', { name: 'Left side won' })).toBeVisible();
  },
});

/** When the sides call different winners, each sees the other's call rather than a wait. */
export const WinnerCallsDiffer = meta.story({
  beforeEach: battleSetup('revealed'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await settled(() => expect(page.getByText('House Atreides says right side won')).toBeVisible());
  },
});
