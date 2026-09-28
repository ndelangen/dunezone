import preview from '@sb/preview';
import { assetPublishingFaction } from '@shared/factions/fixtures/assetPublishingFaction';

import type { FactionCatalogueEntry } from '@db/factions';

import { FactionList } from './FactionList';
import { expectFactionColumns } from './factionListPlay';

function entry(
  id: string,
  slug: string,
  rulesets: { id: string; slug: string; name: string }[]
): FactionCatalogueEntry {
  return {
    _id: id,
    _creationTime: Date.parse('2026-07-20T10:00:00.000Z'),
    owner_id: 'owner-1',
    data: assetPublishingFaction,
    slug,
    group_id: null,
    created_at: '2026-07-20T10:00:00.000Z',
    updated_at: '2026-07-20T10:00:00.000Z',
    is_deleted: false,
    rulesets,
  } as unknown as FactionCatalogueEntry;
}

const advanced = { id: 'ruleset-advanced', slug: 'advanced', name: 'Advanced Dune' };
const classic = { id: 'ruleset-classic', slug: 'classic', name: 'Classic Dune' };

const factions = [
  entry('faction-atreides', 'atreides', [advanced]),
  entry('faction-harkonnen', 'harkonnen', [classic]),
  entry('faction-fremen', 'fremen', [advanced, classic]),
  entry('faction-guild', 'guild', []),
];

const meta = preview.meta({
  component: FactionList,
  parameters: { layout: 'padded' },
  args: { factions },
  argTypes: { className: { control: false } },
});

/**
 * The grid's rhythm is all this owns, and the tiles frame themselves.
 * From the tablet step the row takes as many columns as fit at 11.5rem or wider, which keeps a card around 200px: five across a desktop window.
 */
export const Default = meta.story({
  globals: { viewport: { value: 'appDesktop' } },
  play: async ({ canvasElement }) => {
    await expectFactionColumns(canvasElement, 5);
  },
});

/** A list as wide as a tablet's page is three columns across, however wide that makes each card. */
export const Tablet = meta.story({
  globals: { viewport: { value: 'appTablet' } },
  play: async ({ canvasElement }) => {
    await expectFactionColumns(canvasElement, 3);
  },
});

/** A list as wide as a phone's page is two columns across. */
export const Mobile = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    await expectFactionColumns(canvasElement, 2);
  },
});

/**
 * With a ruleset chosen, each tile marks its membership against that one rather than listing all of them, which is why this takes a slug rather than deriving it.
 */
export const WithSelectedRuleset = meta.story({
  args: { selectedRulesetSlug: 'advanced' },
  globals: { viewport: { value: 'appDesktop' } },
});

/**
 * A single entry still lays out as a grid cell rather than stretching, which is what keeps a one-result search looking like the same list.
 */
export const SingleEntry = meta.story({
  args: { factions: [factions[0]] },
  globals: { viewport: { value: 'appDesktop' } },
});
