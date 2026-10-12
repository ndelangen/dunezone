/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { playGameNameSchema } from '../src/shared/play/gameNames';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const required = ['play_game_names_v1', 'play_game_names_verify_v1'];

function world() {
  const t = convexTest(schema, modules);
  migrationsTest.register(t);
  return t;
}

async function seed(t: ReturnType<typeof world>, fields: Partial<Doc<'play_games'>> = {}) {
  return t.run((ctx) =>
    ctx.db.insert('play_games', {
      state: 'expired',
      secret: 'synthetic-secret',
      attempt_id: 'synthetic-attempt',
      provision_expires_at: 1,
      created_at: 1,
      ...fields,
    })
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('game-name directory migration', () => {
  test('repairs every lifecycle state and partial pair without changing existing fields or replaying allocation', async () => {
    const t = world();
    const ids = await Promise.all([
      seed(t, { state: 'pending' }),
      seed(t, { state: 'ready', name: 'Arrakeen picnic' }),
      seed(t, { slug: 'kept-permanent-address', fixture_key: 'retired-fixture' }),
      seed(t, { name: 'Caladan picnic', slug: 'caladan-picnic-z' }),
    ]);
    const rows = () => t.run((ctx) => Promise.all(ids.map((id) => ctx.db.get('play_games', id))));
    const before = await rows();
    await t.mutation(internal.migrations.play_game_names_v1, {});
    await t.mutation(internal.migrations.play_game_names_verify_v1, {});
    await expect(t.query(internal.migrations.assertReadyForNarrow, { required })).resolves.toMatchObject({ ok: true });
    const repaired = await rows();
    for (const [index, row] of repaired.entries()) {
      expect(playGameNameSchema.parse(row!.name)).toBe(row!.name);
      expect(row!.slug).toBeTruthy();
      const { name, slug, ...rest } = row!;
      const { name: oldName, slug: oldSlug, ...oldRest } = before[index]!;
      expect(rest).toEqual(oldRest);
      if (oldName !== undefined) {
        expect(name).toBe(oldName);
      }
      if (oldSlug !== undefined) {
        expect(slug).toBe(oldSlug);
      }
    }
    const allocations = () =>
      t.run(async (ctx) => ({
        reservations: await ctx.db.query('play_game_slug_reservations').collect(),
        cursors: await ctx.db.query('play_game_slug_cursors').collect(),
      }));
    const assigned = await allocations();
    expect(assigned.cursors).toEqual(
      expect.arrayContaining([expect.objectContaining({ base: 'caladan-picnic', next_suffix: 36 })])
    );
    await t.mutation(internal.migrations.play_game_names_v1, { cursor: null });
    expect(await rows()).toEqual(repaired);
    expect(await allocations()).toEqual(assigned);
  });

  test('resumes bounded batches while new allocation respects retained and deleted-game reservations', async () => {
    const t = world();
    await t.run(async (ctx) => {
      await ctx.db.insert('play_game_slug_reservations', { slug: 'arrakeen-picnic' });
      await ctx.db.insert('play_game_slug_reservations', { slug: 'arrakeen-picnic-1' });
    });
    const ids: Id<'play_games'>[] = [];
    for (let index = 0; index < 20; index += 1) {
      ids.push(await seed(t, { name: 'Arrakeen picnic' }));
    }
    const first = await t.mutation(internal.migrations.play_game_names_v1, {
      cursor: null,
      dryRun: false,
      oneBatchOnly: true,
      batchSize: 3,
    });
    expect(first.isDone).toBe(false);
    vi.stubEnv('IS_TEST', 'true');
    vi.stubEnv('E2E_LOCAL_AUTH', 'true');
    vi.stubEnv('CONVEX_CLOUD_URL', 'http://127.0.0.1:3210');
    vi.stubEnv('SITE_URL', 'http://127.0.0.1:8787');
    const fresh = await t.mutation(internal.playTesting.createFixture, {});
    const migration = await t.mutation(internal.migrations.play_game_names_v1, {
      cursor: first.continueCursor,
      dryRun: false,
      oneBatchOnly: true,
      batchSize: 100,
    });
    expect(migration.isDone).toBe(true);
    await t.mutation(internal.migrations.play_game_names_verify_v1, { batchSize: 100 });
    const rows = await t.run((ctx) => Promise.all([...ids, fresh.gameId].map((id) => ctx.db.get('play_games', id))));
    expect(new Set(rows.map((row) => row!.slug)).size).toBe(rows.length);
    expect(rows.map((row) => row!.slug)).not.toContain('arrakeen-picnic');
    expect(rows.map((row) => row!.slug)).not.toContain('arrakeen-picnic-1');
  });

  test('a dry run rolls back names, reservations and cursors', async () => {
    const t = world();
    const id = await seed(t, { name: 'Arrakeen picnic' });
    await t.mutation(internal.migrations.play_game_names_v1, { cursor: null, dryRun: true });
    expect(await t.run((ctx) => ctx.db.get('play_games', id))).not.toHaveProperty('slug');
    expect(await t.run((ctx) => ctx.db.query('play_game_slug_reservations').collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query('play_game_slug_cursors').collect())).toEqual([]);
  });

  test.each([
    { name: 'Arrakeen picnic', slug: 'create' },
    { name: 'Arrakeen picnic', slug: 'Not-a-canonical-url' },
    { name: '', slug: 'kept-address' },
    { name: 'Fuck the spice', slug: 'kept-address' },
  ])('refuses an invalid retained pair without changing its address', async (fields) => {
    const t = world();
    const id = await seed(t, fields);
    await t.mutation(internal.migrations.play_game_names_v1, {});
    await expect(t.query(internal.migrations.assertReadyForNarrow, { required: [required[0]!] })).rejects.toThrow(
      'Narrow blocked'
    );
    expect(await t.run((ctx) => ctx.db.get('play_games', id))).toMatchObject(fields);
  });

  test('verification refuses duplicate URLs and missing reservations instead of permitting contraction', async () => {
    const t = world();
    await seed(t, { name: 'Arrakeen picnic', slug: 'arrakeen-picnic' });
    await t.mutation(internal.migrations.play_game_names_verify_v1, {});
    await expect(t.query(internal.migrations.assertReadyForNarrow, { required: [required[1]!] })).rejects.toThrow(
      'Narrow blocked'
    );
    await seed(t, { name: 'Arrakeen picnic', slug: 'arrakeen-picnic' });
    await t.mutation(internal.migrations.play_game_names_v1, {});
    await expect(t.query(internal.migrations.assertReadyForNarrow, { required: [required[0]!] })).rejects.toThrow(
      'Narrow blocked'
    );
  });
});
