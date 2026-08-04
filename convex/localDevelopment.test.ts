/// <reference types="vite/client" />

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('local faction development import', () => {
  beforeEach(() => {
    vi.stubEnv('IS_TEST', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('maps imported factions and groups onto the two local auth users', async () => {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, 'homepageCommunity');
    aggregateTest.register(t, 'statistics');
    const [ownerId, collaboratorId] = await t.run(async (ctx) => {
      const owner = await ctx.db.insert('users', { email: 'user-a@example.com' });
      const collaborator = await ctx.db.insert('users', { email: 'user-b@example.com' });
      return [owner, collaborator] as const;
    });

    await t.mutation(api.localDevelopment.prepareFactionImport, {
      ownerEmail: 'user-a@example.com',
      collaboratorEmail: 'user-b@example.com',
    });
    await t.mutation(api.localDevelopment.importFactionBatch, {
      ownerEmail: 'user-a@example.com',
      collaboratorEmail: 'user-b@example.com',
      factions: [
        {
          slug: 'house-meridia',
          data: { name: 'House Meridia', extras: [{ preserved: true }] },
          created_at: '2026-07-01T10:00:00.000Z',
          updated_at: '2026-07-02T10:00:00.000Z',
          group: {
            name: 'Meridian authors',
            slug: 'meridian-authors',
            created_at: '2026-06-01T10:00:00.000Z',
          },
        },
        {
          slug: 'ungrouped-house',
          data: { name: 'Ungrouped House' },
          created_at: '2026-07-03T10:00:00.000Z',
          updated_at: '2026-07-04T10:00:00.000Z',
          group: null,
        },
      ],
    });

    const snapshot = await t.run(async (ctx) => {
      const profiles = await ctx.db.query('profiles').take(10);
      const groups = await ctx.db.query('groups').take(10);
      const memberships = await ctx.db.query('group_members').take(10);
      const factions = await ctx.db.query('factions').take(10);
      const publicationJobs = await ctx.db.query('publication_jobs').take(10);
      return { profiles, groups, memberships, factions, publicationJobs };
    });

    expect(snapshot.profiles.map((profile) => profile.user_id).sort()).toEqual(
      [ownerId, collaboratorId].sort()
    );
    expect(snapshot.groups).toHaveLength(1);
    expect(snapshot.groups[0]).toMatchObject({
      slug: 'meridian-authors',
      created_by: ownerId,
    });
    expect(snapshot.memberships).toHaveLength(2);
    expect(snapshot.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: ownerId, status: 'active' }),
        expect.objectContaining({ user_id: collaboratorId, status: 'active' }),
      ])
    );
    expect(snapshot.factions).toHaveLength(2);
    expect(snapshot.factions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'house-meridia',
          owner_id: ownerId,
          group_id: snapshot.groups[0]?._id,
          data: { name: 'House Meridia', extras: [{ preserved: true }] },
        }),
        expect.objectContaining({
          slug: 'ungrouped-house',
          owner_id: ownerId,
          group_id: null,
        }),
      ])
    );
    expect(snapshot.publicationJobs).toHaveLength(0);
  });

  test('is unavailable outside the disposable local backend', async () => {
    vi.stubEnv('IS_TEST', 'false');
    const t = convexTest(schema, modules);
    aggregateTest.register(t, 'homepageCommunity');
    aggregateTest.register(t, 'statistics');

    await expect(
      t.mutation(api.localDevelopment.prepareFactionImport, {
        ownerEmail: 'user-a@example.com',
        collaboratorEmail: 'user-b@example.com',
      })
    ).rejects.toThrow('only available when IS_TEST=true');
  });
});
