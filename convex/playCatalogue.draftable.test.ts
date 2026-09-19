import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function seed(ctx: MutationCtx) {
  const owner = await ctx.db.insert('users', { account_state: 'active', name: 'Author', isAdmin: false });
  const stamp = { created_at: '2026-09-19T00:00:00.000Z', updated_at: '2026-09-19T00:00:00.000Z' };
  const ruleset = await ctx.db.insert('rulesets', {
    name: 'Classic',
    slug: 'classic',
    about: '',
    owner_id: owner,
    group_id: null,
    is_deleted: false,
    image_cover: null,
    ...stamp,
  });
  const faction = async (name: string, slug: string, options: { deleted?: boolean; broken?: boolean } = {}) =>
    ctx.db.insert('factions', {
      owner_id: owner,
      slug,
      data: options.broken ? { name } : { ...assetPublishingFaction, name },
      group_id: null,
      is_deleted: options.deleted ?? false,
      ...stamp,
    });
  const linked = await faction('Atreides', 'atreides');
  const other = await faction('Fremen', 'fremen');
  const broken = await faction('Broken', 'broken', { broken: true });
  await faction('Retired', 'retired', { deleted: true });
  await ctx.db.insert('ruleset_factions', { ruleset_id: ruleset, faction_id: linked });
  await ctx.db.insert('ruleset_factions', { ruleset_id: ruleset, faction_id: broken });
  await ctx.db.insert('publication_assets', {
    asset_type: 'faction-token',
    asset_id: linked,
    cache_token: 'abc',
    published_at: 1,
  });
  return { ruleset, linked, other };
}

describe('the draft reads the catalogue', () => {
  test('lists every live faction that parses, with its ruleset link and whether its token is published', async () => {
    const t = convexTest(schema, modules);
    const { ruleset, linked, other } = await t.run(seed);
    const { factions } = await t.query(api.playCatalogue.draftableFactions, { rulesetId: ruleset });
    expect(factions.map((faction) => [faction.id, faction.linked, faction.published]).sort()).toEqual(
      [
        [linked, true, true],
        [other, false, false],
      ].sort()
    );
    const atreides = factions.find((faction) => faction.id === linked)!;
    expect(atreides).toMatchObject({
      slug: 'atreides',
      name: 'Atreides',
      logo: assetPublishingFaction.logo,
      background: assetPublishingFaction.background,
      color: assetPublishingFaction.themeColor,
    });
  });

  test('an unknown ruleset links nothing and still lists the factions', async () => {
    const t = convexTest(schema, modules);
    await t.run(seed);
    const { factions } = await t.query(api.playCatalogue.draftableFactions, { rulesetId: 'nowhere' as Id<'rulesets'> });
    expect(factions).toHaveLength(2);
    expect(factions.every((faction) => !faction.linked)).toBe(true);
  });
});
