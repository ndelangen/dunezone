import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { battleSetup, readiness, revealedPieces } from './battles.stories.fixture';
import { gameMeta } from './game.stories.fixture';
import { settled } from './playing.stories.fixture';

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
