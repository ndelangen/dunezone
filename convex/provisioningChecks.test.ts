/// <reference types="vite/client" />

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function rebuiltDeployment() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  return t;
}

type Deployment = ReturnType<typeof rebuiltDeployment>;

const timestamps = { created_at: '2026-07-01T10:00:00.000Z', updated_at: '2026-07-02T10:00:00.000Z' };

async function insertFaction(t: Deployment, ownerId: Id<'users'>) {
  await t.run(async (ctx) => {
    await ctx.db.insert('factions', {
      owner_id: ownerId,
      data: { name: 'House Cloned' },
      slug: 'house-cloned',
      is_deleted: false,
      group_id: null,
      ...timestamps,
    });
  });
}

async function seedRawClone(t: Deployment) {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert('users', { email: 'someone@prod.example' });
    await ctx.db.insert('authAccounts', { userId: id, provider: 'discord', providerAccountId: '1234567890' });
    return id;
  });
  await insertFaction(t, userId);
  return userId;
}

/** What a snapshot load leaves: the placeholder owner with its profile, and published content it owns. */
async function seedSnapshotLoad(t: Deployment) {
  const placeholderId = await t.run(async (ctx) => {
    const id = await ctx.db.insert('users', { account_state: 'active' });
    await ctx.db.insert('profiles', {
      user_id: id,
      username: 'Snapshot owner',
      avatar_url: null,
      account_state: 'active',
      slug: 'snapshot-owner',
      ...timestamps,
    });
    return id;
  });
  await insertFaction(t, placeholderId);
  return placeholderId;
}

describe('rebuild contract for a raw production clone', () => {
  test('passes on a cleaned clone carrying production data', async () => {
    const t = rebuiltDeployment();
    await seedRawClone(t);

    expect(await t.query(internal.provisioningChecks.assertRebuildContract, { source: 'production' })).toEqual({
      ok: true,
    });
  });

  test('rejects a clone whose session tables survived the cleanup', async () => {
    const t = rebuiltDeployment();
    const userId = await seedRawClone(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('authSessions', { userId, expirationTime: Date.parse('2026-09-01T00:00:00.000Z') });
    });

    await expect(t.query(internal.provisioningChecks.assertRebuildContract, { source: 'production' })).rejects.toThrow(
      'authSessions still holds rows'
    );
  });

  test('rejects a clone the export never landed in', async () => {
    const t = rebuiltDeployment();

    await expect(t.query(internal.provisioningChecks.assertRebuildContract, { source: 'production' })).rejects.toThrow(
      'factions is empty'
    );
  });
});

describe('rebuild contract for the anonymised snapshot', () => {
  test('passes when the placeholder owner is the only account', async () => {
    const t = rebuiltDeployment();
    await seedSnapshotLoad(t);

    expect(await t.query(internal.provisioningChecks.assertRebuildContract, { source: 'snapshot' })).toEqual({
      ok: true,
    });
  });

  test('rejects a raw clone, which carries accounts, emails and sign-in rows', async () => {
    const t = rebuiltDeployment();
    await seedRawClone(t);

    await expect(t.query(internal.provisioningChecks.assertRebuildContract, { source: 'snapshot' })).rejects.toThrow(
      /authAccounts still holds rows[\s\S]*users holds a row with an email/
    );
  });

  test('rejects private rows and a second account beside the placeholder owner', async () => {
    const t = rebuiltDeployment();
    const placeholderId = await seedSnapshotLoad(t);
    await t.run(async (ctx) => {
      const group = await ctx.db.insert('groups', {
        name: 'Council',
        slug: 'council',
        created_by: placeholderId,
        is_deleted: false,
        created_at: timestamps.created_at,
      });
      await ctx.db.insert('group_members', {
        group_id: group,
        user_id: placeholderId,
        status: 'active',
        requested_at: timestamps.created_at,
        approved_at: null,
        approved_by: null,
      });
      const leaving = await ctx.db.insert('users', {});
      await ctx.db.insert('profiles', {
        user_id: leaving,
        username: 'leaving',
        avatar_url: null,
        account_state: 'deleted',
        slug: 'leaving',
        ...timestamps,
      });
    });

    const violation = t.query(internal.provisioningChecks.assertRebuildContract, { source: 'snapshot' });
    await expect(violation).rejects.toThrow('group_members still holds rows');
    await expect(violation).rejects.toThrow('users holds more than one row');
    await expect(violation).rejects.toThrow('profiles holds more than one row');
  });
});
