/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function seedFaction(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Status projection owner' });
    return await ctx.db.insert('factions', {
      owner_id: ownerId,
      data: {},
      slug: 'status-projection',
      created_at: '2026-07-16T12:00:00.000Z',
      updated_at: '2026-07-16T12:00:00.000Z',
      is_deleted: false,
      group_id: null,
    });
  });
}

async function insertTarget(
  t: ReturnType<typeof convexTest>,
  factionId: Id<'factions'>,
  status: 'pending' | 'leased' | 'blocked' | 'current'
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert('asset_targets', {
        faction_id: factionId,
        asset_type: 'faction_sheet',
        desired_generation: 2,
        desired_renderer_version: 'faction-sheet-v1',
        status,
        consecutive_render_failures: 0,
        last_error: 'private operational error',
        claim_token: 'private-claim-token',
        claimed_generation: 2,
        claimed_renderer_version: 'faction-sheet-v1',
        lease_expires_at: 456,
      })
  );
}

async function publicStatus(t: ReturnType<typeof convexTest>, factionId: Id<'factions'>) {
  return await t.query(api.assetPublishingStatus.getFactionSheet, { factionId });
}

describe('public asset publishing status projection', () => {
  test('returns an exact-key null projection when the target is absent', async () => {
    const t = convexTest(schema, modules);
    const factionId = await seedFaction(t);
    const projection = await publicStatus(t, factionId);

    expect(projection).toEqual({ status: null, publicationHref: null });
    expect(Object.keys(projection).sort()).toEqual(['publicationHref', 'status']);
  });

  test.each([
    ['pending', 'waiting'],
    ['leased', 'publishing'],
    ['blocked', 'delayed'],
  ] as const)('maps %s to %s without operational leakage', async (targetStatus, expected) => {
    const t = convexTest(schema, modules);
    const factionId = await seedFaction(t);
    await insertTarget(t, factionId, targetStatus);

    const projection = await publicStatus(t, factionId);
    expect(projection).toEqual({ status: expected, publicationHref: null });
    expect(Object.keys(projection).sort()).toEqual(['publicationHref', 'status']);
  });

  test('reports current only when generation and renderer match exactly', async () => {
    const t = convexTest(schema, modules);
    const factionId = await seedFaction(t);
    const targetId = await insertTarget(t, factionId, 'current');
    await t.run(async (ctx) => {
      await ctx.db.patch(targetId, {
        published_generation: 2,
        published_renderer_version: 'faction-sheet-v1',
        published_cache_token: 'private-cache-token',
        published_r2_etag: 'private-etag',
        published_bytes: 42,
        published_at: 789,
      });
    });

    const publicationHref = `/published/factions/${encodeURIComponent(factionId)}/sheet.pdf?v=private-cache-token`;
    expect(await publicStatus(t, factionId)).toEqual({ status: 'current', publicationHref });
    await t.run(async (ctx) => {
      await ctx.db.patch(targetId, { desired_generation: 3 });
    });
    expect(await publicStatus(t, factionId)).toEqual({ status: 'waiting', publicationHref });
  });

  test('keeps disabled control state internal while saved work remains visibly waiting', async () => {
    const t = convexTest(schema, modules);
    const factionId = await seedFaction(t);
    await insertTarget(t, factionId, 'pending');
    await t.run(async (ctx) => {
      await ctx.db.insert('asset_type_configs', {
        asset_type: 'faction_sheet',
        status: 'disabled',
        active_renderer_version: 'faction-sheet-v1',
        updated_at: 123,
      });
    });

    const projection = await publicStatus(t, factionId);
    expect(projection).toEqual({ status: 'waiting', publicationHref: null });
    expect(Object.keys(projection).sort()).toEqual(['publicationHref', 'status']);
  });

  test('does not link an incomplete publication', async () => {
    const t = convexTest(schema, modules);
    const factionId = await seedFaction(t);
    const targetId = await insertTarget(t, factionId, 'pending');
    await t.run(async (ctx) => {
      await ctx.db.patch(targetId, {
        published_generation: 1,
        published_renderer_version: 'faction-sheet-v1',
        published_cache_token: 'incomplete-cache-token',
      });
    });

    expect(await publicStatus(t, factionId)).toEqual({
      status: 'waiting',
      publicationHref: null,
    });
  });
});
