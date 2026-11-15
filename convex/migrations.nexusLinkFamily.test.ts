/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { describe, expect, test } from 'vite-plus/test';

import { GF9_NEXUS_CARDS } from '../src/shared/assets/gf9Nexus';
import { contentImportPackageSchema } from '../src/shared/contentImports/package';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { retargetAssetReceipts } from './contentImports';
import { variantsFixture } from './factionVariants.test.fixture';
import { rulebookFixture } from './rulebooks.test.fixture';

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
  const moves = () =>
    f.t.run(async (ctx) =>
      (await ctx.db.query('nexus_link_moves').collect()).map(({ _id, _creationTime, ...move }) => move)
    );
  const migrate = () => f.t.mutation(internal.nexusLinkMigrations.nexus_link_family_v1, {});
  const verify = async () => {
    await f.t.mutation(internal.nexusLinkMigrations.nexus_link_family_verify_v1, { reset: true });
    return await f.t.query(internal.migrations.verifyMigration, { id: 'nexus_link_family_verify_v1' });
  };
  const undo = () => f.t.mutation(internal.nexusLinkMigrations.undoNexusLinkMoves, { cursor: null });
  return { ...f, ids, dreamrules, retired, rows, moves, migrate, verify, undo };
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
    expect(await f.moves()).toEqual([
      { asset_id: f.ids.variant, variant_id: f.dreamrules.id, variant_slug: f.dreamrules.slug, family_id: f.familyId },
      {
        asset_id: f.ids.defaultVariant,
        variant_id: f.root._id,
        variant_slug: 'atreides-classic',
        family_id: f.familyId,
      },
    ]);

    await f.migrate();
    expect(await f.rows()).toEqual(after);
    expect(await f.moves()).toHaveLength(2);
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

  test('the undo restores a card only while it links its Faction and its variant lives, and keeps every other record', async () => {
    const f = await savedBeforeFactionLinks();
    const before = await f.rows();
    await f.migrate();
    const moved = await f.rows();
    const recorded = await f.moves();
    const relink = (factionLink: unknown) =>
      f.t.run(async (ctx) => {
        const row = (await ctx.db.get('assets', f.ids.defaultVariant as Id<'assets'>))!;
        await ctx.db.patch('assets', row._id, { data: { ...row.data, factionLink } });
      });
    await relink({ id: 'elsewhere', slug: 'elsewhere' });
    await f.owner.mutation(api.factions.softDelete, { id: f.dreamrules.id });
    const skipped = await f.rows();

    expect(await f.undo()).toEqual({ restored: 0, kept: 2 });
    expect(await f.rows()).toEqual(skipped);
    expect(await f.moves()).toEqual(recorded);

    await relink(moved.defaultVariant.data.factionLink);
    expect(await f.undo()).toEqual({ restored: 1, kept: 1 });
    expect((await f.rows()).defaultVariant.data).toEqual(before.defaultVariant.data);
    expect(await f.moves()).toEqual([recorded[0]]);
  });
});

