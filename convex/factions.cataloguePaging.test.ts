/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import type { GenericDatabaseReader } from 'convex/server';
import { describe, expect, test } from 'vitest';

import { compareCodeUnits } from '../src/shared/compareText';
import { FACTION_CATALOGUE_PAGE_SIZE, FACTION_CATALOGUE_SORTS } from '../src/shared/factions/catalogueSearch';
import { api } from './_generated/api';
import type { DataModel, Id } from './_generated/dataModel';
import { CATALOGUE_STAMP, catalogueFactionData, seedCatalogue } from './factions.catalogue.test.fixture';
import type { SeededFaction } from './factions.catalogue.test.fixture';
import { factionAuthor, factionTest } from './factions.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

type CatalogueArgs = FunctionArgs<typeof api.factions.catalogue>;
type CatalogueAnswer = FunctionReturnType<typeof api.factions.catalogue>;

/** The browsed shape, which every call without a search answers with. */
function browsed(answer: CatalogueAnswer) {
  if ('mode' in answer) {
    throw new Error('Expected a browsed page, got a search.');
  }
  return answer;
}

/** The searched shape, which every search answers with. */
function searched(answer: CatalogueAnswer) {
  if (!('mode' in answer)) {
    throw new Error('Expected a search, got a browsed page.');
  }
  return answer;
}

async function catalogueWith(factions: SeededFaction[], rulesets: Parameters<typeof seedCatalogue>[2] = []) {
  const t = factionTest();
  const seeded = await seedCatalogue(t, factions, rulesets);
  const page = async (args: CatalogueArgs = {}) => browsed(await t.query(api.factions.catalogue, args));
  const search = async (args: CatalogueArgs) => searched(await t.query(api.factions.catalogue, args));
  const names = async (args: CatalogueArgs = {}) => (await page(args)).cards.map((card) => card.data.name);
  const found = async (args: CatalogueArgs) =>
    (await search({ limit: 24, ...args })).cards.map((card) => card.data.name).sort(compareCodeUnits);
  return { t, seeded, page, search, names, found };
}

