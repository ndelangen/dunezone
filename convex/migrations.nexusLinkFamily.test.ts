/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { describe, expect, test } from 'vite-plus/test';

import { GF9_NEXUS_CARDS } from '../src/shared/assets/gf9Nexus';
import { api, internal } from './_generated/api';
import { variantsFixture } from './factionVariants.test.fixture';

/** Nexus cards as they were saved before #2921: each links one variant, written past the writer, which now stores a Faction. */
async function savedBeforeFactionLinks() {
  const f = await variantsFixture();
  migrationsTest.register(f.t);
  const dreamrules = await f.addVariant('Dreamrules');
  const retired = await f.addVariant('Retired');
  const card = async (name: string, factionLink?: { id: string; slug: unknown }) => {
    const created = await f.owner.mutation(api.assets.create, {
      type: 'card-nexus',
      data: { ...GF9_NEXUS_CARDS[0]!, name, factionLink: { id: f.familyId, slug: 'atreides' } },
    });
    if (factionLink) {
      await f.t.run(async (ctx) => {
        const row = (await ctx.db.get('assets', created.id))!;
        await ctx.db.patch('assets', created.id, { data: { ...row.data, factionLink } });
      });
    }
    return created.id;
  };
  const ids = {
    variant: await card('Variant nexus', { id: dreamrules.id, slug: dreamrules.slug }),
    defaultVariant: await card('Default nexus', { id: f.root._id, slug: 'atreides-classic' }),
    deletedVariant: await card('Deleted variant nexus', { id: retired.id, slug: retired.slug }),
    unreadableSlug: await card('Unreadable nexus', { id: dreamrules.id, slug: 42 }),
    faction: await card('Faction nexus'),
  };
  await f.owner.mutation(api.factions.softDelete, { id: retired.id });
  /* Every write above queued a publication; the move must queue none. */
  await f.t.run(async (ctx) => {
    for (const job of await ctx.db.query('publication_jobs').collect()) {
      await ctx.db.delete(job._id);
    }
  });
  const rows = () =>
    f.t.run(async (ctx) =>
      Object.fromEntries(
        await Promise.all(Object.entries(ids).map(async ([key, id]) => [key, (await ctx.db.get('assets', id))!]))
      )
    );
  const migrate = () => f.t.mutation(internal.nexusLinkMigrations.nexus_link_family_v1, {});
  const verify = async () => {
    await f.t.mutation(internal.nexusLinkMigrations.nexus_link_family_verify_v1, { reset: true });
    return await f.t.query(internal.migrations.verifyMigration, { id: 'nexus_link_family_verify_v1' });
  };
  return { ...f, ids, dreamrules, retired, rows, migrate, verify };
}

describe('moving Nexus card links from a variant to its Faction (#2921)', () => {
  test('rewrites only the link of each card whose variant lives, and a replay changes nothing', async () => {
    const f = await savedBeforeFactionLinks();
    const before = await f.rows();
    await f.migrate();
    const after = await f.rows();

    const familyLink = { id: f.familyId, slug: 'atreides' };
    for (const key of ['variant', 'defaultVariant'] as const) {
      expect(after[key]).toEqual({ ...before[key], data: { ...before[key].data, factionLink: familyLink } });
    }
    for (const key of ['deletedVariant', 'unreadableSlug', 'faction'] as const) {
      expect(after[key]).toEqual(before[key]);
    }
    expect(await f.t.run((ctx) => ctx.db.query('publication_jobs').collect())).toEqual([]);

    await f.migrate();
    expect(await f.rows()).toEqual(after);
  });

  test('the check fails while a card could still move, passes after the move, and the cards left behind are listed', async () => {
    const f = await savedBeforeFactionLinks();
    expect(await f.verify()).toMatchObject({
      complete: false,
      state: 'failed',
      error: `Nexus card ${f.ids.variant} still links a variant of a live Faction.`,
    });
    await f.migrate();
    expect(await f.verify()).toMatchObject({ complete: true, state: 'success' });
    expect(await f.t.query(internal.nexusLinkMigrations.unmovedNexusLinks, {})).toEqual({
      scanned: 5,
      truncated: false,
      unmoved: [
        { assetId: f.ids.deletedVariant, slug: 'deleted-variant-nexus', variantId: f.retired.id },
        { assetId: f.ids.unreadableSlug, slug: 'unreadable-nexus', variantId: f.dreamrules.id },
      ],
    });
  });
});

test('the clear step empties the undo records the move left', async () => {
  const f = await savedBeforeFactionLinks();
  const record = { asset_id: f.ids.variant, variant_id: f.dreamrules.id, variant_slug: 'x', family_id: f.familyId };
  await f.t.run(async (ctx) => {
    await ctx.db.insert('nexus_link_moves', record);
    await ctx.db.insert('nexus_link_moves', record);
  });

  await f.t.mutation(internal.nexusLinkMigrations.nexus_link_moves_clear_v1, {});

  expect(await f.t.run((ctx) => ctx.db.query('nexus_link_moves').collect())).toEqual([]);
});
