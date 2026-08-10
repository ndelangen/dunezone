/// <reference types="vite/client" />

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function clonedDeployment() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  return t;
}

async function seedSatisfiedContract(t: ReturnType<typeof clonedDeployment>) {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email: 'someone@prod.example' });
    await ctx.db.insert('authAccounts', {
      userId,
      provider: 'discord',
      providerAccountId: '1234567890',
    });
    await ctx.db.insert('factions', {
      owner_id: userId,
      data: { name: 'House Cloned' },
      slug: 'house-cloned',
      created_at: '2026-07-01T10:00:00.000Z',
      updated_at: '2026-07-02T10:00:00.000Z',
      is_deleted: false,
      group_id: null,
    });
  });
}

describe('rebuild contract', () => {
  test('passes on a cleaned clone carrying production data', async () => {
    const t = clonedDeployment();
    await seedSatisfiedContract(t);

    expect(await t.query(internal.provisioningChecks.assertRebuildContract, {})).toEqual({
      ok: true,
    });
  });

  test('rejects a clone whose session tables survived the cleanup', async () => {
    const t = clonedDeployment();
    await seedSatisfiedContract(t);
    await t.run(async (ctx) => {
      const user = await ctx.db.query('users').first();
      await ctx.db.insert('authSessions', {
        userId: user!._id,
        expirationTime: Date.parse('2026-09-01T00:00:00.000Z'),
      });
    });

    await expect(t.query(internal.provisioningChecks.assertRebuildContract, {})).rejects.toThrow(
      'authSessions still holds rows'
    );
  });

  test('rejects a clone the snapshot never landed in', async () => {
    const t = clonedDeployment();

    await expect(t.query(internal.provisioningChecks.assertRebuildContract, {})).rejects.toThrow(
      'factions is empty'
    );
  });
});
