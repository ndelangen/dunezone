/// <reference types="vite/client" />

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { placeholderOwner } from '../scripts/lib/snapshot-policy';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function prepared() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  return t;
}

describe('provisioning ownership remap', () => {
  beforeEach(() => {
    vi.stubEnv('IS_TEST', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('hands cloned factions and groups to reviewer A with B as a member', async () => {
    const t = prepared();
    const { prodUserId } = await t.run(async (ctx) => {
      const prodUser = await ctx.db.insert('users', { email: 'someone@prod.example' });
      await ctx.db.insert('users', { email: 'user-a@example.com' });
      await ctx.db.insert('users', { email: 'user-b@example.com' });
      const groupId = await ctx.db.insert('groups', {
        name: 'Cloned authors',
        slug: 'cloned-authors',
        created_at: '2026-06-01T10:00:00.000Z',
        created_by: prodUser,
        is_deleted: false,
      });
      await ctx.db.insert('factions', {
        owner_id: prodUser,
        data: { name: 'House Cloned' },
        slug: 'house-cloned',
        created_at: '2026-07-01T10:00:00.000Z',
        updated_at: '2026-07-02T10:00:00.000Z',
        is_deleted: false,
        group_id: groupId,
      });
      return { prodUserId: prodUser };
    });

    const { ownerId, collaboratorId } = await t.mutation(internal.provisioning.prepareLocalUsers, {
      ownerEmail: 'user-a@example.com',
      collaboratorEmail: 'user-b@example.com',
    });
    const factionPass = await t.mutation(internal.provisioning.remapFactionOwnershipBatch, {
      ownerEmail: 'user-a@example.com',
      paginationOpts: { numItems: 50, cursor: null },
    });
    const groupPass = await t.mutation(internal.provisioning.remapGroupOwnershipBatch, {
      ownerEmail: 'user-a@example.com',
      collaboratorEmail: 'user-b@example.com',
      paginationOpts: { numItems: 50, cursor: null },
    });

    expect(factionPass.isDone).toBe(true);
    expect(groupPass.isDone).toBe(true);
    await t.run(async (ctx) => {
      const faction = await ctx.db
        .query('factions')
        .withIndex('by_slug', (q) => q.eq('slug', 'house-cloned'))
        .unique();
      expect(faction?.owner_id).toBe(ownerId);
      expect(faction?.owner_id).not.toBe(prodUserId);

      const group = await ctx.db
        .query('groups')
        .withIndex('by_slug', (q) => q.eq('slug', 'cloned-authors'))
        .unique();
      expect(group?.created_by).toBe(ownerId);

      const memberships = await ctx.db
        .query('group_members')
        .withIndex('by_group_user', (q) => q.eq('group_id', group!._id))
        .collect();
      const byUser = new Map(memberships.map((member) => [member.user_id, member.status]));
      expect(byUser.get(ownerId)).toBe('active');
      expect(byUser.get(collaboratorId)).toBe('active');
    });
  });

  test('refuses to run outside test mode', async () => {
    vi.stubEnv('IS_TEST', 'false');
    const t = prepared();
    await expect(
      t.mutation(internal.provisioning.remapFactionOwnershipBatch, {
        ownerEmail: 'user-a@example.com',
        paginationOpts: { numItems: 50, cursor: null },
      })
    ).rejects.toThrow('IS_TEST');
    await expect(t.mutation(internal.provisioning.insertSeedDocuments, { documents: '[]' })).rejects.toThrow('IS_TEST');
  });
});

describe('provisioning seed documents', () => {
  beforeEach(() => {
    vi.stubEnv('IS_TEST', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('resolves each reference to the id inserted under its key', async () => {
    const t = prepared();
    const documents = [
      { key: 'viewer', table: 'users', value: { name: 'Seeded viewer' } },
      {
        key: 'group',
        table: 'groups',
        value: {
          name: 'Seeded group',
          slug: { $seedRef: 'viewer', $seedText: 'group-of-__seed_ref__' },
          created_at: '2026-01-01T12:00:00.000Z',
          created_by: { $seedRef: 'viewer' },
          is_deleted: false,
        },
      },
    ];

    await t.mutation(internal.provisioning.insertSeedDocuments, { documents: JSON.stringify(documents) });

    await t.run(async (ctx) => {
      const viewer = await ctx.db.query('users').unique();
      const group = await ctx.db.query('groups').unique();
      expect(group?.created_by).toBe(viewer?._id);
      expect(group?.slug).toBe(`group-of-${viewer?._id}`);
    });
  });
});

describe('snapshot Rulebook draft seed', () => {
  test('runs only where a snapshot load left the placeholder owner as the one account, so never on production', async () => {
    const t = prepared();
    const seed = () =>
      t.mutation(internal.provisioning.seedSnapshotRulebookDraftsBatch, {
        paginationOpts: { numItems: 10, cursor: null },
      });
    const refusal = "where a snapshot load left the placeholder owner as the deployment's one account";

    await t.run((ctx) => ctx.db.insert('users', { email: 'someone@prod.example' }));
    await expect(seed()).rejects.toThrow(refusal);
    await t.run(async (ctx) => {
      await ctx.db.insert('users', placeholderOwner.user());
    });
    await expect(seed()).rejects.toThrow(refusal);
  });
});
