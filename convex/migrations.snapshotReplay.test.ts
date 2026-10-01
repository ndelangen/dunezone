/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, describe, expect, test, vi } from 'vitest';
import type { z } from 'zod';

import { placeholderOwner } from '../scripts/lib/snapshot-policy';
import { publishingDeckCardback } from '../src/shared/assets/fixtures/publishingDeckCardback';
import { publishingTokenFace } from '../src/shared/assets/fixtures/publishingTokenFace';
import type { DeckAsset, TokenAsset } from '../src/shared/assets/schema';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import { factionTest } from './factions.test.fixture';
import guards from './migration-guards.json';

/** The migrations `migration-guards.ts dev-strict` starts after every snapshot load, in the order it starts them. */
const required = guards.entries
  .filter((entry) => entry.phase === 'widen')
  .map((entry) => entry.id)
  .sort();

const STAMP = '2026-10-01T00:00:00.000Z';

/**
 * One stored value per member of a tagged union, keyed by its mode.
 * A mode added to the schema fails typecheck here until the replay has a row wearing it.
 */
type OnePerMode<T extends { mode: string }> = { [M in T['mode']]: Extract<T, { mode: M }> };

/* `authored` is the row each reference names. */
const cardbacks = (authored: string) =>
  ({
    custom: { mode: 'custom', ...publishingDeckCardback },
    preset: { mode: 'preset', key: 'spice' },
    reference: { mode: 'reference', asset_id: authored },
  }) satisfies OnePerMode<Extract<z.infer<typeof DeckAsset>['cardback'], { mode: string }>>;

const tokenBacks = (authored: string) =>
  ({
    custom: { mode: 'custom', face: publishingTokenFace },
    same: { mode: 'same' },
    reference: { mode: 'reference', asset_id: authored },
  }) satisfies OnePerMode<z.infer<typeof TokenAsset>['back']>;

/* A decal the vector-train retune scaled by 1.5625 in production, stored at its retuned scale. */
const retunedDecal = {
  id: '/vector/decal/carryalls.svg',
  muted: false,
  outline: false,
  scale: 0.5,
  offset: [0, 0],
};

afterEach(() => vi.useRealTimers());

describe('a snapshot load', () => {
  test('replays every required migration over rows production already migrated, changing none and rebuilding the aggregates', async () => {
    vi.useFakeTimers();
    const t = factionTest();

    /* Rows go in through the raw database, the way the import writes them: no trigger runs, so every aggregate starts empty. */
    const ids = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', placeholderOwner.user());
      await ctx.db.insert('profiles', placeholderOwner.profile(ownerId));
      const owned = { owner_id: ownerId, group_id: null, is_deleted: false, created_at: STAMP, updated_at: STAMP };
      const asset = (type: string, slug: string, data: Record<string, unknown>) =>
        ctx.db.insert('assets', { ...owned, type, slug, data: { name: slug, about: '', ...data } });
      const deck = await asset('deck', 'authored-deck', { cardback: { mode: 'custom', ...publishingDeckCardback } });
      const token = await asset('token-disc', 'authored-token', {
        front: publishingTokenFace,
        back: { mode: 'custom', face: publishingTokenFace },
      });
      const modeRows = [
        ...Object.entries(cardbacks(deck)).map(([mode, cardback]) => asset('deck', `deck-${mode}`, { cardback })),
        ...Object.entries(tokenBacks(token)).map(([mode, back]) =>
          asset('token-disc', `token-${mode}`, { front: publishingTokenFace, back })
        ),
      ];
      return [
        deck,
        token,
        ...(await Promise.all(modeRows)),
        await ctx.db.insert('factions', {
          ...owned,
          slug: 'retuned',
          data: { ...assetPublishingFaction, decals: [retunedDecal] },
        }),
      ];
    });
    const rows = () => t.run((ctx) => Promise.all(ids.map((id) => ctx.db.get(id))));
    const loaded = await rows();

    await t.mutation(internal.migrations.runRequired, { ids: required });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await expect(t.query(internal.migrations.assertReadyForNarrow, { required })).resolves.toMatchObject({ ok: true });
    expect(await rows()).toEqual(loaded);
    expect((await t.query(api.homepage.get, {})).community.counts).toMatchObject({ factions: 1, members: 1 });
  });
});
