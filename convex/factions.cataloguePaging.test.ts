/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import type { FunctionArgs } from 'convex/server';
import { describe, expect, test } from 'vitest';

import { FACTION_CATALOGUE_PAGE_SIZE, FACTION_CATALOGUE_SORTS } from '../src/shared/factions/catalogueSearch';
import { api } from './_generated/api';
import { seedCatalogue } from './factions.catalogue.test.fixture';
import type { SeededFaction } from './factions.catalogue.test.fixture';
import { factionTest } from './factions.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

type CatalogueArgs = FunctionArgs<typeof api.factions.catalogue>;

async function catalogueWith(factions: SeededFaction[], rulesets: Parameters<typeof seedCatalogue>[2] = []) {
  const t = factionTest();
  const seeded = await seedCatalogue(t, factions, rulesets);
  const page = (args: CatalogueArgs = {}) => t.query(api.factions.catalogue, args);
  const names = async (args: CatalogueArgs = {}) => (await page(args)).cards.map((card) => card.data.name);
  return { t, seeded, page, names };
}

/** Every page of one question, in order, as a reader paging through would see them. */
async function allPages(
  page: (args: CatalogueArgs) => Promise<{ cards: { _id: string }[]; pageCount: number }>,
  args: CatalogueArgs
) {
  const first = await page(args);
  const rest = await Promise.all(
    Array.from({ length: first.pageCount - 1 }, (_, index) => page({ ...args, page: index + 2 }))
  );
  return [first, ...rest].flatMap((result) => result.cards.map((card) => card._id));
}

