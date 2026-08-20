/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('asset catalogue', () => {
  test('lists newest-first non-deleted assets with per-type counts and name fallback', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Asset owner' });
      await ctx.db.insert('profiles', {
        user_id: ownerId,
        username: 'stilgar',
        avatar_url: null,
        slug: 'stilgar',
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
      });
      const base = {
        owner_id: ownerId,
        group_id: null,
        is_deleted: false,
      };
      await ctx.db.insert('assets', {
        ...base,
        type: 'card-treachery',
        slug: 'lasgun',
        data: { name: 'Lasgun' },
        created_at: '2026-08-10T00:00:00.000Z',
        updated_at: '2026-08-10T00:00:00.000Z',
      });
      await ctx.db.insert('assets', {
        ...base,
        type: 'card-treachery',
        slug: 'nameless',
        data: {},
        created_at: '2026-08-11T00:00:00.000Z',
        updated_at: '2026-08-11T00:00:00.000Z',
      });
      await ctx.db.insert('assets', {
        ...base,
        type: 'deck',
        slug: 'house-treachery',
        data: { name: 'House Treachery' },
        created_at: '2026-08-12T00:00:00.000Z',
        updated_at: '2026-08-12T00:00:00.000Z',
      });
      await ctx.db.insert('assets', {
        ...base,
        type: 'deck',
        slug: 'deleted-deck',
        data: { name: 'Deleted' },
        created_at: '2026-08-13T00:00:00.000Z',
        updated_at: '2026-08-13T00:00:00.000Z',
        is_deleted: true,
      });
    });

    const page = await t.query(api.assets.cataloguePage, {});
    expect(page.countsByType).toEqual({ 'card-treachery': 2, deck: 1 });
    expect(page.recent.map((entry) => entry.slug)).toEqual(['house-treachery', 'nameless', 'lasgun']);
    expect(page.recent[1]?.name).toBe('Untitled');
    expect(page.recent[0]?.owner?.username).toBe('stilgar');

    const cards = await t.query(api.assets.listByTypes, { types: ['card-treachery'] });
    expect(cards.map((entry) => entry.slug)).toEqual(['nameless', 'lasgun']);
  });
});

describe('deck membership', () => {
  test('a card reports the decks holding it and how many copies each holds, and a card in none reports an empty list', async () => {
    const t = convexTest(schema, modules);
    const { lasgun, shield, treachery } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Asset owner' });
      const base = { owner_id: ownerId, group_id: null, is_deleted: false };
      const stamps = { created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z' };
      const lasgunId = await ctx.db.insert('assets', {
        ...base,
        ...stamps,
        type: 'card-treachery',
        slug: 'lasgun',
        data: { name: 'Lasgun' },
      });
      const shieldId = await ctx.db.insert('assets', {
        ...base,
        ...stamps,
        type: 'card-treachery',
        slug: 'shield',
        data: { name: 'Shield' },
      });
      const treacheryId = await ctx.db.insert('assets', {
        ...base,
        ...stamps,
        type: 'deck',
        slug: 'house-treachery',
        data: { name: 'House Treachery' },
      });
      await ctx.db.insert('asset_relations', {
        from_asset_id: treacheryId,
        to_asset_id: lasgunId,
        kind: 'deck-card',
        count: 3,
      });
      return { lasgun: lasgunId, shield: shieldId, treachery: treacheryId };
    });

    const memberships = await t.query(api.assets.decksForAssets, { assetIds: [lasgun, shield] });

    expect(memberships[lasgun]).toEqual([
      { id: treachery, type: 'deck', slug: 'house-treachery', name: 'House Treachery', count: 3 },
    ]);
    /* An asked-about card always gets a key, so "in no deck" is an empty list rather than a missing one. */
    expect(memberships[shield]).toEqual([]);
  });

  test('a soft-deleted deck stops holding its cards, without its relation being touched', async () => {
    const t = convexTest(schema, modules);
    const lasgun = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Asset owner' });
      const base = { owner_id: ownerId, group_id: null, is_deleted: false };
      const stamps = { created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z' };
      const lasgunId = await ctx.db.insert('assets', {
        ...base,
        ...stamps,
        type: 'card-treachery',
        slug: 'lasgun',
        data: { name: 'Lasgun' },
      });
      const retiredId = await ctx.db.insert('assets', {
        ...base,
        ...stamps,
        type: 'deck',
        slug: 'retired-deck',
        data: { name: 'Retired' },
        is_deleted: true,
      });
      await ctx.db.insert('asset_relations', {
        from_asset_id: retiredId,
        to_asset_id: lasgunId,
        kind: 'deck-card',
        count: 2,
      });
      return lasgunId;
    });

    const memberships = await t.query(api.assets.decksForAssets, { assetIds: [lasgun] });

    expect(memberships[lasgun]).toEqual([]);
    const relations = await t.run(async (ctx) => await ctx.db.query('asset_relations').collect());
    expect(relations).toHaveLength(1);
  });
});
