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
        account_state: 'active',
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
    const { treachery } = await t.run(async (ctx) => {
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

    const held = await t.query(api.assets.getPage, { type: 'card-treachery', slug: 'lasgun' });
    expect(held?.inDecks).toEqual([
      { id: treachery, type: 'deck', slug: 'house-treachery', name: 'House Treachery', count: 3 },
    ]);
    const free = await t.query(api.assets.getPage, { type: 'card-treachery', slug: 'shield' });
    expect(free?.inDecks).toEqual([]);
  });

  test('a soft-deleted deck stops holding its cards, without its relation being touched', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
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

    const page = await t.query(api.assets.getPage, { type: 'card-treachery', slug: 'lasgun' });
    expect(page?.inDecks).toEqual([]);
    const relations = await t.run(async (ctx) => await ctx.db.query('asset_relations').collect());
    expect(relations).toHaveLength(1);
  });
});

describe('browse page', () => {
  test('counts the decks holding each card, tallies the orphans, and says nothing about types no deck can hold', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Asset owner' });
      const base = { owner_id: ownerId, group_id: null, is_deleted: false };
      const stamps = { created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z' };
      const lasgun = await ctx.db.insert('assets', {
        ...base,
        ...stamps,
        type: 'card-treachery',
        slug: 'lasgun',
        data: { name: 'Lasgun' },
      });
      await ctx.db.insert('assets', {
        ...base,
        ...stamps,
        type: 'card-treachery',
        slug: 'orphan',
        data: { name: 'Orphan' },
      });
      const deck = await ctx.db.insert('assets', {
        ...base,
        ...stamps,
        type: 'deck',
        slug: 'house-treachery',
        data: { name: 'House Treachery' },
      });
      await ctx.db.insert('asset_relations', {
        from_asset_id: deck,
        to_asset_id: lasgun,
        kind: 'deck-card',
        count: 3,
      });
    });

    const cards = await t.query(api.assets.browsePage, { type: 'card-treachery' });
    expect(cards.entries.map((entry) => [entry.slug, entry.deckCount])).toEqual([
      ['orphan', 0],
      ['lasgun', 1],
    ]);
    expect(cards.inNoDeckCount).toBe(1);
    expect(cards.truncated).toBe(false);

    const decks = await t.query(api.assets.browsePage, { type: 'deck' });
    /* Nothing may hold a deck, so "in no deck" is not a question about this type rather than a count of zero. */
    expect(decks.inNoDeckCount).toBeNull();
    expect(decks.entries.map((entry) => entry.deckCount)).toEqual([0]);
  });
});
