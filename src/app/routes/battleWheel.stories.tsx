import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { db, faction, ref, ruleset } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';
import productFactions from '@app/routes/_app/play/product.stories.fixture/factions.json';

import { clearStoredWheel, seedStoredWheel, storyWheel } from './_tool/tools/battle-wheel/battleWheel.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

/*
 * The battle wheel tool on a phone at the table (Norbert, 2026-11-09), as the page at /tools/battle-wheel: no app chrome, the
 * Rulesets and factions from the catalogue. Pick a leader and dial troops, and the dial and the total strength are counted the way
 * the Ruleset dials. No Treachery cards.
 * The page keeps its wheel in this browser's storage, so each story seeds the wheel it opens on, as a reload at the table would.
 */

/* GF9, whose base six the page offers first, as Play's product fixture captures them from production, and KISS, which dials its own way. */
function withRulesets(baseline: StorybookDatabase) {
  const gf9 = { ...ruleset({ name: 'GF9' }), battle_dialing: 'advanced' as const };
  baseline.rulesets.push(gf9, { ...ruleset({ name: 'KISS' }), battle_dialing: 'kiss' as const });
  productFactions.forEach((row, position) => {
    const seated = faction({ name: row.data.name, data: row.data as never });
    /* The baseline already holds House Atreides: it takes the production faction's data rather than a second row. */
    const known = baseline.factions.find((existing) => existing.$key === seated.$key);
    if (known) {
      known.data = seated.data;
    } else {
      baseline.factions.push(seated);
    }
    baseline.ruleset_factions.push({ ruleset_id: ref(gf9.$key!), faction_id: ref(seated.$key!), position });
  });
  return baseline;
}

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

/** A first visit: no faction yet, so the picker is open on GF9's base six, with a search for any other. */
export const FirstVisit = meta.story({
  beforeEach: clearStoredWheel,
  play: async ({ canvasElement }) => {
    await expect(
      await pageOf(canvasElement).findByRole('button', { name: 'Fremen' }, { timeout: 30_000 })
    ).toBeVisible();
  },
});

/** Picking a faction reads its leaders and troops from the catalogue onto the wheel. */
export const PicksAFaction = meta.story({
  beforeEach: clearStoredWheel,
  play: async ({ canvasElement }) => {
    const page = pageOf(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: 'Emperor' }, { timeout: 30_000 }));
    await expect(await page.findByRole('button', { name: 'More: Saudarkar' }, { timeout: 30_000 })).toBeVisible();
  },
});

/** Spice the troops no longer use is dropped, so it never comes back when troops are dialed again. */
export const DropsSpiceTheTroopsNoLongerUse = meta.story({
  beforeEach: () => seedStoredWheel(storyWheel('emperor', { troops: [0, 3], spice: 3, leader: false })),
  play: async ({ canvasElement }) => {
    const page = pageOf(canvasElement);
    const fewer = await page.findByRole('button', { name: 'Fewer: Saudarkar' }, { timeout: 30_000 });
    await userEvent.click(fewer);
    await userEvent.click(fewer);
    const more = page.getByRole('button', { name: 'More: Saudarkar' });
    await userEvent.click(more);
    await userEvent.click(more);
    await expect(page.getByText('Pays 1 spice')).toBeVisible();
  },
});
