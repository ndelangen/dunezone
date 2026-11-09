import preview from '@sb/preview';
import { expect, fireEvent, within } from 'storybook/test';

import { db } from '@db/storybook';

import {
  clearStoredLocket,
  seedStoredLocket,
  storyFaction,
  storyLocked,
  STORY_TIME_ZONE,
} from './_tool/tools/prediction-locket/predictionLocket.stories.fixture';
import { withRulesets } from './battleWheel.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

/*
 * The prediction locket on a phone at the table (Norbert, 2026-11-09), as the page at /tools/prediction-locket: no app chrome.
 * Pick a faction, a turn and your city, and lock it. The phone keeps the prediction; Dune Zone only gives the time it was locked,
 * shown in the city's time, so the phone's clock and the table's time zones play no part.
 * The page keeps the locket in this browser's storage, so each story seeds the locket it opens on.
 */

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tools/Prediction locket',
  args: { path: '/tools/prediction-locket' },
  globals: { ...pageStoryMeta.globals, viewport: { value: 'appMobile' }, motion: 'on' },
  parameters: { ...pageStoryMeta.parameters, database: db(withRulesets) },
});

const pageOf = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

/** A first visit: GF9's base six and a search for any other faction, turns 1 to 10, the phone's own city, and Lock waits for a faction and a turn. */
export const FirstVisit = meta.story({
  beforeEach: clearStoredLocket,
  play: async ({ canvasElement }) => {
    await expect(
      await pageOf(canvasElement).findByRole('button', { name: 'Fremen' }, { timeout: 30_000 })
    ).toBeVisible();
  },
});

/** The Fremen on turn 6, in Amsterdam, picked and ready to lock. */
export const Picked = meta.story({
  beforeEach: () =>
    seedStoredLocket({ faction: storyFaction('fremen'), turn: 6, timeZone: STORY_TIME_ZONE, locked: null }),
  play: async ({ canvasElement }) => {
    await expect(
      await pageOf(canvasElement).findByRole('button', { name: 'Turn 6', pressed: true }, { timeout: 30_000 })
    ).toBeVisible();
  },
});

/** Locked: the prediction is hidden, the time it was locked, in Amsterdam time, is not. */
export const Locked = meta.story({
  beforeEach: () => seedStoredLocket(storyLocked('fremen', 6, false)),
  play: async ({ canvasElement }) => {
    await expect(
      await pageOf(canvasElement).findByText('Amsterdam time, by Dune Zone’s clock', {}, { timeout: 30_000 })
    ).toBeVisible();
  },
});

/** Holding Peek shows the prediction to its owner, and letting go hides it again. */
export const Peeking = meta.story({
  beforeEach: () => seedStoredLocket(storyLocked('fremen', 6, false)),
  play: async ({ canvasElement }) => {
    const page = pageOf(canvasElement);
    await fireEvent.pointerDown(await page.findByRole('button', { name: 'Hold to peek' }, { timeout: 30_000 }));
    await expect(await page.findByText('Turn 6')).toBeVisible();
  },
});

/** The reveal: the Fremen on turn 6, and when it was locked, in Amsterdam time by Dune Zone's clock. */
export const Revealed = meta.story({
  beforeEach: () => seedStoredLocket(storyLocked('fremen', 6, true)),
  play: async ({ canvasElement }) => {
    const page = pageOf(canvasElement);
    await expect(await page.findByText('Amsterdam time, by Dune Zone’s clock', {}, { timeout: 30_000 })).toBeVisible();
    await expect(page.getByText('Turn 6')).toBeVisible();
  },
});
