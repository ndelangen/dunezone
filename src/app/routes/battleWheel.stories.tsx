import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { db } from '@db/storybook';

import { clearStoredWheel, seedStoredWheel, storyWheel } from './_tool/tools/battle-wheel/battleWheel.stories.fixture';
import { withRulesets } from './battleWheel.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

/*
 * The battle wheel tool on a phone at the table (Norbert, 2026-11-09), as the page at /tools/battle-wheel: no app chrome, the
 * Rulesets and factions from the catalogue. Pick a leader and dial troops, and the dial and the total strength are counted the way
 * the Ruleset dials. No Treachery cards.
 * The page keeps its wheel in this browser's storage, so each story seeds the wheel it opens on, as a reload at the table would.
 */

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Tools/Battle wheel',
  args: { path: '/tools/battle-wheel' },
  globals: { ...pageStoryMeta.globals, viewport: { value: 'appMobile' }, motion: 'on' },
  parameters: { ...pageStoryMeta.parameters, database: db(withRulesets) },
});

const pageOf = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

/** The Emperor under GF9's Advanced dialing: Fenring, three troops and two Sardaukar, two spice supporting the Sardaukar. */
export const Emperor = meta.story({
  beforeEach: () => seedStoredWheel(storyWheel('emperor', { troops: [3, 2], spice: 2 })),
  play: async ({ canvasElement }) => {
    await expect(await pageOf(canvasElement).findByText('Pays 2 spice', {}, { timeout: 30_000 })).toBeVisible();
  },
});

/** The Fremen, switched to KISS: troops at full strength, and troops that cost nothing dial for free. */
export const KissFremen = meta.story({
  beforeEach: () => seedStoredWheel(storyWheel('fremen', { troops: [4, 2] })),
  play: async ({ canvasElement }) => {
    const page = pageOf(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: 'Ruleset and faction' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('button', { name: /^KISS/ }));
    await expect(await page.findByText('KISS · KISS dialing')).toBeVisible();
  },
});

/** The Atreides under GF9 2.0 as the Emperor's ally: six troops, and 2 spice buys the +2 that costs anyone else 4. */
export const EmperorsAlly = meta.story({
  beforeEach: () => seedStoredWheel(storyWheel('house-atreides', { troops: [6], spice: 4 })),
  play: async ({ canvasElement }) => {
    const page = pageOf(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: 'Ruleset and faction' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('button', { name: /^GF9 2\.0/ }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await page.findByRole('button', { name: "Emperor's ally: half price" }));
    await expect(await page.findByText('Pays 2 spice')).toBeVisible();
  },
});

/** A first visit: no faction yet, so the picker is open on GF9's base six, with a search for any other. */
export const FirstVisit = meta.story({
  beforeEach: clearStoredWheel,
  play: async ({ canvasElement }) => {
    await expect(
      await pageOf(canvasElement).findByRole('button', { name: 'Fremen' }, { timeout: 30_000 })
    ).toBeVisible();
  },
});
