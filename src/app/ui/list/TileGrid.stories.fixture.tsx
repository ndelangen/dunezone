import { assetPublishingFaction } from '@shared/factions/fixtures/assetPublishingFaction';

import type { FactionCatalogueEntry } from '@db/factions';

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

export const factions = [
  entry('faction-atreides', 'atreides', [advanced]),
  entry('faction-harkonnen', 'harkonnen', [classic]),
  entry('faction-fremen', 'fremen', [advanced, classic]),
  entry('faction-guild', 'guild', []),
];
