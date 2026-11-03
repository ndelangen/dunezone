/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { describe, expect, test } from 'vite-plus/test';

import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import { api, internal } from './_generated/api';
import { insertStoredFactions, factionTest, storedFactionData } from './factions.test.fixture';
import { rulebookDraftContentsHash, rulebookEditionContentsHash } from './lib/rulebookEditionContents';
import { rulebookFixture } from './rulebooks.test.fixture';

const background = { gradient: { type: 'linear', angle: 0, stops: [] } };

describe('Emblem rename migration', () => {
  test('renames `logo` to `emblem` and moves stock paths, keeping every other field and the edit timestamp', async () => {
    const t = factionTest();
    migrationsTest.register(t);
    const ids = await insertStoredFactions(t, [
      {
        slug: 'legacy',
        data: {
          logo: '/vector/logo/atreides.svg',
          background,
          decals: [{ id: '/vector/logo/fremen.svg', muted: false }],
          retiredField: 'kept',
        },
      },
      { slug: 'deleted', data: { logo: '/vector/generic/axes.svg' }, isDeleted: true },
      { slug: 'current', data: { emblem: '/vector/emblem/atreides.svg', background } },
      /* Text that only mentions the old folder is left as it is written. */
      { slug: 'prose', data: { emblem: '/vector/generic/axes.svg', about: 'Drawn from /vector/logo/ once.' } },
    ]);
    const before = await storedFactionData(t, ids);

    await t.mutation(internal.emblemMigrations.emblem_rename_factions_v1, {});
    const first = await storedFactionData(t, ids);
    await t.mutation(internal.emblemMigrations.emblem_rename_factions_v1, { reset: true });
    await t.mutation(internal.emblemMigrations.emblem_rename_factions_verify_v1, {});
    const second = await storedFactionData(t, ids);

    const [legacy, deleted, current, prose] = first;
    expect(legacy!.data).toEqual({
      name: 'legacy',
      emblem: '/vector/emblem/atreides.svg',
      background,
      decals: [{ id: '/vector/emblem/fremen.svg', muted: false }],
      retiredField: 'kept',
    });
    expect(legacy!.updated_at).toBe(before[0]!.updated_at);
    expect(deleted!.data).toEqual({ name: 'deleted', emblem: '/vector/generic/axes.svg' });
    expect(current!.data).toEqual(before[2]!.data);
    expect(prose!.data).toEqual(before[3]!.data);
    expect(second.map((row) => row.data)).toEqual(first.map((row) => row.data));
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, {
        required: ['emblem_rename_factions_v1', 'emblem_rename_factions_verify_v1'],
      })
    ).resolves.toMatchObject({ ok: true });
  });

  test('verification refuses a row that still names a logo', async () => {
    const t = factionTest();
    migrationsTest.register(t);
    await insertStoredFactions(t, [{ slug: 'unmigrated', data: { logo: '/vector/logo/atreides.svg' } }]);

    await t.mutation(internal.emblemMigrations.emblem_rename_factions_verify_v1, {});
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: ['emblem_rename_factions_verify_v1'] })
    ).rejects.toThrow(/emblem_rename_factions_verify_v1\(failed/);
  });

  test('rewrites queued captures and assets at any depth', async () => {
    const t = factionTest();
    migrationsTest.register(t);
    const { jobId, assetId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Asset owner' });
      const assetId = await ctx.db.insert('assets', {
        owner_id: ownerId,
        group_id: null,
        type: 'token-leader',
        slug: 'vidal',
        data: { name: 'Vidal', image: '/image/leader/vidal.png', logo: '/vector/logo/ecaz.svg' },
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        is_deleted: false,
      } as never);
      const jobId = await ctx.db.insert('publication_jobs', {
        asset_type: 'faction-token',
        asset_id: 'faction',
        asset_data: { logo: '/vector/logo/ecaz.svg', background },
        status: 'pending',
        attempt_counter: 0,
        created_at: 1000,
        updated_at: 1000,
      });
      return { jobId, assetId };
    });

    await t.mutation(internal.emblemMigrations.emblem_rename_assets_v1, {});
    await t.mutation(internal.emblemMigrations.emblem_rename_publication_jobs_v1, {});

    const { job, asset } = await t.run(async (ctx) => ({
      job: (await ctx.db.get('publication_jobs', jobId))!,
      asset: (await ctx.db.get('assets', assetId))!,
    }));
    expect(job.asset_data).toEqual({ emblem: '/vector/emblem/ecaz.svg', background });
    expect(asset.data).toEqual({ name: 'Vidal', image: '/image/leader/vidal.png', emblem: '/vector/emblem/ecaz.svg' });
  });

  test('rewrites Rulebook Contents with the hashes taken over them, so the draft still matches its Edition', async () => {
    const f = await rulebookFixture();
    migrationsTest.register(f.t);
    const created = await f.owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: f.ids.rulesetId,
      name: 'Emblem manual',
      source: { kind: 'starter' },
    });
    /* A heading icon chosen from the stock emblems before the rename. */
    const legacy = JSON.parse(
      JSON.stringify(created.draft.contents).replace(
        '"showHeading":true',
        '"showHeading":true,"headingIcon":"/vector/logo/atreides.svg"'
      )
    ) as unknown;
    expect(JSON.stringify(legacy)).toContain('/vector/logo/atreides.svg');
    await f.t.run(async (ctx) => {
      await ctx.db.patch('rulebook_drafts', created.draft._id, {
        contents: legacy,
        /* Written by the code before the rename, which kept the old path in what it hashed. */
        contents_hash: 'v1:before-the-rename',
      });
      const stored = (await ctx.db
        .query('rulebook_edition_contents')
        .withIndex('by_edition_id', (q) => q.eq('edition_id', created.edition._id))
        .unique())!;
      await ctx.db.patch('rulebook_edition_contents', stored._id, { contents: legacy });
      await ctx.db.patch('rulebook_editions', created.edition._id, { contents_hash: 'v1:before-the-rename' });
    });

    const migrate = async () => {
      await f.t.mutation(internal.emblemMigrations.emblem_rename_rulebook_drafts_v1, {});
      await f.t.mutation(internal.emblemMigrations.emblem_rename_rulebook_edition_contents_v1, {});
    };
    const rows = () =>
      f.t.run(async (ctx) => ({
        draft: (await ctx.db.get('rulebook_drafts', created.draft._id))!,
        edition: (await ctx.db.get('rulebook_editions', created.edition._id))!,
        contents: (await ctx.db
          .query('rulebook_edition_contents')
          .withIndex('by_edition_id', (q) => q.eq('edition_id', created.edition._id))
          .unique())!.contents,
      }));
    await migrate();
    const migrated = await rows();

    const renamed = JSON.stringify(migrated.draft.contents);
    expect(renamed).toContain('/vector/emblem/atreides.svg');
    expect(renamed).not.toContain('/vector/logo/');
    expect(migrated.contents).toEqual(migrated.draft.contents);
    expect(migrated.draft.contents_hash).toBe(rulebookDraftContentsHash(migrated.draft.contents));
    expect(migrated.edition.contents_hash).toBe(rulebookEditionContentsHash(migrated.contents));
    expect(migrated.draft).not.toHaveProperty('authored_hash');
    expect(migrated.edition).not.toHaveProperty('authored_hash');

    await migrate();
    expect(await rows()).toEqual(migrated);
  });
});
