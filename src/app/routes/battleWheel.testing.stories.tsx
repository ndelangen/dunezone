import { testingPreview } from '@sb/preview';
import { SEEDED_FACTION_TOKENS } from '@sb/seededFactionTokens';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db } from '@db/storybook';

import { clearStoredWheel, seedStoredWheel, storyWheel } from './_tool/tools/battle-wheel/battleWheel.stories.fixture';
import { withRulesets } from './battleWheel.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

/* What the battle wheel does, checked on the page; the layouts these end on are the visual stories' own. */
const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Tools/Battle wheel',
  args: { path: '/tools/battle-wheel' },
  globals: { ...pageStoryMeta.globals, viewport: { value: 'appMobile' }, motion: 'on' },
  parameters: { ...pageStoryMeta.parameters, database: db(withRulesets) },
});

const pageOf = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

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

/** The search shows each seeded faction with its own token, so the ids Storybook answers with product tokens still name these factions. */
export const SearchShowsEachFactionsToken = meta.story({
  beforeEach: clearStoredWheel,
  play: async ({ canvasElement }) => {
    const page = pageOf(canvasElement);
    const search = await page.findByRole('searchbox', { name: 'Search factions' }, { timeout: 30_000 });
    const names: Record<string, string> = {
      'house-atreides': 'House Atreides',
      'house-harkonnen': 'House Harkonnen',
      emperor: 'Emperor',
      'spacing-guild': 'Spacing Guild',
      fremen: 'Fremen',
      'bene-gesserit': 'Bene Gesserit',
    };
    for (const [id, slug] of Object.entries(SEEDED_FACTION_TOKENS)) {
      await userEvent.clear(search);
      await userEvent.type(search, names[slug]!);
      const row = await page.findByRole('button', { name: `Add ${names[slug]}` }, { timeout: 30_000 });
      await waitFor(() => expect(row.querySelector('img')?.getAttribute('src')).toContain(`/faction-tokens/${id}/`));
    }
  },
});
