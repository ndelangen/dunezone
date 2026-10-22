/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { compareCodeUnits } from '../src/shared/compareText';
import { api, internal } from './_generated/api';
import { catalogueFactionData, CATALOGUE_STAMP } from './factions.catalogue.test.fixture';
import { factionAuthor, factionTest } from './factions.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';
import { factionOwnerPartition } from './lib/factionCatalogue';

const noDrift = { missing: [], stale: [], duplicated: [], unordered: [], orphaned: [], overcounted: [] };

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
  /* The faction entries alone: the rulesets seeded above have entries of their own kind, which this suite is not about. */
  const entries = () =>
    t.run(async (ctx) => (await ctx.db.query('catalogue_entries').collect()).filter((row) => row.kind === 'faction'));
  const drift = () => t.query(internal.catalogueMaintenance.catalogueDrift, { kind: 'faction' });
  const names = async (args = {}) => (await t.query(api.factions.catalogue, args)).cards.map((card) => card.data.name);
  return { t, author, ownerId, rulesetIds, entries, drift, names };
}

describe('catalogue entry maintenance', () => {
  test('every faction and link writer keeps the faction catalogue exact', async () => {
    const { t, author, ownerId, rulesetIds, entries, drift, names } = await world();

    const created = await author.mutation(api.factions.create, {
      data: catalogueFactionData({ name: 'Atreides', factionLeader: 'Duke Leto' }),
    });
    /* One row per list: the whole catalogue's and the owner's. */
    const listed = {
      kind: 'faction',
      source_id: created._id,
      name_key: 'atreides',
      search_text: expect.stringContaining('Duke Leto'),
    };
    expect(await entries()).toMatchObject([
      { ...listed, partition: 'all' },
      { ...listed, partition: factionOwnerPartition(ownerId) },
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
    expect((await entries())[0]?.facets).toEqual([
      ...[rulesetIds.classic, rulesetIds.advanced].sort(compareCodeUnits),
      factionOwnerPartition(ownerId),
    ]);
    expect(await names({ ruleset: 'classic' })).toEqual(['House Atreides']);

    await author.mutation(api.rulesets.removeFaction, { ruleset_id: rulesetIds.classic, faction_id: created._id });
    expect((await entries())[0]?.facets).toEqual([rulesetIds.advanced, factionOwnerPartition(ownerId)]);
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
    const { factionId, rawOwnerId } = await t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      const rawOwnerId = await ctx.db.insert('users', { name: 'Raw owner' });
      const factionId = await ctx.db.insert('factions', {
        owner_id: rawOwnerId,
        /* A blob the full read refuses still lists under its raw name, and its write succeeds. */
        data: { name: 'Legacy' },
        slug: 'legacy',
        created_at: 'not-a-date',
        updated_at: CATALOGUE_STAMP,
        is_deleted: true,
        group_id: null,
      });
      return { factionId, rawOwnerId };
    });
    expect(await entries()).toEqual([]);

    await t.run((rawCtx) => applicationTriggers.wrapDB(rawCtx).db.patch(factionId, { is_deleted: false }));
    const legacy = { name_key: 'legacy', created_at: 0, complexity: 0 };
    expect(await entries()).toMatchObject([
      { ...legacy, partition: 'all' },
      { ...legacy, partition: factionOwnerPartition(rawOwnerId) },
    ]);
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
    /* The ghost of the deleted original still counts until the prune runs, and the drift report says so. */
    expect(await drift()).toMatchObject({ ...noDrift, overcounted: ['name', 'created', 'updated', 'complexity'] });
    expect((await t.query(api.factions.catalogue, {})).catalogueTotal).toBe(3);

    await t.mutation(internal.catalogueMaintenance.catalogue_order_prune, {});
    await t.finishAllScheduledFunctions(() => undefined);
    expect(await t.query(api.factions.catalogue, {})).toMatchObject({ catalogueTotal: 2, total: 2 });
    expect(await names()).toEqual(['Atreides', 'Fremen']);
    expect(await drift()).toMatchObject(noDrift);
  });

  test('the owner backfill lists factions written before the owner facet existed, replays without a write, and its verification refuses a gap', async () => {
    const { t, author, ownerId, entries, drift } = await world();
    const created = await author.mutation(api.factions.create, { data: catalogueFactionData({ name: 'Fremen' }) });
    /* Production before this release: the faction's `'all'` row alone, as the faction backfill of that time wrote it. */
    await t.run(async (ctx) => {
      for (const entry of await ctx.db.query('catalogue_entries').collect()) {
        if (entry.partition === 'all') {
          await ctx.db.replace(entry._id, { ...entryFields(entry), facets: [] });
        } else {
          await ctx.db.delete(entry._id);
        }
      }
    });
    expect(await drift()).toMatchObject({ ...noDrift, stale: [created._id], missing: [created._id] });

    await t.mutation(internal.catalogueMigrations.catalogue_entries_factions_owner_verify_v1, {});
    await t.finishAllScheduledFunctions(() => undefined);
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: ['catalogue_entries_factions_owner_verify_v1'] })
    ).rejects.toThrow(/catalogue_entries_factions_owner_verify_v1\(failed/);

    await t.mutation(internal.catalogueMigrations.catalogue_entries_factions_owner_v1, {});
    await t.mutation(internal.catalogueMigrations.catalogue_entries_factions_owner_verify_v1, {});
    await t.finishAllScheduledFunctions(() => undefined);
    expect((await entries()).map((entry) => entry.partition)).toEqual(['all', factionOwnerPartition(ownerId)]);
    expect(await drift()).toMatchObject(noDrift);
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, {
        required: ['catalogue_entries_factions_owner_v1', 'catalogue_entries_factions_owner_verify_v1'],
      })
    ).resolves.toMatchObject({ ok: true });

    /* A replay over exact rows writes nothing: the rows keep their ids and their creation times. */
    const before = await entries();
    await t.mutation(internal.catalogueMigrations.catalogue_entries_factions_owner_v1, {});
    await t.finishAllScheduledFunctions(() => undefined);
    expect(await entries()).toEqual(before);
  });
});

/** An entry's own fields, as a raw write of the row takes them. */
function entryFields({ _id, _creationTime, ...fields }: Awaited<ReturnType<typeof entriesOf>>[number]) {
  return fields;
}

/** The type of one stored entry, for the raw write above. */
async function entriesOf(t: ReturnType<typeof factionTest>) {
  return await t.run((ctx) => ctx.db.query('catalogue_entries').collect());
}
