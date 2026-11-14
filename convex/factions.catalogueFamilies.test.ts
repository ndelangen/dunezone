/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
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
  test('a faction with three variants is one card, counting three, that opens its default variant', async () => {
    const { t, root, addVariant } = await variantsFixture();
    await addVariant('Second');
    await addVariant('Third');

    const catalogue = await t.query(api.factions.catalogue, {});
    expect(catalogue).toMatchObject({ total: 1, catalogueTotal: 1 });
    expect(catalogue.cards).toMatchObject([{ _id: root._id, slug: 'atreides-original', variantCount: 3 }]);
  });

  test('filtered by a ruleset that links only the second variant, the card opens that variant', async () => {
    const { t, addVariant } = await variantsFixture();
    const second = await addVariant('Second');
    await addVariant('Third');
    await linkRuleset(t, second.id, 'house-rules');

    const filtered = await t.query(api.factions.catalogue, { ruleset: 'house-rules' });
    expect(filtered.cards).toMatchObject([{ _id: second.id, slug: second.slug, variantCount: 3 }]);
    expect(filtered.rulesets.find((ruleset) => ruleset.slug === 'house-rules')?.factionCount).toBe(1);
    expect((await t.query(api.factions.catalogue, {})).cards.map((card) => card.slug)).toEqual(['atreides-original']);
  });

  test('a search by a variant’s name finds its faction’s card', async () => {
    const { t, addVariant } = await variantsFixture();
    await addVariant('Dreamrules');

    const found = await t.query(api.factions.catalogue, { q: 'dreamrules' });
    expect(found.cards.map((card) => card.slug)).toEqual(['atreides-original']);
  });

  test('a complexity filter finds a faction through its harder second variant, whatever the sort', async () => {
    const { t, root, addVariant, save } = await variantsFixture();
    await save(root._id, { ...assetPublishingFaction, complexity: { calculated: 0.2 } });
    const hard = await addVariant('Hard');
    await save(hard.id, { ...assetPublishingFaction, complexity: { calculated: 0.9 } });

    for (const sort of ['name', 'complexity-asc'] as const) {
      const page = await t.query(api.factions.catalogue, { complexity: '8-10', sort });
      expect(page.cards.map((card) => card.slug)).toEqual(['atreides-original']);
    }
    expect((await t.query(api.factions.catalogue, { complexity: '8-10', q: 'atreides' })).cards).toHaveLength(1);
  });

  test('a new variant makes its faction freshly updated, never a new arrival', async () => {
    const { t, owner, addVariant } = await variantsFixture();
    vi.setSystemTime(Date.now() + 60_000);
    await owner.mutation(api.factions.create, {
      data: { ...assetPublishingFaction, name: 'Fremen' },
      group_id: null,
    });
    vi.setSystemTime(Date.now() + 60_000);
    await addVariant('Later');

    const { spotlights } = await t.query(api.factions.catalogue, {});
    expect(spotlights.newArrival?.slug).toBe('fremen-original');
    expect(spotlights.freshlyUpdated?.slug).toBe('atreides-original');
  });
});
