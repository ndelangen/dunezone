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
