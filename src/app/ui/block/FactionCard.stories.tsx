import preview from '@sb/preview';
import { assetPublishingFaction } from '@shared/factions/fixtures/assetPublishingFaction';
import { expect, within } from 'storybook/test';

import type { FactionCatalogueEntry } from '@db/factions';

import { FactionCard } from './FactionCard';

const baseFaction = {
  _id: 'faction-atreides',
  _creationTime: Date.parse('2026-07-20T10:00:00.000Z'),
  owner_id: 'owner-1',
  data: assetPublishingFaction,
  slug: 'atreides',
  group_id: null,
  created_at: '2026-07-20T10:00:00.000Z',
  updated_at: '2026-07-20T10:00:00.000Z',
  is_deleted: false,
  rulesets: [{ id: 'ruleset-advanced', slug: 'advanced', name: 'Advanced Dune' }],
} as unknown as FactionCatalogueEntry;

const meta = preview.meta({
  component: FactionCard,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: '19rem' }}>
        <Story />
      </div>
    ),
  ],
  args: { faction: baseFaction },
});

export const Default = meta.story({
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: 'Atreides Advanced Dune' })
    ).toBeVisible();
  },
});

export const MultipleRulesets = meta.story({
  args: {
    faction: {
      ...baseFaction,
      rulesets: [
        { id: 'ruleset-advanced', slug: 'advanced', name: 'Advanced Dune' },
        { id: 'ruleset-classic', slug: 'classic', name: 'Classic Dune' },
        { id: 'ruleset-tournament', slug: 'tournament', name: 'Tournament Dune' },
      ],
    } as FactionCatalogueEntry,
  },
});

export const SelectedRulesetPriority = meta.story({
  args: {
    faction: {
      ...baseFaction,
      rulesets: [
        { id: 'ruleset-advanced', slug: 'advanced', name: 'Advanced Dune' },
        { id: 'ruleset-classic', slug: 'classic', name: 'Classic Dune' },
      ],
    } as FactionCatalogueEntry,
    selectedRulesetSlug: 'classic',
  },
});

export const ContentStress = meta.story({
  args: {
    faction: {
      ...baseFaction,
      data: {
        ...assetPublishingFaction,
        name: 'The Very Long and Distinguished House of Atreides Expeditionary Council',
        leaders: assetPublishingFaction.leaders.slice(0, 3),
      },
      rulesets: [],
    } as FactionCatalogueEntry,
  },
  decorators: [
    (Story) => (
      <div style={{ width: '10rem' }}>
        <Story />
      </div>
    ),
  ],
});
