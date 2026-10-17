import { assetPublishingFaction } from '@shared/factions/fixtures/assetPublishingFaction';
import { factionRulesetLabel } from '@ui/block/FactionCard';
import { describe, expect, test } from 'vite-plus/test';

import type { FactionCatalogueEntry } from '@db/factions';

function faction(
  id: string,
  name: string,
  options: {
    factionLeader?: string;
    leaders?: string[];
    created?: string;
    updated?: string;
    rulesets?: FactionCatalogueEntry['rulesets'];
    complexity?: number;
  } = {}
) {
  return {
    _id: id,
    _creationTime: 1,
    owner_id: 'owner',
    slug: name.toLowerCase().replaceAll(' ', '-'),
    group_id: null,
    is_deleted: false,
    created_at: options.created ?? '2026-07-01T00:00:00.000Z',
    updated_at: options.updated ?? '2026-07-01T00:00:00.000Z',
    rulesets: options.rulesets ?? [],
    data: {
      ...assetPublishingFaction,
      name,
      ...(options.complexity == null ? {} : { complexity: { calculated: options.complexity } }),
      factionLeader: { ...assetPublishingFaction.factionLeader, name: options.factionLeader ?? 'Lady Jessica' },
      leaders: (options.leaders ?? ['Duncan Idaho']).map((leader, index) => ({
        ...assetPublishingFaction.leaders[index],
        name: leader,
      })),
    },
  } as unknown as FactionCatalogueEntry;
}

describe('faction catalogue cards', () => {
  test('prioritizes the selected ruleset and summarizes the rest as +N', () => {
    const entry = faction('1', 'Atreides', {
      rulesets: [
        { id: 'a', slug: 'advanced', name: 'Advanced' } as never,
        { id: 'c', slug: 'classic', name: 'Classic' } as never,
      ],
    });

    expect(factionRulesetLabel(entry)).toBe('Advanced +1');
    expect(factionRulesetLabel(entry, 'classic')).toBe('Classic +1');
    expect(factionRulesetLabel(faction('2', 'Fremen'))).toBeNull();
  });
});
