/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { applicationTriggers } from './lib/applicationTriggers';
import {
  ALL_PARTITION,
  CATALOGUE_PAGE_SIZE,
  SORT_FIELDS,
  auditFactionCatalogueIndex,
  clearFactionCatalogueOrder,
  selectCataloguePageEntries,
} from './lib/factionCatalogueIndex';
import type { SortDirection, SortField } from './lib/factionCatalogueIndex';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const AT = '2026-10-01T00:00:00.000Z';

function catalogueTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'factionCatalogueOrder');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  return t;
}
type CatalogueTest = ReturnType<typeof catalogueTest>;

/* Few distinct names and complexities, so tie groups straddle page boundaries. */
const NAMES = ['Atreides', 'Harkonnen', 'Fremen', 'Emperor', 'Guild', 'Bene Gesserit', 'Ixians'];
const COMPLEXITIES = [0.1, 0.3, 0.3, 0.55, 0.8, 0.95];

function factionRow(ownerId: Id<'users'>, index: number) {
  const day = String(1 + (index % 28)).padStart(2, '0');
  return {
    owner_id: ownerId,
    data: {
      ...assetPublishingFaction,
      name: `${NAMES[index % NAMES.length]}${index % 3 === 0 ? '' : ` ${index}`}`,
      complexity: { calculated: COMPLEXITIES[index % COMPLEXITIES.length]! },
    },
    slug: `faction-${index}`,
    created_at: `2026-07-${day}T00:00:00.000Z`,
    updated_at: `2026-08-${String(1 + ((index * 7) % 28)).padStart(2, '0')}T00:00:00.000Z`,
    is_deleted: false,
    group_id: null,
  };
}

async function seed(t: CatalogueTest, count: number, { triggers = true } = {}) {
  return await t.run(async (rawCtx) => {
    const ctx = triggers ? applicationTriggers.wrapDB(rawCtx) : rawCtx;
    const ownerId = await ctx.db.insert('users', { name: 'Catalogue owner' });
    const ruleset = (name: string) =>
      ctx.db.insert('rulesets', {
        name,
        about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
        slug: name.toLowerCase(),
        created_at: AT,
        updated_at: AT,
        owner_id: ownerId,
        group_id: null,
        is_deleted: false,
        image_cover: null,
      });
    const advanced = await ruleset('Advanced');
    const basic = await ruleset('Basic');
    const factionIds: Id<'factions'>[] = [];
    for (let index = 0; index < count; index += 1) {
      factionIds.push(await ctx.db.insert('factions', factionRow(ownerId, index)));
    }
    for (const [index, factionId] of factionIds.entries()) {
      if (index % 2 === 0) {
        await ctx.db.insert('ruleset_factions', { ruleset_id: advanced, faction_id: factionId });
      }
      if (index % 5 === 0) {
        await ctx.db.insert('ruleset_factions', { ruleset_id: basic, faction_id: factionId });
      }
    }
    return { ownerId, advanced, basic, factionIds };
  });
}

/** The expected order, computed from the entries table rather than the aggregate under test. */
async function expectedOrder(
  t: CatalogueTest,
  partition: string,
  sort: SortField,
  direction: SortDirection,
  filter: (entry: Doc<'faction_catalogue_entries'>) => boolean = () => true
) {
  const field = { name: 'name_key', created: 'created_at', updated: 'updated_at', complexity: 'complexity' } as const;
  const entries = await t.run(async (ctx) =>
    (await ctx.db.query('faction_catalogue_entries').collect()).filter((e) => e.partition === partition && filter(e))
  );
  const sign = direction === 'asc' ? 1 : -1;
  return entries
    .sort((left, right) => {
      const a = left[field[sort]];
      const b = right[field[sort]];
      return sign * ((a < b ? -1 : a > b ? 1 : 0) || left._creationTime - right._creationTime);
    })
    .map((entry) => entry.faction_id);
}

async function walkPages(
  t: CatalogueTest,
  args: {
    ruleset?: Id<'rulesets'>;
    sort: SortField;
    direction: SortDirection;
    complexityMin?: number;
    complexityMax?: number;
  }
) {
  const ids: string[] = [];
  const first = await t.query(api.factionCatalogueIndex.page, { ...args, page: 1 });
  for (let page = 1; page <= first.pageCount; page += 1) {
    const result = page === 1 ? first : await t.query(api.factionCatalogueIndex.page, { ...args, page });
    expect(result.exact).toBe(true);
    expect(result.total).toBe(first.total);
    expect(result.items.length).toBe(
      page < first.pageCount ? CATALOGUE_PAGE_SIZE : first.total - (page - 1) * CATALOGUE_PAGE_SIZE
    );
    ids.push(...result.items.map((item) => item._id));
  }
  const beyond = await t.query(api.factionCatalogueIndex.page, { ...args, page: first.pageCount + 1 });
  expect(beyond.items).toEqual([]);
  return { ids, total: first.total, mode: first.mode };
}

