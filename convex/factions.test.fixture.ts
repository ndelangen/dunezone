/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';

import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const STAMP = '2026-09-28T00:00:00.000Z';

/** A fresh test world with the components faction writes and migrations touch. */
export function factionTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  migrationsTest.register(t);
  return t;
}

type FactionTest = ReturnType<typeof factionTest>;

/** One signed-in author with a public profile, so faction pages resolve their owner. */
export async function factionAuthor(t: FactionTest, name: string) {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert('users', { name });
    await ctx.db.insert('profiles', {
      user_id: id,
      username: name,
      avatar_url: null,
      account_state: 'active',
      slug: name.toLowerCase().replaceAll(' ', '-'),
      created_at: STAMP,
      updated_at: STAMP,
    });
    return id;
  });
  return t.withIdentity({ subject: userId });
}

/** Stored faction rows as a migration meets them: raw `data`, written without the save path. */
export async function insertStoredFactions(
  t: FactionTest,
  rows: Array<{ slug: string; data: Record<string, unknown>; isDeleted?: boolean }>
): Promise<Id<'factions'>[]> {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Faction owner' });
    return await Promise.all(
      rows.map(({ slug, data, isDeleted = false }) =>
        ctx.db.insert('factions', {
          owner_id: ownerId,
          data: { name: slug, ...data },
          slug,
          created_at: STAMP,
          updated_at: STAMP,
          is_deleted: isDeleted,
          group_id: null,
        })
      )
    );
  });
}

export async function storedFactionData(t: FactionTest, ids: Id<'factions'>[]) {
  return await t.run(async (ctx) => Promise.all(ids.map(async (id) => (await ctx.db.get('factions', id))!)));
}
