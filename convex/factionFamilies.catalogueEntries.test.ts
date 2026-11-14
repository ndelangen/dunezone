/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { variantsFixture } from './factionVariants.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';
import { factionOwnerPartition } from './lib/factionCatalogue';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function familyFixture() {
  const fixture = await variantsFixture();
  const { t } = fixture;
  const familyEntries = (familyId: Id<'faction_families'>) =>
    t.run(
      async (ctx) =>
        await ctx.db
          .query('catalogue_entries')
          .withIndex('by_kind_source', (q) => q.eq('kind', 'faction_family').eq('source_id', familyId))
          .collect()
    );
  const listed = async (familyId: Id<'faction_families'>, partition = 'all') =>
    (await familyEntries(familyId)).find((entry) => entry.partition === partition);
  /** Links a variant to a new ruleset through the triggers, as the ruleset editor does. */
  const link = (factionId: Id<'factions'>, rulesetId: Id<'rulesets'>) =>
    t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      await ctx.db.insert('ruleset_factions', { ruleset_id: rulesetId, faction_id: factionId, position: 0 });
    });
  const linkRuleset = (factionId: Id<'factions'>, name: string) =>
    t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      const ownerId = (await ctx.db.get(factionId))!.owner_id;
      const rulesetId = await ctx.db.insert('rulesets', {
        name,
        slug: name.toLowerCase().replaceAll(' ', '-'),
        about: '',
        created_at: '2026-11-13T00:00:00.000Z',
        updated_at: '2026-11-13T00:00:00.000Z',
        owner_id: ownerId,
        group_id: null,
        is_deleted: false,
        image_cover: null,
      });
      await ctx.db.insert('ruleset_factions', { ruleset_id: rulesetId, faction_id: factionId, position: 0 });
      return rulesetId;
    });
  return { ...fixture, familyEntries, listed, link, linkRuleset };
}

describe('one catalogue entry per faction (#2929)', () => {
  test('a faction with three variants is listed once, counting three, drawn from its default', async () => {
    const { root, addVariant, familyId, listed, familyEntries } = await familyFixture();
    await addVariant('Second');
    await addVariant('Third');

    const entry = await listed(familyId);
    expect(entry).toMatchObject({ slug: 'atreides', variant_count: 3, card_source_id: root._id });
    expect(entry!.search_text.split('\n')).toEqual(expect.arrayContaining(['Second', 'Third']));
    expect((await familyEntries(familyId)).filter((row) => row.partition === 'all')).toHaveLength(1);
  });

  test('on a ruleset’s list the faction opens the first variant linked to that ruleset', async () => {
    const { owner, addVariant, familyId, listed, link, linkRuleset } = await familyFixture();
    const second = await addVariant('Second');
    const third = await addVariant('Third');
    const house = await linkRuleset(second.id, 'House rules');
    await linkRuleset(third.id, 'Other rules');

    expect((await listed(familyId, house))?.slug).toBe(second.slug);
    expect((await listed(familyId))?.slug).toBe('atreides');

    /* Once two variants are linked, the order its maintainers gave decides which one the list opens. */
    await link(third.id, house);
    expect((await listed(familyId, house))?.slug).toBe(second.slug);
    await owner.mutation(api.factionFamilies.setVariantOrder, {
      family_id: familyId,
      variant_ids: [third.id, second.id],
    });
    expect((await listed(familyId, house))?.slug).toBe(third.slug);
  });

  test('a member who owns only a variant finds the faction in their own list', async () => {
    const { t, owner, stranger, root, familyId, listed } = await familyFixture();
    await owner.mutation(api.factionFamilies.setOpen, { family_id: familyId, is_open: true });
    await stranger.mutation(api.factionVariants.create, { faction_id: root._id, name: 'Guest', group_id: null });
    const strangerId = await t.run(
      async (ctx) => (await ctx.db.query('users').collect()).find((user) => user.name === 'Stranger')!._id
    );

    expect(await listed(familyId, factionOwnerPartition(strangerId))).toMatchObject({ variant_count: 2 });
  });

  test('a new variant updates its faction and is never a new arrival; an evicted one is a new faction', async () => {
    const { owner, addVariant, familyId, listed } = await familyFixture();
    const before = (await listed(familyId))!;
    vi.setSystemTime(Date.now() + 60_000);
    const leaving = await addVariant('Leaving');

    const after = (await listed(familyId))!;
    expect(after.created_at).toBe(before.created_at);
    expect(after.edited_at).toBeGreaterThan(before.created_at);

    vi.setSystemTime(Date.now() + 60_000);
    const { family_id: newFamilyId } = await owner.mutation(api.factionVariants.evict, { faction_id: leaving.id });
    expect((await listed(familyId))?.variant_count).toBe(1);
    expect((await listed(newFamilyId))!.created_at).toBeGreaterThan(after.created_at);
  });

  test('a new default or order rewrites the entry, and a faction whose variants are all gone is unlisted', async () => {
    const { owner, root, addVariant, familyId, listed, familyEntries } = await familyFixture();
    const second = await addVariant('Second');
    await owner.mutation(api.factionFamilies.setDefaultVariant, { family_id: familyId, variant_id: second.id });
    expect((await listed(familyId))?.card_source_id).toBe(second.id);

    await owner.mutation(api.factions.softDelete, { id: second.id });
    expect(await listed(familyId)).toMatchObject({ card_source_id: root._id, variant_count: 1 });
    await owner.mutation(api.factions.softDelete, { id: root._id });
    expect(await familyEntries(familyId)).toEqual([]);
  });

  test('the backfill lists factions written before this kind existed, and its check then passes', async () => {
    const { t, familyId, listed } = await familyFixture();
    await t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      for (const entry of await ctx.db
        .query('catalogue_entries')
        .withIndex('by_kind_source', (q) => q.eq('kind', 'faction_family'))
        .collect()) {
        await ctx.db.delete(entry._id);
      }
    });
    const ready = () =>
      t.query(internal.migrations.assertReadyForNarrow, {
        required: ['catalogue_entries_faction_families_verify_v1'],
      });
    await t.mutation(internal.catalogueMigrations.catalogue_entries_faction_families_verify_v1, {});
    await t.finishAllScheduledFunctions(() => undefined);
    await expect(ready()).rejects.toThrow(/catalogue_entries_faction_families_verify_v1\(failed/);

    await t.mutation(internal.catalogueMigrations.catalogue_entries_faction_families_v1, {});
    await t.mutation(internal.catalogueMigrations.catalogue_entries_faction_families_verify_v1, {});
    await t.finishAllScheduledFunctions(() => undefined);
    await expect(ready()).resolves.toMatchObject({ ok: true });
    expect((await listed(familyId))?.variant_count).toBe(1);
  });
});