/** The profile holding a slug, which the tests above seeded. */
async function profileBySlug(ctx: { db: GenericDatabaseReader<DataModel> }, slug: string) {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (!profile) {
    throw new Error(`No profile holds ${slug}.`);
  }
  return profile;
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

  test('narrows to one member by their profile slug, in place of a ruleset, browsed or searched', async () => {
    const { t, page, search, names } = await catalogueWith(
      [{ name: 'Harkonnen', rulesets: ['classic'] }],
      [{ slug: 'classic', name: 'Classic' }]
    );
    const chani = await factionAuthor(t, 'Chani');
    for (const name of ['Sietch Tabr', 'Fremen']) {
      await chani.mutation(api.factions.create, { data: catalogueFactionData({ name }) });
    }

    expect(await names()).toEqual(['Fremen', 'Harkonnen', 'Sietch Tabr']);
    expect(await names({ owner: 'chani' })).toEqual(['Fremen', 'Sietch Tabr']);
    expect(await names({ owner: 'chani', sort: 'created' })).toEqual(['Fremen', 'Sietch Tabr']);
    /* The member's list wins over a ruleset's, as the address parser keeps only the member. */
    expect(await names({ owner: 'chani', ruleset: 'classic' })).toEqual(['Fremen', 'Sietch Tabr']);
    /* A slug no public profile holds narrows nothing, and the answer echoes the slug and names nobody, so the route drops it. */
    expect(await names({ owner: 'nobody' })).toEqual(['Fremen', 'Harkonnen', 'Sietch Tabr']);
    expect((await page({ owner: 'nobody' })).owner).toEqual({ asked: 'nobody', member: null });
    expect((await page({})).owner).toBeNull();

    const narrowed = await page({ owner: 'chani' });
    expect(narrowed).toMatchObject({
      total: 2,
      catalogueTotal: 3,
      owner: { asked: 'chani', member: { slug: 'chani', name: 'Chani' } },
    });
    /* The rulesets keep the whole catalogue's counts: choosing one leaves the member's list. */
    expect(narrowed.rulesets.map(({ slug, factionCount }) => [slug, factionCount])).toEqual([['classic', 1]]);

    const found = await search({ q: 'sietch', owner: 'chani', limit: FACTION_CATALOGUE_PAGE_SIZE });
    expect(found.cards.map((card) => card.data.name)).toEqual(['Sietch Tabr']);
    expect(found.owner).toEqual({ asked: 'chani', member: { slug: 'chani', name: 'Chani' } });
  });

  test("pages a member's list like any other, and a faction leaves it for its new owner's", async () => {
    const { t, page, names } = await catalogueWith([{ name: 'Harkonnen' }]);
    await factionAuthor(t, 'Chani');
    await factionAuthor(t, 'Stilgar');
    const { chaniId, stilgarId } = await t.run(async (ctx) => ({
      chaniId: (await profileBySlug(ctx, 'chani')).user_id,
      stilgarId: (await profileBySlug(ctx, 'stilgar')).user_id,
    }));
    /* A page and one more by Chani, written through the triggers as every writer is. */
    const sietches = await t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      const ids: Id<'factions'>[] = [];
      for (let index = 0; index <= FACTION_CATALOGUE_PAGE_SIZE; index += 1) {
        ids.push(
          await ctx.db.insert('factions', {
            owner_id: chaniId,
            data: catalogueFactionData({ name: `Sietch ${String(index).padStart(2, '0')}` }),
            slug: `sietch-${index}`,
            created_at: CATALOGUE_STAMP,
            updated_at: CATALOGUE_STAMP,
            is_deleted: false,
            group_id: null,
          })
        );
      }
      return ids;
    });

    const first = await page({ owner: 'chani' });
    expect(first).toMatchObject({
      total: FACTION_CATALOGUE_PAGE_SIZE + 1,
      pageCount: 2,
      catalogueTotal: FACTION_CATALOGUE_PAGE_SIZE + 2,
    });
    expect(first.cards).toHaveLength(FACTION_CATALOGUE_PAGE_SIZE);
    const second = await page({ owner: 'chani', page: 2 });
    expect(second).toMatchObject({ total: FACTION_CATALOGUE_PAGE_SIZE + 1, pageCount: 2 });
    expect(second.cards.map((card) => card.data.name)).toEqual([`Sietch ${FACTION_CATALOGUE_PAGE_SIZE}`]);
    expect([...first.cards, ...second.cards].map((card) => card._id).sort(compareCodeUnits)).toEqual(
      [...sietches].sort(compareCodeUnits)
    );
    expect(await names({ owner: 'stilgar' })).toEqual([]);

    /* Patching the owner moves the faction from one member's list to the other's, and the counts follow. */
    await t.run((rawCtx) => applicationTriggers.wrapDB(rawCtx).db.patch(sietches[0]!, { owner_id: stilgarId }));
    expect(await page({ owner: 'chani' })).toMatchObject({ total: FACTION_CATALOGUE_PAGE_SIZE, pageCount: 1 });
    expect((await page({ owner: 'chani', page: 2 })).cards).toEqual([]);
    expect(await names({ owner: 'stilgar' })).toEqual(['Sietch 00']);
    expect(await page({ owner: 'stilgar' })).toMatchObject({
      total: 1,
      catalogueTotal: FACTION_CATALOGUE_PAGE_SIZE + 2,
    });
  }, 30_000);

  test('names nobody for a profile without a public page: pending deletion, deleted, or merged into one that is gone', async () => {
    const { t, page, names } = await catalogueWith([{ name: 'Harkonnen' }]);
    const chani = await factionAuthor(t, 'Chani');
    await chani.mutation(api.factions.create, { data: catalogueFactionData({ name: 'Fremen' }) });
    await factionAuthor(t, 'Gone');
    const nobody = { asked: 'chani', member: null };
    const everyone = ['Fremen', 'Harkonnen'];

    for (const account_state of ['deletion_pending', 'deleted'] as const) {
      await t.run(async (ctx) => ctx.db.patch((await profileBySlug(ctx, 'chani'))._id, { account_state }));
      expect((await page({ owner: 'chani' })).owner).toEqual(nobody);
      expect(await names({ owner: 'chani' })).toEqual(everyone);
    }
    /* Active again, but folded into a profile that is itself deleted. */
    await t.run(async (ctx) => {
      const gone = await profileBySlug(ctx, 'gone');
      await ctx.db.patch(gone._id, { account_state: 'deleted' });
      await ctx.db.patch((await profileBySlug(ctx, 'chani'))._id, {
        account_state: 'active',
        merged_into_profile_id: gone._id,
      });
    });
    expect((await page({ owner: 'chani' })).owner).toEqual(nobody);
    expect(await names({ owner: 'chani' })).toEqual(everyone);
    await expect(t.query(api.profiles.pageBySlug, { slug: 'chani' })).rejects.toThrow();
  });

  test('an old "All N factions" link still names the member after a rename or a merge, as the profile page does', async () => {
    const { t, page, names } = await catalogueWith([{ name: 'Harkonnen' }]);
    const chani = await factionAuthor(t, 'Chani');
    await chani.mutation(api.factions.create, { data: catalogueFactionData({ name: 'Fremen' }) });
    const stilgar = await factionAuthor(t, 'Stilgar');
    await stilgar.mutation(api.factions.create, { data: catalogueFactionData({ name: 'Sietch Tabr' }) });
    const profilePage = async (slug: string) => (await t.query(api.profiles.pageBySlug, { slug })).profile.slug;

    /* Renamed: the former address leads on to the current one, and the answer names the current slug for the route to write. */
    await t.run(async (ctx) => {
      const profile = await profileBySlug(ctx, 'chani');
      await ctx.db.patch(profile._id, { slug: 'chani-kynes', username: 'Chani Kynes' });
      await ctx.db.insert('former_slugs', { kind: 'profile', scope: '', slug: 'chani', record_id: profile._id });
    });
    const renamed = await page({ owner: 'chani' });
    expect(renamed.owner).toEqual({ asked: 'chani', member: { slug: 'chani-kynes', name: 'Chani Kynes' } });
    expect(renamed.cards.map((card) => card.data.name)).toEqual(['Fremen']);
    expect(await profilePage('chani')).toBe('chani-kynes');

    /* Merged: the address leads to the profile it was folded into, by the old slug and the current one alike. */
    await t.run(async (ctx) => {
      const [source, target] = await Promise.all([profileBySlug(ctx, 'chani-kynes'), profileBySlug(ctx, 'stilgar')]);
      await ctx.db.patch(source._id, { merged_into_profile_id: target._id });
    });
    for (const slug of ['chani', 'chani-kynes']) {
      expect((await page({ owner: slug })).owner).toEqual({
        asked: slug,
        member: { slug: 'stilgar', name: 'Stilgar' },
      });
      expect(await names({ owner: slug })).toEqual(['Sietch Tabr']);
      expect(await profilePage(slug)).toBe('stilgar');
    }
  });

  test('searches faction, Faction leader and leader names by every word, the last word as a prefix', async () => {
    const { names, found } = await catalogueWith(
      [
        { name: 'Atreides', factionLeader: 'Duke Leto', rulesets: ['classic'] },
        { name: 'Fremen', leaders: ['Chani', 'Stilgar'] },
        { name: 'Harkonnen', factionLeader: 'Baron Vladimir' },
        { name: 'House Atreides Remnant' },
      ],
      [{ slug: 'classic', name: 'Classic' }]
    );

    expect(await found({ q: 'Atreides' })).toEqual(['Atreides', 'House Atreides Remnant']);
    expect(await found({ q: 'atre' })).toEqual(['Atreides', 'House Atreides Remnant']);
    expect(await found({ q: 'Atredes' })).toEqual([]);
    expect(await found({ q: 'Leto' })).toEqual(['Atreides']);
    /* Every word must match, not any: Convex search alone would also return every other House. */
    expect(await found({ q: 'House Atreides' })).toEqual(['House Atreides Remnant']);
    expect(await found({ q: 'Duke Le' })).toEqual(['Atreides']);
    expect(await found({ q: 'Duke Stilgar' })).toEqual([]);
    expect(await found({ q: 'Stilgar' })).toEqual(['Fremen']);
    expect(await found({ q: 'Chani', ruleset: 'classic' })).toEqual([]);
    expect(await names({ q: '   ' })).toEqual(['Atreides', 'Fremen', 'Harkonnen', 'House Atreides Remnant']);
  });

  test('orders by every sort, breaking ties by creation order, with undated factions last', async () => {
    const { names, page, seeded } = await catalogueWith([
      { name: 'beta', created: '2026-07-20T00:00:00.000Z', updated: '2026-07-22T00:00:00.000Z', complexity: 0.5 },
      { name: 'Broken', created: 'not-a-date', updated: 'not-a-date', complexity: 0.1 },
      { name: 'Alpha', created: '2026-07-20T00:00:00.000Z', updated: '2026-07-25T00:00:00.000Z', complexity: 0.5 },
      { name: 'Newest', created: '2026-07-21T00:00:00.000Z', updated: '2026-07-21T00:00:00.000Z', complexity: 0.9 },
      { name: 'Twin', created: '2026-07-01T00:00:00.000Z', complexity: 0.5 },
      { name: 'Twin', created: '2026-07-01T00:00:00.000Z', complexity: 0.5 },
    ]);
    const [twinA, twinB] = [seeded.factionIds[4]!, seeded.factionIds[5]!];

    expect(await names()).toEqual(['Alpha', 'beta', 'Broken', 'Newest', 'Twin', 'Twin']);
    expect(await names({ sort: 'created' })).toEqual(['Newest', 'Alpha', 'beta', 'Twin', 'Twin', 'Broken']);
    expect(await names({ sort: 'updated' })).toEqual(['Alpha', 'beta', 'Newest', 'Twin', 'Twin', 'Broken']);
    expect(await names({ sort: 'complexity-asc' })).toEqual(['Broken', 'beta', 'Alpha', 'Twin', 'Twin', 'Newest']);
    expect(await names({ sort: 'complexity-desc' })).toEqual(['Newest', 'Twin', 'Twin', 'Alpha', 'beta', 'Broken']);
    /* A name order runs oldest first among equals; a newest-first or descending order runs newest first. */
    for (const sort of FACTION_CATALOGUE_SORTS) {
      const twins = (await page({ sort })).cards.filter((card) => card.data.name === 'Twin').map((card) => card._id);
      expect(twins).toEqual(sort === 'name' || sort === 'complexity-asc' ? [twinA, twinB] : [twinB, twinA]);
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
  }, 60_000);

  test('pages every filtered list exactly once, from the aggregate or from the bounded read', async () => {
    const count = FACTION_CATALOGUE_PAGE_SIZE * 2 + 3;
    const factions = Array.from({ length: count }, (_, index) => ({
      name: `Faction ${String(index).padStart(2, '0')}`,
      complexity: (index % 11) / 10,
      rulesets: index % 2 === 0 ? ['classic'] : [],
      leaders: [index % 3 === 0 ? 'Shaddam' : 'Irulan'],
    }));
    const { page, seeded } = await catalogueWith(factions, [{ slug: 'classic', name: 'Classic' }]);
    const idsWhere = (keep: (index: number) => boolean) => new Set(seeded.factionIds.filter((_, index) => keep(index)));

    const range = (low: number, high: number) => (index: number) => index % 11 >= low && index % 11 <= high;
    /* Every case spans more than one page, so page N is read from the aggregate's offset and from the in-memory slice alike. */
    const cases: [CatalogueArgs, Set<string>][] = [
      [{ ruleset: 'classic' }, idsWhere((index) => index % 2 === 0)],
      [{ ruleset: 'classic', sort: 'updated' }, idsWhere((index) => index % 2 === 0)],
      /* The complexity sort counts a score range in the aggregate; any other sort reads the range and pages it in memory. */
      [{ complexity: '0-6', sort: 'complexity-asc' }, idsWhere(range(0, 6))],
      [{ complexity: '2-9', sort: 'complexity-desc' }, idsWhere(range(2, 9))],
      [{ complexity: '0-6' }, idsWhere(range(0, 6))],
      [{ complexity: '1-8', sort: 'created' }, idsWhere(range(1, 8))],
    ];
    for (const [args, expected] of cases) {
      expect(expected.size).toBeGreaterThan(FACTION_CATALOGUE_PAGE_SIZE);
      const ids = await allPages(page, args);
      expect(ids).toHaveLength(expected.size);
      expect(new Set(ids)).toEqual(expected);
      expect(await page(args)).toMatchObject({ total: expected.size, complete: true });
    }
  }, 60_000);

  test('pages names past the Basic Multilingual Plane exactly once, in one order across pages', async () => {
    /* UTF-16 code units and code points order these differently, so a page cut by one order and walked by another would skip or repeat. */
    const marks = ['\u{1F600}', '\uFF5A', 'a', '\u00E9', '\u{10400}', 'Z'];
    const count = FACTION_CATALOGUE_PAGE_SIZE + 4;
    const { page, seeded } = await catalogueWith(
      Array.from({ length: count }, (_, index) => ({ name: `${marks[index % marks.length]} ${index}` }))
    );
    const ids = await allPages(page, { sort: 'name' });
    expect(ids).toHaveLength(count);
    expect(new Set(ids)).toEqual(new Set(seeded.factionIds));
  });

  test('finds the freshly updated faction behind any number of newer, never edited ones', async () => {
    const { page } = await catalogueWith([
      { name: 'Edited', created: '2026-06-01T00:00:00.000Z', updated: '2026-06-15T00:00:00.000Z' },
      ...Array.from({ length: 20 }, (_, index) => ({
        name: `Arrival ${index}`,
        created: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      })),
    ]);
    const { spotlights } = await page();
    expect(spotlights.newArrival?.data.name).toBe('Arrival 19');
    expect(spotlights.freshlyUpdated?.data.name).toBe('Edited');
  });

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

    expect(Object.keys(card ?? {}).sort(compareCodeUnits)).toEqual([
      '_id',
      'created_at',
      'data',
      'rulesets',
      'slug',
      'updated_at',
    ]);
    expect(Object.keys(card?.data ?? {}).sort(compareCodeUnits)).toEqual([
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

    const fine = await t.query(api.factions.catalogue, { q: 'Fine', limit: 24 });
    expect(fine.cards.map((card) => card.data.name)).toEqual(['Fine']);
    await expect(t.query(api.factions.catalogue, {})).rejects.toThrow();
  });

  test('a search with a limit loads more by asking for a larger one, best matches first and only ever appending', async () => {
    const count = FACTION_CATALOGUE_PAGE_SIZE + 3;
    const { page, search } = await catalogueWith(
      Array.from({ length: count }, (_, index) => ({
        name: `Sietch ${String(index).padStart(2, '0')}`,
        complexity: (index % 10) / 10,
        rulesets: index % 2 === 0 ? ['classic'] : [],
      })),
      [{ slug: 'classic', name: 'Classic' }]
    );

    const first = await search({ q: 'sietch', limit: FACTION_CATALOGUE_PAGE_SIZE });
    expect(first).toMatchObject({ mode: 'search', hasMore: true, capped: false, limit: FACTION_CATALOGUE_PAGE_SIZE });
    expect(first.cards).toHaveLength(FACTION_CATALOGUE_PAGE_SIZE);
    expect(first).not.toHaveProperty('total');
    expect(first).not.toHaveProperty('page');
    /* The toolbar still has what it draws: the catalogue's size, each ruleset's count and the spotlights. */
    expect(first.catalogueTotal).toBe(count);
    expect(first.rulesets.map(({ slug, factionCount }) => [slug, factionCount])).toEqual([['classic', 26]]);
    expect(first.spotlights.newArrival?.data.name).toBe('Sietch 50');

    const more = await search({ q: 'sietch', limit: FACTION_CATALOGUE_PAGE_SIZE * 2 });
    expect(more).toMatchObject({ hasMore: false, limit: FACTION_CATALOGUE_PAGE_SIZE * 2 });
    expect(more.cards).toHaveLength(count);
    expect(more.cards.slice(0, FACTION_CATALOGUE_PAGE_SIZE).map((card) => card._id)).toEqual(
      first.cards.map((card) => card._id)
    );
    /* An odd limit is one step; past the ceiling it is the ceiling. */
    expect((await search({ q: 'sietch', limit: 0 })).limit).toBe(FACTION_CATALOGUE_PAGE_SIZE);
    expect((await search({ q: 'sietch', limit: 1e9 })).limit).toBe(FACTION_CATALOGUE_PAGE_SIZE * 10);

    /* The ruleset is the list searched, and the complexity range still narrows it. */
    const classic = await search({ q: 'sietch', ruleset: 'classic', limit: FACTION_CATALOGUE_PAGE_SIZE });
    expect(classic.cards).toHaveLength(26);
    expect(classic.hasMore).toBe(false);
    const ranged = await search({ q: 'sietch', complexity: '0-4', limit: FACTION_CATALOGUE_PAGE_SIZE });
    expect(ranged.cards.map((card) => card.data.name).toSorted()).toEqual(
      Array.from({ length: count }, (_, index) => index)
        .filter((index) => index % 10 <= 4)
        .map((index) => `Sietch ${String(index).padStart(2, '0')}`)
    );
    expect(await search({ q: 'sietch nowhere', limit: FACTION_CATALOGUE_PAGE_SIZE })).toMatchObject({
      cards: [],
      hasMore: false,
      capped: false,
    });
    /* A search without a limit shows one step; a browsed page ignores a limit. */
    expect((await search({ q: 'sietch' })).limit).toBe(FACTION_CATALOGUE_PAGE_SIZE);
    expect(await page({ limit: 5 })).toMatchObject({ page: 1, total: count });
  }, 60_000);
});
