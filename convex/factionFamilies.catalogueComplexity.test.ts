/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { variantsFixture } from './factionVariants.test.fixture';
import { ALL_PARTITION, selectCataloguePage, selectCatalogueSearch } from './lib/catalogueOrder';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const withComplexity = (calculated: number) => ({ ...assetPublishingFaction, complexity: { calculated } });

/** A faction whose default variant is simple and whose second variant is hard (#2929). */
async function mixedFaction() {
  const fixture = await variantsFixture();
  const { root, addVariant, save } = fixture;
  await save(root._id, withComplexity(0.2));
  const hard = await addVariant('Hard');
  await save(hard.id, withComplexity(0.9));
  return fixture;
}

const HARD: [number, number] = [8, 10];

describe('the complexity filter matches a faction through any variant (#2929)', () => {
  test('a page of factions keeps one whose second variant is in range, whatever the sort', async () => {
    const { t, familyId } = await mixedFaction();
    for (const sort of ['name', 'complexity'] as const) {
      const page = await t.run((ctx) =>
        selectCataloguePage(ctx, {
          kind: 'faction_family',
          partition: ALL_PARTITION,
          sort,
          direction: 'asc',
          page: 1,
          pageSize: 10,
          complexity: HARD,
          anyScore: true,
        })
      );
      expect(page.entries.map((entry) => entry.source_id)).toEqual([familyId]);
      expect(page).toMatchObject({ total: 1, exact: true });
    }
  });

  test('without any-score matching, a range matches the entry’s own score only, as every other kind does', async () => {
    const { t } = await mixedFaction();
    const page = await t.run((ctx) =>
      selectCataloguePage(ctx, {
        kind: 'faction_family',
        partition: ALL_PARTITION,
        sort: 'complexity',
        direction: 'asc',
        page: 1,
        pageSize: 10,
        complexity: HARD,
      })
    );
    expect(page.entries).toEqual([]);
  });

  test('a search keeps a faction whose second variant is in range', async () => {
    const { t, familyId } = await mixedFaction();
    const found = await t.run((ctx) =>
      selectCatalogueSearch(ctx, {
        kind: 'faction_family',
        partition: ALL_PARTITION,
        text: 'Hard',
        limit: 10,
        complexity: HARD,
      })
    );
    expect(found.entries.map((entry) => entry.source_id)).toEqual([familyId]);
  });
});
