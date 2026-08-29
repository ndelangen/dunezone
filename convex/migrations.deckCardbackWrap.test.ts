/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const now = '2026-08-21T00:00:00.000Z';

const REQUIRED = ['assets_deck_cardback_wrap_v1', 'assets_deck_cardback_wrap_verify_v1'];

const composition = {
  name: 'Treachery',
  image: '/vector/decal/amal.svg',
  imageOffset: [0, 0],
  imageScale: 1,
  background: {},
};

describe('the deck cardback wrap pair', () => {
  test('bare cardbacks gain the custom tag, tagged rows and other types pass untouched', async () => {
    const t = convexTest(schema, modules);
    migrationsTest.register(t);

    const ids = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Wrap owner' });
      const base = { owner_id: ownerId, group_id: null, is_deleted: false, created_at: now, updated_at: now };
      const deck = (slug: string, cardback: unknown) =>
        ctx.db.insert('assets', { ...base, type: 'deck', slug, data: { name: slug, about: '', cardback } });
      return {
        bare: await deck('bare', composition),
        wrapped: await deck('wrapped', { mode: 'custom', ...composition }),
        reference: await deck('reference', { mode: 'reference', asset_id: 'k000000000000000' }),
        card: await ctx.db.insert('assets', {
          ...base,
          type: 'card-treachery',
          slug: 'card',
          data: { name: 'C', cardback: composition },
        }),
      };
    });

    await t.mutation(internal.migrations.assets_deck_cardback_wrap_v1, {});
    await t.mutation(internal.migrations.assets_deck_cardback_wrap_verify_v1, {});

    await expect(t.query(internal.migrations.assertReadyForNarrow, { required: REQUIRED })).resolves.toMatchObject({
      ok: true,
    });

    await t.run(async (ctx) => {
      const cardbackOf = async (id: (typeof ids)['bare']) => {
        const row = await ctx.db.get('assets', id);
        return (row?.data as { cardback: unknown } | undefined)?.cardback;
      };
      expect(await cardbackOf(ids.bare)).toEqual({ mode: 'custom', ...composition });
      expect(await cardbackOf(ids.wrapped)).toEqual({ mode: 'custom', ...composition });
      expect(await cardbackOf(ids.reference)).toEqual({ mode: 'reference', asset_id: 'k000000000000000' });
      /* A card's data is not a deck's; the wrap must not tag look-alike keys on other types. */
      expect(await cardbackOf(ids.card)).toEqual(composition);
    });
  });

  test('the verify alone blocks the gate while a bare cardback remains', async () => {
    const t = convexTest(schema, modules);
    migrationsTest.register(t);

    await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Wrap owner' });
      await ctx.db.insert('assets', {
        owner_id: ownerId,
        group_id: null,
        is_deleted: false,
        created_at: now,
        updated_at: now,
        type: 'deck',
        slug: 'still-bare',
        data: { name: 'still-bare', about: '', cardback: composition },
      });
    });

    await t.mutation(internal.migrations.assets_deck_cardback_wrap_verify_v1, {});

    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: ['assets_deck_cardback_wrap_verify_v1'] })
    ).rejects.toThrow('Narrow blocked');
  });
});
