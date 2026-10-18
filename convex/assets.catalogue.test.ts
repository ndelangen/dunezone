/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { assetPageAs } from './viewerAccess.test.fixture';

describe('asset catalogue', () => {
  test('lists newest-first non-deleted assets with per-type counts and name fallback', async () => {
    const t = applicationTest();
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
    expect(page.recent.map((entry) => entry.slug)).toEqual(['house-treachery', 'nameless', 'lasgun']);
    expect(page.recent[1]?.name).toBe('Untitled');
    expect(page.recent[0]?.owner?.username).toBe('stilgar');

    const cards = await t.query(api.assets.listByTypes, { types: ['card-treachery'] });
    expect(cards.map((entry) => entry.slug)).toEqual(['nameless', 'lasgun']);
  });
});

describe('deck cardback reference on the page', () => {
  test('a valid reference names the target deck, and a dangling one resolves as such with no target', async () => {
    const t = applicationTest();
    const composition = {
      name: 'Treachery',
      image: '/vector/decal/amal.svg',
      imageOffset: [0, 0],
      imageScale: 1,
      background: {},
    };
    await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Deck owner' });
      const base = {
        owner_id: ownerId,
        group_id: null,
        is_deleted: false,
        created_at: '2026-08-20T00:00:00.000Z',
        updated_at: '2026-08-20T00:00:00.000Z',
      };
      const targetId = await ctx.db.insert('assets', {
        ...base,
        type: 'deck',
        slug: 'authored',
        data: { name: 'Authored', about: '', cardback: { mode: 'custom', ...composition } },
      });
      await ctx.db.insert('assets', {
        ...base,
        type: 'deck',
        slug: 'wearer',
        data: { name: 'Wearer', about: '', cardback: { mode: 'reference', asset_id: targetId } },
      });
      /* The realistic dangling case: the id is well formed (the save path guarantees that) but the target is gone. */
      const goneId = await ctx.db.insert('assets', {
        ...base,
        type: 'deck',
        slug: 'gone',
        is_deleted: true,
        data: { name: 'Gone', about: '', cardback: { mode: 'custom', ...composition } },
      });
      await ctx.db.insert('assets', {
        ...base,
        type: 'deck',
        slug: 'orphan',
        data: { name: 'Orphan', about: '', cardback: { mode: 'reference', asset_id: goneId } },
      });
    });

    const wearer = await assetPageAs(t, { type: 'deck', slug: 'wearer' });
    expect(wearer?.backDeck?.slug).toBe('authored');
    expect(wearer?.resolvedBack?.mode).toBe('reference');
    const catalogue = await t.query(api.assets.cataloguePage, {});
    const target = catalogue.recent.find((entry) => entry.slug === 'authored')!;
    const reference = catalogue.recent.find((entry) => entry.slug === 'wearer')!;
    expect(reference.previewHref).toBe(target.previewHref);
    expect(reference.previewHref).toContain(`/decks/${target.id}/cardback.jpg`);
    expect(reference.previewHref).not.toContain(reference.id);
    expect(wearer?.asset.previewHref).toBe(target.previewHref);
    expect(wearer?.asset.data.cardback.mode).toBe('reference');
    expect(reference.data.cardback.name).toBe('Treachery');
    const browse = await t.query(api.assets.browsePage, { type: 'deck' });
    expect(browse.entries.find((entry) => entry.slug === 'wearer')?.previewHref).toBe(target.previewHref);
    const picker = await t.query(api.assets.listByTypes, { types: ['deck'] });
    expect(picker.find((entry) => entry.slug === 'wearer')?.previewHref).toBe(target.previewHref);

    const orphan = await assetPageAs(t, { type: 'deck', slug: 'orphan' });
    expect(orphan?.backDeck).toBeNull();
    expect(orphan?.resolvedBack?.mode).toBe('dangling');
    expect(orphan?.asset.previewHref).toBe('/web/no-deck-back.svg');
    expect(catalogue.recent.find((entry) => entry.slug === 'orphan')?.previewHref).toBe('/web/no-deck-back.svg');
  });
});

describe('browse page', () => {
  test('lists the page newest first and owns up to a full page, without deriving membership', async () => {
    const t = applicationTest();
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
    /* Deck membership left this payload with the tile's meta line (Norbert, 2026-08-21): a browse entry is the listing shape plus member previews, nothing derived. */
    expect(cards.entries.map((entry) => entry.slug)).toEqual(['orphan', 'lasgun']);
    expect(cards.truncated).toBe(false);

    const decks = await t.query(api.assets.browsePage, { type: 'deck' });
    expect(decks.entries.map((entry) => entry.slug)).toEqual(['house-treachery']);
  });
});