describe('the import receipts of moved Nexus cards', () => {
  /*
   * Three imported cards as an import before #2921 left them: linked to the variant, each receipt recording that state.
   * One is then edited by hand and one deleted, both after their import.
   */
  async function receiptedCards() {
    const { t, owner } = await rulebookFixture();
    migrationsTest.register(t);
    const target = { rulesetSlug: 'rulebook-test-rules', groupSlug: 'rulebook-authors' };
    const nexus = (key: string) => ({
      key,
      kind: 'asset',
      type: 'card-nexus',
      data: { ...GF9_NEXUS_CARDS[0], name: `Nexus ${key}`, factionLink: { id: 'replace-me', slug: 'replace-me' } },
      bindings: [
        { path: ['factionLink', 'id'], key: 'atreides', field: 'id' },
        { path: ['factionLink', 'slug'], key: 'atreides', field: 'slug' },
      ],
    });
    const bundle = contentImportPackageSchema.parse({
      format: 'dunezone-package',
      version: 1,
      packageKey: 'test-package',
      items: [
        { key: 'atreides', kind: 'faction', data: assetPublishingFaction },
        nexus('clean'),
        nexus('edited'),
        nexus('deleted'),
      ],
    });
    const applied = [];
    for (const item of bundle.items) {
      applied.push(
        await owner.mutation(api.contentImports.applyItem, {
          packageKey: bundle.packageKey,
          item,
          target,
          expectedHash: null,
        })
      );
    }
    const faction = applied[0]!;
    const [clean, edited, deleted] = applied.slice(1).map((card) => card.id as Id<'assets'>) as [
      Id<'assets'>,
      Id<'assets'>,
      Id<'assets'>,
    ];
    await t.run(async (ctx) => {
      for (const id of [clean, edited, deleted]) {
        const row = (await ctx.db.get('assets', id))!;
        await ctx.db.patch('assets', id, {
          data: { ...row.data, factionLink: { id: faction.id, slug: faction.slug } },
        });
      }
      await retargetAssetReceipts(ctx, new Map(), [clean, edited, deleted], false);
      const row = (await ctx.db.get('assets', edited))!;
      await ctx.db.patch('assets', edited, { data: { ...row.data, cunning: 'Changed by hand.' } });
      await ctx.db.patch('assets', deleted, { is_deleted: true });
    });
    const statuses = async () =>
      (await owner.mutation(api.contentImports.preview, { package: bundle, target })).entries
        .slice(1, 3)
        .map((entry) => entry.status);
    const deletedReceipt = () =>
      t.run(async (ctx) =>
        (await ctx.db.query('content_import_receipts').collect()).find((receipt) => receipt.subject_id === deleted)
      );
    return { t, statuses, deletedReceipt, clean };
  }

  test('follow a moved card only where they recorded it as it was, and a deleted card keeps its own', async () => {
    const { t, statuses, deletedReceipt } = await receiptedCards();
    expect(await statuses()).toEqual(['update', 'conflict']);
    const receiptOfDeleted = await deletedReceipt();
    expect(receiptOfDeleted).toBeDefined();

    await t.mutation(internal.nexusLinkMigrations.nexus_link_family_v1, {});
    expect(await t.run((ctx) => ctx.db.query('nexus_link_moves').collect())).toHaveLength(3);
    expect(await statuses()).toEqual(['conflict', 'conflict']);
    await t.mutation(internal.nexusLinkMigrations.nexus_link_family_v1_receipts, {});
    expect(await t.query(internal.migrations.verifyMigration, { id: 'nexus_link_family_v1_receipts' })).toMatchObject({
      complete: true,
      state: 'success',
    });
    expect(await statuses()).toEqual(['update', 'conflict']);
    expect(await deletedReceipt()).toEqual(receiptOfDeleted);

    await t.mutation(internal.nexusLinkMigrations.undoNexusLinkMoves, { cursor: null });
    expect(await statuses()).toEqual(['update', 'conflict']);
    expect(await deletedReceipt()).toEqual(receiptOfDeleted);
  });

  test.each([
    { to: 'another Faction', relink: () => ({ id: 'elsewhere', slug: 'elsewhere' }) },
    { to: 'a new slug', relink: (link: { id: string }) => ({ id: link.id, slug: 'renamed' }) },
  ])('stay put for a card relinked to $to between the move and the receipts step', async ({ relink }) => {
    const { t, statuses, clean } = await receiptedCards();
    await t.mutation(internal.nexusLinkMigrations.nexus_link_family_v1, {});
    await t.run(async (ctx) => {
      const row = (await ctx.db.get('assets', clean))!;
      await ctx.db.patch('assets', clean, {
        data: { ...row.data, factionLink: relink(row.data.factionLink) },
      });
    });
    await t.mutation(internal.nexusLinkMigrations.nexus_link_family_v1_receipts, {});
    expect(await statuses()).toEqual(['conflict', 'conflict']);
  });
});