describe('faction catalogue query', () => {
  test('narrows by a live ruleset and by the complexity range, and counts each ruleset', async () => {
    const { page, names } = await catalogueWith(
      [
        { name: 'Low', complexity: 0.1, rulesets: ['classic'] },
        { name: 'Middle', complexity: 0.5, rulesets: ['classic', 'advanced', 'gone'] },
        { name: 'High', complexity: 0.9 },
        { name: 'Deleted', complexity: 0.5, rulesets: ['classic'], deleted: true },
      ],
      [
        { slug: 'classic', name: 'Classic' },
        { slug: 'advanced', name: 'Advanced' },
        { slug: 'gone', name: 'Gone', deleted: true },
      ]
    );

    expect(await names()).toEqual(['High', 'Low', 'Middle']);
    expect(await names({ ruleset: 'classic' })).toEqual(['Low', 'Middle']);
    expect(await names({ complexity: '5-10' })).toEqual(['High', 'Middle']);
    expect(await names({ ruleset: 'classic', complexity: '5-10' })).toEqual(['Middle']);
    /* A deleted or unknown ruleset narrows nothing; the route drops it from the address. */
    expect(await names({ ruleset: 'gone' })).toEqual(['High', 'Low', 'Middle']);
    expect(await names({ ruleset: 'nowhere' })).toEqual(['High', 'Low', 'Middle']);

    const result = await page({ ruleset: 'classic' });
    expect(result).toMatchObject({ total: 2, catalogueTotal: 3 });
    expect(result.rulesets.map(({ slug, factionCount }) => [slug, factionCount])).toEqual([
      ['advanced', 1],
      ['classic', 2],
    ]);
    /* A card names only its live rulesets, name then id. */
    expect(result.cards.find((card) => card.data.name === 'Middle')?.rulesets.map((ruleset) => ruleset.slug)).toEqual([
      'advanced',
      'classic',
    ]);
  });

  test('searches faction, Faction leader and leader names with typo tolerance, best match first', async () => {
    const { names } = await catalogueWith(
      [
        { name: 'Atreides', factionLeader: 'Duke Leto', rulesets: ['classic'] },
        { name: 'Fremen', leaders: ['Chani', 'Stilgar'] },
        { name: 'Harkonnen', factionLeader: 'Baron Vladimir' },
        { name: 'House Atreides Remnant' },
      ],
      [{ slug: 'classic', name: 'Classic' }]
    );

    expect(await names({ q: 'Atredes' })).toEqual(['Atreides', 'House Atreides Remnant']);
    expect(await names({ q: 'Leto' })).toEqual(['Atreides']);
    expect(await names({ q: 'Stilgar' })).toEqual(['Fremen']);
    expect(await names({ q: 'Chani', ruleset: 'classic' })).toEqual([]);
    expect(await names({ q: 'Atreides', sort: 'name' })).toEqual(['Atreides', 'House Atreides Remnant']);
    expect(await names({ q: '   ' })).toEqual(['Atreides', 'Fremen', 'Harkonnen', 'House Atreides Remnant']);
  });

  test('orders by every sort, breaking ties by name then id, with undated factions last', async () => {
    const { names, page, seeded } = await catalogueWith([
      { name: 'beta', created: '2026-07-20T00:00:00.000Z', updated: '2026-07-22T00:00:00.000Z', complexity: 0.5 },
      { name: 'Broken', created: 'not-a-date', updated: 'not-a-date', complexity: 0.1 },
      { name: 'Alpha', created: '2026-07-20T00:00:00.000Z', updated: '2026-07-25T00:00:00.000Z', complexity: 0.5 },
      { name: 'Newest', created: '2026-07-21T00:00:00.000Z', updated: '2026-07-21T00:00:00.000Z', complexity: 0.9 },
      { name: 'Twin', created: '2026-07-01T00:00:00.000Z', complexity: 0.5 },
      { name: 'Twin', created: '2026-07-01T00:00:00.000Z', complexity: 0.5 },
    ]);
    const [twinA, twinB] = [seeded.factionIds[4]!, seeded.factionIds[5]!].sort();

    expect(await names()).toEqual(['Alpha', 'beta', 'Broken', 'Newest', 'Twin', 'Twin']);
    expect(await names({ sort: 'created' })).toEqual(['Newest', 'Alpha', 'beta', 'Twin', 'Twin', 'Broken']);
    expect(await names({ sort: 'updated' })).toEqual(['Alpha', 'beta', 'Newest', 'Twin', 'Twin', 'Broken']);
    expect(await names({ sort: 'complexity-asc' })).toEqual(['Broken', 'Alpha', 'beta', 'Twin', 'Twin', 'Newest']);
    expect(await names({ sort: 'complexity-desc' })).toEqual(['Newest', 'Alpha', 'beta', 'Twin', 'Twin', 'Broken']);
    for (const sort of FACTION_CATALOGUE_SORTS) {
      const twins = (await page({ sort })).cards.filter((card) => card.data.name === 'Twin').map((card) => card._id);
      expect(twins).toEqual([twinA, twinB]);
    }
  });

  test('pages through every faction exactly once in every order, and says where the catalogue ends', async () => {
    const count = FACTION_CATALOGUE_PAGE_SIZE * 2 + 5;
    /* Few distinct keys, so most of the order rests on the tie-breaks. */
    const factions = Array.from({ length: count }, (_, index) => ({
      name: `Faction ${index % 7}`,
      created: `2026-07-${String((index % 3) + 1).padStart(2, '0')}T00:00:00.000Z`,
      complexity: (index % 4) / 4,
      leaders: [`Leader ${index}`],
    }));
    const { page, seeded } = await catalogueWith(factions);

    for (const sort of [undefined, ...FACTION_CATALOGUE_SORTS]) {
      const ids = await allPages(page, { sort });
      expect(ids).toHaveLength(count);
      expect(new Set(ids)).toEqual(new Set(seeded.factionIds));
      expect(await allPages(page, { sort })).toEqual(ids);
    }

    const last = await page({ page: 3 });
    expect(last).toMatchObject({ page: 3, pageCount: 3, total: count, pageSize: FACTION_CATALOGUE_PAGE_SIZE });
    expect(last.cards).toHaveLength(5);
    expect((await page({ page: 2 })).cards).toHaveLength(FACTION_CATALOGUE_PAGE_SIZE);

    const past = await page({ page: 9 });
    expect(past).toMatchObject({ page: 9, pageCount: 3, total: count, cards: [] });
    for (const odd of [0, -1, 1.5]) {
      expect(await page({ page: odd })).toMatchObject({ page: 1 });
    }
    const searched = await page({ q: 'Leader 1', page: 1 });
    expect(searched.total).toBeGreaterThan(0);
    expect(searched.pageCount).toBe(Math.max(1, Math.ceil(searched.total / FACTION_CATALOGUE_PAGE_SIZE)));
  }, 60_000);

  test('spotlights the newest arrival and a different, freshly updated faction', async () => {
    const { page } = await catalogueWith([
      { name: 'New arrival', created: '2026-07-20T00:00:00.000Z' },
      { name: 'Recently updated', created: '2026-07-10T00:00:00.000Z', updated: '2026-07-21T00:00:00.000Z' },
      { name: 'Deleted faction', created: '2026-07-22T00:00:00.000Z', deleted: true },
      { name: 'Undated', created: 'never', updated: '2026-07-30T00:00:00.000Z' },
    ]);

    const { spotlights } = await page({ page: 5 });
    expect(spotlights.newArrival?.data.name).toBe('New arrival');
    expect(spotlights.freshlyUpdated?.data.name).toBe('Recently updated');
  });

  test('ships what a card draws and leaves the rest of the blob behind', async () => {
    const { page } = await catalogueWith([{ name: 'Full blob' }]);
    const [card] = (await page()).cards;

    expect(Object.keys(card ?? {}).sort()).toEqual(['_id', 'created_at', 'data', 'rulesets', 'slug', 'updated_at']);
    expect(Object.keys(card?.data ?? {}).sort()).toEqual([
      'background',
      'complexity',
      'factionLeader',
      'leaders',
      'logo',
      'name',
    ]);
  });

  test('lists a faction its full read refuses, and the page that shows it fails at the query boundary', async () => {
    const t = factionTest();
    await seedCatalogue(t, [{ name: 'Fine' }]);
    await t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      const ownerId = await ctx.db.insert('users', { name: 'Malformed owner' });
      await ctx.db.insert('factions', {
        owner_id: ownerId,
        data: { name: 'Zz malformed' },
        slug: 'malformed',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
        is_deleted: false,
        group_id: null,
      });
    });

    await expect(t.query(api.factions.catalogue, { q: 'Fine' })).resolves.toMatchObject({ total: 1 });
    await expect(t.query(api.factions.catalogue, {})).rejects.toThrow();
  });
});
