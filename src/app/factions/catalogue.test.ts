import { describe, expect, test } from 'vitest';

import type { FactionCatalogueEntry } from '@db/factions';
import { factionRulesetLabel } from '@app/components/block/FactionCard';
import { assetPublishingFaction } from '@game/fixtures/assetPublishingFaction';

import { projectFactionCatalogue } from './catalogue';

function faction(
  id: string,
  name: string,
  options: {
    hero?: string;
    leaders?: string[];
    created?: string;
    updated?: string;
    rulesets?: FactionCatalogueEntry['rulesets'];
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
      hero: { ...assetPublishingFaction.hero, name: options.hero ?? 'Lady Jessica' },
      leaders: (options.leaders ?? ['Duncan Idaho']).map((leader, index) => ({
        ...assetPublishingFaction.leaders[index],
        name: leader,
      })),
    },
  } as unknown as FactionCatalogueEntry;
}

describe('faction catalogue controls', () => {
  test('fuzzy-searches faction, hero, and leader names before applying a ruleset', () => {
    const classic = { id: 'classic', slug: 'classic', name: 'Classic' } as never;
    const factions = [
      faction('1', 'Atreides', { hero: 'Duke Leto', rulesets: [classic] }),
      faction('2', 'Fremen', { leaders: ['Chani'] }),
    ];

    expect(
      projectFactionCatalogue(factions, {}, 'Atredes').map((entry) => entry.data.name)
    ).toEqual(['Atreides']);
    expect(projectFactionCatalogue(factions, {}, 'Leto')).toHaveLength(1);
    expect(projectFactionCatalogue(factions, {}, 'Chani')).toHaveLength(1);
    expect(projectFactionCatalogue(factions, { ruleset: 'classic' }, 'Chani')).toEqual([]);
  });

  test('sorts dates newest-first, breaks ties by identity, and puts invalid dates last', () => {
    const factions = [
      faction('2', 'Beta', { created: '2026-07-20T00:00:00.000Z' }),
      faction('3', 'Broken', { created: 'not-a-date' }),
      faction('1', 'Alpha', { created: '2026-07-20T00:00:00.000Z' }),
      faction('4', 'Newest', { created: '2026-07-21T00:00:00.000Z' }),
    ];

    expect(
      projectFactionCatalogue(factions, { sort: 'created' }).map((entry) => entry.data.name)
    ).toEqual(['Newest', 'Alpha', 'Beta', 'Broken']);
  });

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
