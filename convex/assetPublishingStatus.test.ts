/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function seedFaction(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Status projection owner' });
    await ctx.db.insert('profiles', {
      user_id: ownerId,
      username: 'Status projection owner',
      avatar_url: null,
      account_state: 'active',
      slug: 'status-projection-owner',
      created_at: '2026-07-16T12:00:00.000Z',
      updated_at: '2026-07-16T12:00:00.000Z',
    });
    return await ctx.db.insert('factions', {
      owner_id: ownerId,
      data: assetPublishingFaction,
      slug: 'status-projection',
      created_at: '2026-07-16T12:00:00.000Z',
      updated_at: '2026-07-16T12:00:00.000Z',
      is_deleted: false,
      group_id: null,
    });
  });
}

function publicationJob(factionId: Id<'factions'>, status: 'pending' | 'in_progress' | 'error', at: number) {
  return {
    asset_type: 'faction_sheet' as const,
    asset_id: factionId,
    asset_data: {
      factionId,
      slug: 'status-projection',
      faction: assetPublishingFaction,
    },
    status,
    attempt_counter: 0,
    created_at: at,
    updated_at: at,
  };
}

function currentSheet(factionId: Id<'factions'>, cacheToken: string) {
  return {
    asset_type: 'faction_sheet' as const,
    asset_id: factionId,
    cache_token: cacheToken,
    published_at: 789,
  };
}

async function publicStatus(t: ReturnType<typeof convexTest>, factionId: Id<'factions'>) {
  const faction = await t.run(async (ctx) => await ctx.db.get('factions', factionId));
  if (!faction) {
    throw new Error('Missing status projection faction');
  }
  return (await t.query(api.factions.getBySlug, { slug: faction.slug })).assetPublishing;
}

describe('public asset publishing status projection', () => {
  test('returns no link until a publication asset exists', async () => {
    const t = convexTest(schema, modules);
    const factionId = await seedFaction(t);

    expect(await publicStatus(t, factionId)).toEqual({
      status: null,
      captureStatus: null,
      publicationHref: null,
      lastPublishedAt: null,
    });
  });

  test.each([
    ['pending', 'scheduled'],
    ['in_progress', 'in_progress'],
    ['error', 'error'],
  ] as const)('projects %s job state as %s capture state', async (status, captureStatus) => {
    const t = convexTest(schema, modules);
    const factionId = await seedFaction(t);
    await t.run(async (ctx) => await ctx.db.insert('publication_jobs', publicationJob(factionId, status, 1)));

    expect(await publicStatus(t, factionId)).toEqual({
      status: null,
      captureStatus,
      publicationHref: null,
      lastPublishedAt: null,
    });
  });

  test('keeps the stable public link while replacement work exists', async () => {
    const t = convexTest(schema, modules);
    const factionId = await seedFaction(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('publication_assets', currentSheet(factionId, 'private-cache-token'));
      await ctx.db.insert('publication_jobs', publicationJob(factionId, 'pending', 2));
    });

    expect(await publicStatus(t, factionId)).toEqual({
      status: 'current',
      captureStatus: 'scheduled',
      publicationHref: `/published/factions/${factionId}/sheet.pdf?v=private-cache-token`,
      lastPublishedAt: 789,
    });
  });

  test.each([
    ['in_progress', 'pending', 'in_progress'],
    ['pending', 'error', 'scheduled'],
  ] as const)('shows %s work ahead of %s work', async (ahead, behind, captureStatus) => {
    const t = convexTest(schema, modules);
    const factionId = await seedFaction(t);
    await t.run(async (ctx) => {
      for (const [index, status] of [behind, ahead].entries()) {
        await ctx.db.insert('publication_jobs', publicationJob(factionId, status, index + 1));
      }
    });

    expect((await publicStatus(t, factionId)).captureStatus).toBe(captureStatus);
  });
});