async function expectClean(t: CatalogueTest, partitions: string[]) {
  for (const partition of partitions) {
    const audit = await t.run(async (ctx) => await auditFactionCatalogueIndex(ctx, partition));
    expect(audit.problems).toEqual([]);
  }
}

describe('faction catalogue index prototype (approach B)', () => {
  test('every sort, direction and partition pages contiguously with exact totals', { timeout: 180_000 }, async () => {
    const t = catalogueTest();
    const { advanced, basic } = await seed(t, 55);
    await expectClean(t, [ALL_PARTITION, advanced, basic]);

    for (const ruleset of [undefined, advanced, basic]) {
      for (const sort of SORT_FIELDS) {
        for (const direction of ['asc', 'desc'] as const) {
          const walked = await walkPages(t, { ruleset, sort, direction });
          const expected = await expectedOrder(t, ruleset ?? ALL_PARTITION, sort, direction);
          expect(walked.mode).toBe('aggregate');
          expect(walked.total).toBe(expected.length);
          expect(new Set(walked.ids).size).toBe(walked.ids.length);
          expect(walked.ids).toEqual(expected);
        }
      }
    }
    expect((await walkPages(t, { sort: 'name', direction: 'asc' })).total).toBe(55);
    expect((await walkPages(t, { ruleset: advanced, sort: 'name', direction: 'asc' })).total).toBe(28);
    expect((await walkPages(t, { ruleset: basic, sort: 'name', direction: 'asc' })).total).toBe(11);
  });

  test(
    'a complexity range is exact: bounded aggregate on its own sort, in-memory sort otherwise',
    { timeout: 180_000 },
    async () => {
      const t = catalogueTest();
      const { advanced } = await seed(t, 55);
      const range = { complexityMin: 0.3, complexityMax: 0.8 };
      const inRange = (entry: Doc<'faction_catalogue_entries'>) => entry.complexity >= 0.3 && entry.complexity <= 0.8;
      for (const ruleset of [undefined, advanced]) {
        for (const sort of SORT_FIELDS) {
          for (const direction of ['asc', 'desc'] as const) {
            const walked = await walkPages(t, { ruleset, sort, direction, ...range });
            expect(walked.mode).toBe(sort === 'complexity' ? 'aggregate-bounded' : 'in-memory');
            expect(walked.ids).toEqual(await expectedOrder(t, ruleset ?? ALL_PARTITION, sort, direction, inRange));
          }
        }
      }
    }
  );

  test(
    'past the in-memory cap the filtered scan stays exact until its read budget runs out',
    { timeout: 60_000 },
    async () => {
      const t = catalogueTest();
      await seed(t, 75);
      const args = {
        sort: 'name' as const,
        direction: 'asc' as const,
        complexityMin: 0.3,
        complexityMax: 0.8,
        page: 1,
      };
      const expected = await expectedOrder(
        t,
        ALL_PARTITION,
        'name',
        'asc',
        (e) => e.complexity >= 0.3 && e.complexity <= 0.8
      );
      const ids: string[] = [];
      for (let page = 1; page <= Math.ceil(expected.length / CATALOGUE_PAGE_SIZE); page += 1) {
        const result = await t.run(
          async (ctx) =>
            await selectCataloguePageEntries(ctx, { ...args, page }, { inMemorySortCap: 5, scanBudget: 10_000 })
        );
        expect(result.mode).toBe('filtered-scan');
        expect(result.exact).toBe(true);
        expect(result.total).toBe(expected.length);
        ids.push(...result.entries.map((entry) => entry.faction_id));
      }
      expect(ids).toEqual(expected);

      const starved = await t.run(
        async (ctx) =>
          await selectCataloguePageEntries(ctx, { ...args, page: 2 }, { inMemorySortCap: 5, scanBudget: 30 })
      );
      expect(starved.exact).toBe(false);
      expect(starved.total).toBe(expected.length);
    }
  );

  test(
    'search pages over the hits, filtered by partition and complexity and optionally re-sorted',
    { timeout: 60_000 },
    async () => {
      const t = catalogueTest();
      const { advanced } = await seed(t, 40);
      const all = await t.query(api.factionCatalogueIndex.page, { q: 'harkonnen', sort: 'relevance', page: 1 });
      expect(all.mode).toBe('search');
      expect(all.exact).toBe(true);
      expect(all.total).toBe(6);
      expect(all.items.every((item) => item.data.name.startsWith('Harkonnen'))).toBe(true);

      const scoped = await t.query(api.factionCatalogueIndex.page, {
        q: 'harkonnen',
        ruleset: advanced,
        sort: 'name',
        direction: 'desc',
        page: 1,
      });
      expect(scoped.total).toBe(3);
      const names = scoped.items.map((item) => item.data.name.toLowerCase());
      expect(names).toEqual([...names].sort().reverse());

      /* Leader names are searchable too: every faction carries the fixture's Faction leader. */
      const leader = assetPublishingFaction.factionLeader.name.split(' ')[0]!.toLowerCase();
      const byLeader = await t.query(api.factionCatalogueIndex.page, { q: leader, sort: 'relevance', page: 2 });
      expect(byLeader.total).toBe(40);
      expect(byLeader.items).toHaveLength(16);
    }
  );

  test(
    'triggers keep entries and every sort aggregate in step across create, update, link, unlink and soft delete',
    { timeout: 60_000 },
    async () => {
      const t = catalogueTest();
      const userId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Author' }));
      const author = t.withIdentity({ subject: userId });
      await author.mutation(api.profiles.bootstrapCurrent, {});
      const rulesetId = await t.run(
        async (ctx) =>
          await ctx.db.insert('rulesets', {
            name: 'Linked',
            about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
            slug: 'linked',
            created_at: AT,
            updated_at: AT,
            owner_id: userId,
            group_id: null,
            is_deleted: false,
            image_cover: null,
          })
      );
      const partitions = [ALL_PARTITION, rulesetId];
      const total = async (ruleset?: Id<'rulesets'>) =>
        (await t.query(api.factionCatalogueIndex.page, { ruleset, sort: 'updated', page: 1 })).total;

      const zeta = await author.mutation(api.factions.create, {
        data: { ...assetPublishingFaction, name: 'Zeta' },
        group_id: null,
      });
      const alpha = await author.mutation(api.factions.create, {
        data: { ...assetPublishingFaction, name: 'Alpha' },
        group_id: null,
      });
      await expectClean(t, partitions);
      expect(await total()).toBe(2);
      const firstByName = async () =>
        (await t.query(api.factionCatalogueIndex.page, { sort: 'name', page: 1 })).items.map((item) => item.data.name);
      expect(await firstByName()).toEqual(['Alpha', 'Zeta']);

      await author.mutation(api.factions.update, { id: alpha._id, data: { ...alpha.data, name: 'Omega' } });
      await expectClean(t, partitions);
      expect(await firstByName()).toEqual(['Omega', 'Zeta']);

      await author.mutation(api.rulesets.addFaction, { ruleset_id: rulesetId, faction_id: zeta._id });
      await author.mutation(api.rulesets.addFaction, { ruleset_id: rulesetId, faction_id: alpha._id });
      await expectClean(t, partitions);
      expect(await total(rulesetId)).toBe(2);

      await author.mutation(api.rulesets.removeFaction, { ruleset_id: rulesetId, faction_id: zeta._id });
      await expectClean(t, partitions);
      expect(await total(rulesetId)).toBe(1);

      await author.mutation(api.factions.softDelete, { id: alpha._id });
      await expectClean(t, partitions);
      expect(await total()).toBe(1);
      expect(await total(rulesetId)).toBe(0);
      expect(await firstByName()).toEqual(['Zeta']);

      /* A deleted ruleset's partition answers empty rather than serving stale membership. */
      await t.run(async (ctx) => await ctx.db.patch('rulesets', rulesetId, { is_deleted: true }));
      expect(await total(rulesetId)).toBe(0);
    }
  );

  test('the rebuild backfills from nothing and repairs a cleared aggregate', { timeout: 60_000 }, async () => {
    vi.useFakeTimers();
    try {
      const t = catalogueTest();
      const { advanced, basic } = await seed(t, 30, { triggers: false });
      expect(await t.run(async (ctx) => (await ctx.db.query('faction_catalogue_entries').collect()).length)).toBe(0);

      await t.mutation(internal.factionCatalogueIndex.rebuild, { phase: 'entries', cursor: null });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      await expectClean(t, [ALL_PARTITION, advanced, basic]);
      expect((await walkPages(t, { ruleset: basic, sort: 'complexity', direction: 'desc' })).total).toBe(6);

      await t.run(async (ctx) => await clearFactionCatalogueOrder(ctx));
      expect((await t.query(api.factionCatalogueIndex.page, { sort: 'name', page: 1 })).total).toBe(0);
      await t.mutation(internal.factionCatalogueIndex.rebuild, { phase: 'order', cursor: null });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      await expectClean(t, [ALL_PARTITION, advanced, basic]);
      expect((await walkPages(t, { sort: 'name', direction: 'asc' })).total).toBe(30);
    } finally {
      vi.useRealTimers();
    }
  });
});
