/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const now = '2026-08-21T00:00:00.000Z';

const REQUIRED = ['assets_back_modes_v1', 'asset_relations_token_back_drop_v1', 'assets_back_modes_verify_v1'];

describe('the back-modes widen, drop, and verify trio', () => {
  test('honored references gain their target in data, every invalid class becomes same, and the relation rows drop', async () => {
    const t = convexTest(schema, modules);
    migrationsTest.register(t);

    const ids = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Back owner' });
      const base = { owner_id: ownerId, group_id: null, is_deleted: false, created_at: now, updated_at: now };
      const token = (slug: string, back: unknown, extra?: Partial<{ type: string; is_deleted: boolean }>) =>
        ctx.db.insert('assets', {
          ...base,
          type: extra?.type ?? 'token-disc',
          is_deleted: extra?.is_deleted ?? false,
          slug,
          data: { name: slug, about: '', front: {}, back },
        });

      const targetAuthored = await token('target-authored', { mode: 'custom', face: {} });
      const targetDeleted = await token('target-deleted', { mode: 'custom', face: {} }, { is_deleted: true });
      const targetWrongType = await token('target-wrong-type', { mode: 'custom', face: {} }, { type: 'token-tech' });
      const targetUnauthored = await token('target-unauthored', { mode: 'reference' });

      const refValid = await token('ref-valid', { mode: 'reference' });
      const refDeleted = await token('ref-deleted', { mode: 'reference' });
      const refWrongType = await token('ref-wrong-type', { mode: 'reference' });
      const refUnauthored = await token('ref-unauthored', { mode: 'reference' });
      const refNoRelation = await token('ref-no-relation', { mode: 'reference' });
      const custom = await token('stays-custom', { mode: 'custom', face: { kept: true } });

      const relate = (from: typeof refValid, to: typeof refValid) =>
        ctx.db.insert('asset_relations', { from_asset_id: from, to_asset_id: to, kind: 'token-back', count: 1 });
      await relate(refValid, targetAuthored);
      await relate(refDeleted, targetDeleted);
      await relate(refWrongType, targetWrongType);
      await relate(refUnauthored, targetUnauthored);

      /* A deck membership rides along to prove the drop touches only its own kind. */
      const deck = await ctx.db.insert('assets', { ...base, type: 'deck', slug: 'deck', data: { name: 'Deck' } });
      const card = await ctx.db.insert('assets', {
        ...base,
        type: 'card-treachery',
        slug: 'card',
        data: { name: 'C' },
      });
      const membership = await ctx.db.insert('asset_relations', {
        from_asset_id: deck,
        to_asset_id: card,
        kind: 'deck-card',
        count: 3,
      });

      return { targetAuthored, refValid, refDeleted, refWrongType, refUnauthored, refNoRelation, custom, membership };
    });

    await t.mutation(internal.migrations.assets_back_modes_v1, {});
    await t.mutation(internal.migrations.asset_relations_token_back_drop_v1, {});
    await t.mutation(internal.migrations.assets_back_modes_verify_v1, {});

    /*
     * The deploy gate is the honest observer: the runner records per-row throws as state rather than
     * rejecting the mutation, so a verify that failed shows up here and nowhere else.
     */
    await expect(t.query(api.migrations.assertReadyForNarrow, { required: REQUIRED })).resolves.toMatchObject({
      ok: true,
    });

    await t.run(async (ctx) => {
      const backOf = async (id: (typeof ids)['refValid']) => {
        const row = await ctx.db.get('assets', id);
        return (row?.data as { back: unknown } | undefined)?.back;
      };
      expect(await backOf(ids.refValid)).toEqual({ mode: 'reference', asset_id: ids.targetAuthored });
      expect(await backOf(ids.refDeleted)).toEqual({ mode: 'same' });
      expect(await backOf(ids.refWrongType)).toEqual({ mode: 'same' });
      expect(await backOf(ids.refUnauthored)).toEqual({ mode: 'same' });
      expect(await backOf(ids.refNoRelation)).toEqual({ mode: 'same' });
      expect(await backOf(ids.custom)).toEqual({ mode: 'custom', face: { kept: true } });

      const relations = await ctx.db.query('asset_relations').take(100);
      expect(relations.map((row) => row.kind)).toEqual(['deck-card']);
      expect(relations[0]?._id).toBe(ids.membership);
    });
  });

  test('the verify alone blocks the gate while a legacy reference remains', async () => {
    const t = convexTest(schema, modules);
    migrationsTest.register(t);

    await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Back owner' });
      await ctx.db.insert('assets', {
        owner_id: ownerId,
        group_id: null,
        is_deleted: false,
        created_at: now,
        updated_at: now,
        type: 'token-disc',
        slug: 'legacy',
        data: { name: 'legacy', about: '', front: {}, back: { mode: 'reference' } },
      });
    });

    await t.mutation(internal.migrations.assets_back_modes_verify_v1, {});

    await expect(t.query(api.migrations.assertReadyForNarrow, { required: REQUIRED })).rejects.toThrow(
      'Narrow blocked'
    );
  });
});
