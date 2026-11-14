/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { variantsFixture } from './factionVariants.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Links a variant to a ruleset through the triggers, creating the ruleset first when it is new. */
async function linkRuleset(
  t: Awaited<ReturnType<typeof variantsFixture>>['t'],
  factionId: Id<'factions'>,
  slug: string
) {
  await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const ownerId = (await ctx.db.get(factionId))!.owner_id;
    const existing = await ctx.db
      .query('rulesets')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .first();
    const rulesetId =
      existing?._id ??
      (await ctx.db.insert('rulesets', {
        name: slug,
        slug,
        about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
        created_at: '2026-11-13T00:00:00.000Z',
        updated_at: '2026-11-13T00:00:00.000Z',
        owner_id: ownerId,
        group_id: null,
        is_deleted: false,
        image_cover: null,
      }));
    await ctx.db.insert('ruleset_factions', { ruleset_id: rulesetId, faction_id: factionId, position: 0 });
  });
}

describe('the catalogue lists factions, not variants (#2929)', () => {
  test('a faction with three variants is one card, counting three, that opens the faction', async () => {
    const { t, root, addVariant } = await variantsFixture();
    await addVariant('Second');
    await addVariant('Third');

    const catalogue = await t.query(api.factions.catalogue, {});
    expect(catalogue).toMatchObject({ total: 1, catalogueTotal: 1 });
    expect(catalogue.cards).toMatchObject([{ _id: root._id, slug: 'atreides', variantCount: 3 }]);
  });

  test('filtered by a ruleset that links only the second variant, the card opens that variant', async () => {
    const { t, addVariant } = await variantsFixture();
    const second = await addVariant('Second');
    await addVariant('Third');
    await linkRuleset(t, second.id, 'house-rules');

    const filtered = await t.query(api.factions.catalogue, { ruleset: 'house-rules' });
    expect(filtered.cards.map((card) => card.slug)).toEqual([second.slug]);
    expect(filtered.rulesets.find((ruleset) => ruleset.slug === 'house-rules')?.factionCount).toBe(1);
    expect((await t.query(api.factions.catalogue, {})).cards.map((card) => card.slug)).toEqual(['atreides']);
  });

  test('a search by a variant’s name finds its faction’s card', async () => {
    const { t, addVariant } = await variantsFixture();
    await addVariant('Dreamrules');

    const found = await t.query(api.factions.catalogue, { q: 'dreamrules' });
    expect(found.cards.map((card) => card.slug)).toEqual(['atreides']);
  });

  test('a new variant makes its faction freshly updated, never a new arrival', async () => {
    const { t, addVariant } = await variantsFixture();
    vi.setSystemTime(Date.now() + 60_000);
    await addVariant('Later');

    const { spotlights } = await t.query(api.factions.catalogue, {});
    expect(spotlights.newArrival?.slug).toBe('atreides');
    expect(spotlights.freshlyUpdated).toBeNull();
  });
});
