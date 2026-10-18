/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import type { FunctionReturnType } from 'convex/server';
import { describe, expect, test } from 'vite-plus/test';

import { RULESET_CATALOGUE_PAGE_SIZE } from '../src/shared/rulesets/catalogueSearch';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';
import { VALID_ABOUT } from './rulesets.test.fixture';

type Ruleset = { name: string; createdAt?: string; deleted?: boolean; cover?: string | null };

const at = (index: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();

/* Rulesets written through the triggers, as every real write is, so the catalogue's entries follow. */
async function seedRulesets(t: ReturnType<typeof applicationTest>, rulesets: Ruleset[], options = { triggers: true }) {
  return await t.run(async (rawCtx) => {
    const ctx = options.triggers ? applicationTriggers.wrapDB(rawCtx) : rawCtx;
    const ownerId = await ctx.db.insert('users', { name: 'Owner' });
    const ids: Id<'rulesets'>[] = [];
    for (const [index, ruleset] of rulesets.entries()) {
      const createdAt = ruleset.createdAt ?? at(index);
      ids.push(
        await ctx.db.insert('rulesets', {
          name: ruleset.name,
          slug: ruleset.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
          about: VALID_ABOUT,
          created_at: createdAt,
          updated_at: createdAt,
          owner_id: ownerId,
          group_id: null,
          is_deleted: ruleset.deleted ?? false,
          image_cover: ruleset.cover ?? null,
        })
      );
    }
    return ids;
  });
}

const numbered = (count: number): Ruleset[] =>
  Array.from({ length: count }, (_, index) => ({ name: `Ruleset ${String(index + 1).padStart(2, '0')}` }));

const names = (page: { entries: { name: string }[] }) => page.entries.map((entry) => entry.name);

type CatalogueAnswer = FunctionReturnType<typeof api.rulesets.catalogue>;

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

describe('the ruleset catalogue', () => {
  test('pages every live ruleset A to Z, counts them exactly, and leaves deleted ones out', async () => {
    const t = applicationTest();
    const listed = numbered(RULESET_CATALOGUE_PAGE_SIZE + 2);
    await seedRulesets(t, [...listed, { name: 'Gone', deleted: true }, { name: 'Arrakis', cover: '/cover.jpg' }]);

    const first = browsed(await t.query(api.rulesets.catalogue, {}));
    expect(first).toMatchObject({
      total: listed.length + 1,
      rulesetTotal: listed.length + 1,
      complete: true,
      page: 1,
      pageCount: 2,
      pageSize: RULESET_CATALOGUE_PAGE_SIZE,
    });
    expect(names(first)).toEqual([
      'Arrakis',
      ...listed.slice(0, RULESET_CATALOGUE_PAGE_SIZE - 1).map((ruleset) => ruleset.name),
    ]);
    expect(first.entries[0]).toMatchObject({ slug: 'arrakis', coverThumbUrl: '/cover.jpg' });
    expect(first.entries[1]?.coverThumbUrl).toBeNull();
    expect(names(await t.query(api.rulesets.catalogue, { page: 2 }))).toEqual([
      'Ruleset 24',
      'Ruleset 25',
      'Ruleset 26',
    ]);
    /* A page past the end answers with no tiles and the real page count, so the page can say where the rulesets end. */
    expect(await t.query(api.rulesets.catalogue, { page: 3 })).toMatchObject({ entries: [], page: 3, pageCount: 2 });
  });

  test('orders newest first on request', async () => {
    const t = applicationTest();
    await seedRulesets(t, [
      { name: 'Classic', createdAt: at(1) },
      { name: 'Advanced', createdAt: at(3) },
      { name: 'Dreamrules', createdAt: at(2) },
    ]);

    expect(names(await t.query(api.rulesets.catalogue, {}))).toEqual(['Advanced', 'Classic', 'Dreamrules']);
    expect(names(await t.query(api.rulesets.catalogue, { sort: 'newest' }))).toEqual([
      'Advanced',
      'Dreamrules',
      'Classic',
    ]);
  });

  test('a search loads more by asking for a larger limit, best matches first and only ever appending', async () => {
    const t = applicationTest();
    const count = RULESET_CATALOGUE_PAGE_SIZE + 2;
    await seedRulesets(t, [...numbered(count), { name: 'Dreamrules' }]);

    const first = searched(await t.query(api.rulesets.catalogue, { q: 'ruleset', limit: RULESET_CATALOGUE_PAGE_SIZE }));
    expect(first).toMatchObject({
      mode: 'search',
      hasMore: true,
      capped: false,
      limit: RULESET_CATALOGUE_PAGE_SIZE,
      rulesetTotal: count + 1,
    });
    expect(first.entries).toHaveLength(RULESET_CATALOGUE_PAGE_SIZE);
    expect(first).not.toHaveProperty('total');
    expect(first).not.toHaveProperty('page');

    const more = searched(
      await t.query(api.rulesets.catalogue, { q: 'ruleset', limit: RULESET_CATALOGUE_PAGE_SIZE * 2 })
    );
    expect(more).toMatchObject({ hasMore: false, limit: RULESET_CATALOGUE_PAGE_SIZE * 2 });
    expect(more.entries).toHaveLength(count);
    expect(more.entries.slice(0, RULESET_CATALOGUE_PAGE_SIZE).map((entry) => entry.id)).toEqual(
      first.entries.map((entry) => entry.id)
    );
    expect(names(searched(await t.query(api.rulesets.catalogue, { q: 'dream', limit: 24 })))).toEqual(['Dreamrules']);
    /* A search without a limit is the first step, as a loader always asks for one. */
    expect(names(searched(await t.query(api.rulesets.catalogue, { q: 'dream' })))).toEqual(['Dreamrules']);
    expect(searched(await t.query(api.rulesets.catalogue, { q: 'harkonnen' })).entries).toEqual([]);
  });

  test('a search that is blank once cut and trimmed browses instead', async () => {
    const t = applicationTest();
    await seedRulesets(t, [{ name: 'Classic' }]);

    expect(browsed(await t.query(api.rulesets.catalogue, { q: '   ', page: 1 }))).toMatchObject({ total: 1 });
    expect(names(await t.query(api.rulesets.catalogue, { q: '   ', sort: 'newest' }))).toEqual(['Classic']);
  });

  test('follows a rename and a deletion through the triggers, and leaves no drift', async () => {
    const t = applicationTest();
    const [classic] = await seedRulesets(t, [{ name: 'Classic' }, { name: 'Advanced' }]);

    await t.run(async (rawCtx) => {
      await applicationTriggers.wrapDB(rawCtx).db.patch(classic!, { name: 'Zensunni' });
    });
    expect(names(await t.query(api.rulesets.catalogue, { q: 'zensunni' }))).toEqual(['Zensunni']);
    expect(names(await t.query(api.rulesets.catalogue, {}))).toEqual(['Advanced', 'Zensunni']);

    await t.run(async (rawCtx) => {
      await applicationTriggers.wrapDB(rawCtx).db.patch(classic!, { is_deleted: true });
    });
    expect(names(await t.query(api.rulesets.catalogue, {}))).toEqual(['Advanced']);
    expect(browsed(await t.query(api.rulesets.catalogue, {})).total).toBe(1);

    const drift = await t.query(internal.catalogueMaintenance.catalogueDrift, { kind: 'ruleset' });
    expect(drift).toMatchObject({ missing: [], stale: [], duplicated: [], unordered: [], orphaned: [] });
  });

  test('backfills rulesets written before the catalogue existed, and verification refuses a gap', async () => {
    const t = applicationTest();
    const [rulesetId] = await seedRulesets(t, [{ name: 'Old Timer' }], { triggers: false });
    expect(browsed(await t.query(api.rulesets.catalogue, {})).total).toBe(0);

    await t.mutation(internal.catalogueMigrations.catalogue_entries_rulesets_verify_v1, {});
    await t.finishAllScheduledFunctions(() => undefined);
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: ['catalogue_entries_rulesets_verify_v1'] })
    ).rejects.toThrow(/catalogue_entries_rulesets_verify_v1\(failed/);

    await t.mutation(internal.catalogueMigrations.catalogue_entries_rulesets_v1, {});
    await t.mutation(internal.catalogueMigrations.catalogue_entries_rulesets_verify_v1, {});
    await t.finishAllScheduledFunctions(() => undefined);
    expect((await t.query(api.rulesets.catalogue, {})).entries.map((entry) => entry.id)).toEqual([rulesetId]);
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, {
        required: ['catalogue_entries_rulesets_v1', 'catalogue_entries_rulesets_verify_v1'],
      })
    ).resolves.toMatchObject({ ok: true });
  });

  test('the index page before the catalogue still answers, for the bundle deployed before this one', async () => {
    const t = applicationTest();
    await seedRulesets(t, [{ name: 'Classic' }, { name: 'Gone', deleted: true }]);
    expect((await t.query(api.rulesets.list, {})).map((row) => row.name)).toEqual(['Classic']);
  });
});
