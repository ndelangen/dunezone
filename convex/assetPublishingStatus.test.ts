/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/game/fixtures/assetPublishingFaction';
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

async function publicStatus(t: ReturnType<typeof convexTest>, factionId: Id<'factions'>) {
  const faction = await t.run(async (ctx) => await ctx.db.get('factions', factionId));
  if (!faction) throw new Error('Missing status projection faction');
  return (await t.query(api.factions.getBySlug, { slug: faction.slug })).assetPublishing;
}

describe('public asset publishing status projection', () => {
  test('returns no link until a publication asset exists', async () => {
    const t = convexTest(schema, modules);
    const factionId = await seedFaction(t);

    expect(await publicStatus(t, factionId)).toEqual({
      status: null,
      publicationHref: null,
      lastPublishedAt: null,
    });
  });

  test.each([
    'pending',
    'in_progress',
    'error',
  ] as const)('does not expose %s job state publicly', async (status) => {
    const t = convexTest(schema, modules);
    const factionId = await seedFaction(t);
    await t.run(
      async (ctx) =>
        await ctx.db.insert('publication_jobs', {
          asset_type: 'faction_sheet',
          asset_id: factionId,
          asset_data: {
            factionId,
            slug: 'status-projection',
            faction: assetPublishingFaction,
          },
          status,
          attempt_counter: 0,
          created_at: 1,
          updated_at: 1,
        })
    );

    expect(await publicStatus(t, factionId)).toEqual({
      status: null,
      publicationHref: null,
      lastPublishedAt: null,
    });
  });

  test('keeps the stable public link while replacement work exists', async () => {
    const t = convexTest(schema, modules);
    const factionId = await seedFaction(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('publication_assets', {
        asset_type: 'faction_sheet',
        asset_id: factionId,
        cache_token: 'private-cache-token',
        published_at: 789,
      });
      await ctx.db.insert('publication_jobs', {
        asset_type: 'faction_sheet',
        asset_id: factionId,
        asset_data: {
          factionId,
          slug: 'status-projection',
          faction: assetPublishingFaction,
        },
        status: 'pending',
        attempt_counter: 0,
        created_at: 2,
        updated_at: 2,
      });
    });

    expect(await publicStatus(t, factionId)).toEqual({
      status: 'current',
      publicationHref: `/published/factions/${factionId}/sheet.pdf?v=private-cache-token`,
      lastPublishedAt: 789,
    });
  });
});
