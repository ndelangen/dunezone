import { assetPublishingFaction } from '@shared/factions/fixtures/assetPublishingFaction';
import { factionRulesetLabel } from '@ui/block/FactionCard';
import { describe, expect, test } from 'vite-plus/test';

import type { FactionCatalogueEntry, FactionCatalogueRuleset } from '@db/factions';

import { nextSearch, normalizeFactionCatalogueSearch } from './catalogue';
import type { CatalogueFurniture } from './catalogue';

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

describe('faction catalogue address', () => {
  const rulesets = [
    { id: 'c' as never, slug: 'classic', name: 'Classic', factionCount: 1 },
  ] as FactionCatalogueRuleset[];
  const furniture = (owner: CatalogueFurniture['owner']): CatalogueFurniture => ({ rulesets, owner });
  const chani = { slug: 'chani', name: 'Chani' };

  test("keeps a member the answer in hand was never asked about, so Back to a member's list does not lose it to the previous page's answer", () => {
    /* `/factions?owner=chani`, then a ruleset, then Back: the location names the member again while the answer is still the ruleset's, which asked for nobody. */
    expect(normalizeFactionCatalogueSearch({ owner: 'chani' }, furniture(null))).toEqual({ owner: 'chani' });
    /* Or still another member's. */
    expect(
      normalizeFactionCatalogueSearch(
        { owner: 'chani' },
        furniture({ asked: 'stilgar', member: { slug: 'stilgar', name: 'Stilgar' } })
      )
    ).toEqual({ owner: 'chani' });
  });

  test('drops a member only when the answer for that slug named nobody, and writes the current slug of one it named', () => {
    expect(
      normalizeFactionCatalogueSearch(
        { owner: 'nobody', complexity: '2-5' },
        furniture({ asked: 'nobody', member: null })
      )
    ).toEqual({ complexity: '2-5' });
    expect(normalizeFactionCatalogueSearch({ owner: 'chani' }, furniture({ asked: 'chani', member: chani }))).toEqual({
      owner: 'chani',
    });
    /* An old "All N factions" link: the member renamed, and the address moves on to their current slug as the profile page's does. */
    expect(
      normalizeFactionCatalogueSearch(
        { owner: 'old-chani', sort: 'created' },
        furniture({ asked: 'old-chani', member: chani })
      )
    ).toEqual({ owner: 'chani', sort: 'created' });
    /* The ruleset is still judged by the live list, whatever the member filter answered. */
    expect(normalizeFactionCatalogueSearch({ ruleset: 'gone' }, furniture(null))).toEqual({});
    expect(normalizeFactionCatalogueSearch({ ruleset: 'classic' }, furniture(null))).toEqual({ ruleset: 'classic' });
  });

  test('choosing a ruleset clears the member, and any other change keeps them and starts from the first page', () => {
    expect(nextSearch({ owner: 'chani', sort: 'created', page: 3 }, { ruleset: 'classic' })).toEqual({
      ruleset: 'classic',
      sort: 'created',
    });
    expect(nextSearch({ owner: 'chani' }, { ruleset: undefined })).toEqual({});
    expect(nextSearch({ owner: 'chani', page: 2 }, { complexity: '2-5' })).toEqual({
      owner: 'chani',
      complexity: '2-5',
    });
    expect(nextSearch({ owner: 'chani', page: 2 }, { q: 'sietch' })).toEqual({ owner: 'chani', q: 'sietch' });
  });
});
