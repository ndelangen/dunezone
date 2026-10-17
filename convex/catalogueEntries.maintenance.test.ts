/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { compareCodeUnits } from '../src/shared/compareText';
import { api, internal } from './_generated/api';
import { catalogueFactionData, CATALOGUE_STAMP } from './factions.catalogue.test.fixture';
import { factionAuthor, factionTest } from './factions.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

const noDrift = { missing: [], stale: [], duplicated: [], unordered: [], orphaned: [] };

async function world() {
  const t = factionTest();
  const author = await factionAuthor(t, 'Catalogue author');
  const ownerId = await t.run(async (ctx) => (await ctx.db.query('users').first())!._id);
  const rulesetIds = await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const ruleset = (slug: string) =>
      ctx.db.insert('rulesets', {
        name: slug,
        about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
        slug,
        created_at: CATALOGUE_STAMP,
        updated_at: CATALOGUE_STAMP,
        owner_id: ownerId,
        group_id: null,
        is_deleted: false,
        image_cover: null,
      });
    return { classic: await ruleset('classic'), advanced: await ruleset('advanced') };
  });
  const entries = () => t.run((ctx) => ctx.db.query('catalogue_entries').collect());
  const drift = () => t.query(internal.catalogueMaintenance.catalogueDrift, { kind: 'faction' });
  const names = async (args = {}) => (await t.query(api.factions.catalogue, args)).cards.map((card) => card.data.name);
  return { t, author, rulesetIds, entries, drift, names };
}

describe('catalogue entry maintenance', () => {
  test('every faction and link writer keeps the faction catalogue exact', async () => {
    const { t, author, rulesetIds, entries, drift, names } = await world();

    const created = await author.mutation(api.factions.create, {
      data: catalogueFactionData({ name: 'Atreides', factionLeader: 'Duke Leto' }),
    });
    expect(await entries()).toMatchObject([
      {
        kind: 'faction',
        source_id: created._id,
        name_key: 'atreides',
        search_text: expect.stringContaining('Duke Leto'),
      },
    ]);
    expect(await drift()).toMatchObject(noDrift);

    await author.mutation(api.factions.update, {
      id: created._id,
      data: { ...created.data, name: 'House Atreides' },
    });
    expect(await names({ q: 'House' })).toEqual(['House Atreides']);
    expect(await drift()).toMatchObject(noDrift);

    await author.mutation(api.rulesets.addFaction, { ruleset_id: rulesetIds.classic, faction_id: created._id });
    await author.mutation(api.rulesets.addFaction, { ruleset_id: rulesetIds.advanced, faction_id: created._id });
    expect((await entries())[0]?.facets).toEqual([rulesetIds.classic, rulesetIds.advanced].sort(compareCodeUnits));
    expect(await names({ ruleset: 'classic' })).toEqual(['House Atreides']);

    await author.mutation(api.rulesets.removeFaction, { ruleset_id: rulesetIds.classic, faction_id: created._id });
    expect((await entries())[0]?.facets).toEqual([rulesetIds.advanced]);
    expect(await names({ ruleset: 'classic' })).toEqual([]);
    expect(await drift()).toMatchObject(noDrift);

    /* A deleted ruleset leaves the entry as it is and drops out of the cards and the filters when the catalogue is read. */
    await author.mutation(api.rulesets.softDelete, { id: rulesetIds.advanced });
    const afterRulesetDelete = await t.query(api.factions.catalogue, {});
    expect(afterRulesetDelete.cards[0]?.rulesets).toEqual([]);
    expect(afterRulesetDelete.rulesets.map((ruleset) => ruleset.slug)).toEqual(['classic']);
    expect(await drift()).toMatchObject(noDrift);

    await author.mutation(api.factions.setGroup, { id: created._id, group_id: null });
    expect(await drift()).toMatchObject(noDrift);

    await author.mutation(api.factions.softDelete, { id: created._id });
    expect(await entries()).toEqual([]);
    expect(await t.query(api.factions.catalogue, {})).toMatchObject({ catalogueTotal: 0, cards: [] });
    expect(await drift()).toMatchObject(noDrift);
  });

  test('a hard delete, a restore and a legacy blob each leave one exact entry or none', async () => {
    const { t, entries, drift } = await world();
    const factionId = await t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      const ownerId = await ctx.db.insert('users', { name: 'Raw owner' });
      return await ctx.db.insert('factions', {
        owner_id: ownerId,
        /* A blob the full read refuses still lists under its raw name, and its write succeeds. */
        data: { name: 'Legacy' },
        slug: 'legacy',
        created_at: 'not-a-date',
        updated_at: CATALOGUE_STAMP,
        is_deleted: true,
        group_id: null,
      });
    });
    expect(await entries()).toEqual([]);

    await t.run((rawCtx) => applicationTriggers.wrapDB(rawCtx).db.patch(factionId, { is_deleted: false }));
    expect(await entries()).toMatchObject([{ name_key: 'legacy', created_at: 0, complexity: 0 }]);
    expect(await drift()).toMatchObject(noDrift);

    await t.run((rawCtx) => applicationTriggers.wrapDB(rawCtx).db.delete(factionId));
    expect(await entries()).toEqual([]);
    expect(await drift()).toMatchObject(noDrift);
  });

  test('the backfill restores order items a raw write left out, and the prune drops ones a raw delete left behind', async () => {
    const { t, author, drift, names } = await world();
    const fremen = await author.mutation(api.factions.create, { data: catalogueFactionData({ name: 'Fremen' }) });
    await author.mutation(api.factions.create, { data: catalogueFactionData({ name: 'Atreides' }) });

    /* A raw copy of an entry has no aggregate items; a raw delete of the original leaves its items behind. */
    await t.run(async (ctx) => {
      const entry = (await ctx.db.query('catalogue_entries').collect()).find((row) => row.source_id === fremen._id)!;
      const { _id, _creationTime, ...fields } = entry;
      await ctx.db.delete(_id);
      await ctx.db.insert('catalogue_entries', fields);
    });
    expect((await drift()).unordered).toEqual([fremen._id]);

    await t.mutation(internal.migrations.catalogue_entries_factions_v1, {});
    await t.finishAllScheduledFunctions(() => undefined);
    expect(await drift()).toMatchObject(noDrift);
    /* The ghost of the deleted original still counts until the prune runs. */
    expect((await t.query(api.factions.catalogue, {})).catalogueTotal).toBe(3);

    await t.mutation(internal.catalogueMaintenance.catalogue_order_prune, {});
    await t.finishAllScheduledFunctions(() => undefined);
    expect(await t.query(api.factions.catalogue, {})).toMatchObject({ catalogueTotal: 2, total: 2 });
    expect(await names()).toEqual(['Atreides', 'Fremen']);
  });
});
