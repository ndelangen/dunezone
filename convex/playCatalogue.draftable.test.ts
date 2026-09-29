import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { factionMemberPublicationId } from '../src/shared/asset-publishing/componentPublication';
import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import {
  enqueueFactionLeaderPublications,
  enqueueFactionTokenPublication,
  FACTION_TOKEN_BACK_REVISION,
} from './lib/publication';
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
  /* Fremen has only the front, and a game needs both faces of the reversible token. */
  for (const assetId of [linked, `${linked}.back`, other]) {
    await ctx.db.insert('publication_assets', {
      asset_type: 'faction-token',
      asset_id: assetId,
      cache_token: 'abc',
      published_at: 1,
    });
  }
  return { ruleset, linked, other };
}

describe('the draft reads the catalogue', () => {
  test('lists every live faction that parses, with its ruleset link and whether both token faces are published', async () => {
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

  test('a faction becomes published once its token back completes, and its leader front reads once that face completes', async () => {
    const t = convexTest(schema, modules);
    const { ruleset, other } = await t.run(seed);
    const memberId = assetPublishingFaction.leaders[0].memberId;
    const leaderAssetId = factionMemberPublicationId(other, memberId);
    const fremen = async () =>
      (await t.query(api.playCatalogue.draftableFactions, { rulesetId: ruleset })).factions.find(
        (faction) => faction.id === other
      )!;
    const leaderFront = async () =>
      (await t.query(api.playCatalogue.factionDefinition, { factionId: other }))!.leaders.find(
        (leader) => leader.memberId === memberId
      )!.front;
    expect((await fremen()).published).toBe(false);
    expect(await leaderFront()).toBeNull();

    /* The publisher is active for both faces, so the faction's saved data queues their jobs. */
    await t.run(async (ctx) => {
      await ctx.db.insert('admin_settings', {
        key: 'publication',
        publication_pickup_enabled: true,
        renderer_revisions: { 'faction-token': FACTION_TOKEN_BACK_REVISION, 'faction-leader': 1 },
        updated_at: 1,
      });
      const row = (await ctx.db.get(other))!;
      await enqueueFactionTokenPublication(ctx, row);
      await enqueueFactionLeaderPublications(ctx, row);
    });
    const { items } = await t.mutation(internal.publicationJobs.takeWork, {});
    const back = items.find((item) => item.assetId === `${other}.back`)!;
    const leader = items.find((item) => item.assetId === leaderAssetId)!;

    /* Completing the back adds the missing publication row, and the draft now counts the faction as published. */
    expect(
      await t.mutation(internal.publicationJobs.completeJob, { jobId: back.jobId, cacheToken: 'back-one' })
    ).toMatchObject({ status: 'completed' });
    expect((await fremen()).published).toBe(true);
    expect(await leaderFront()).toBeNull();

    /* The leader face completes through the same path, and the definition a game captures reads its address. */
    const revision = '10000000-1000-4000-8000-100000000001';
    const { payloadHash } = (await t.query(internal.publicationJobs.readJobForRender, { jobId: leader.jobId }))!;
    expect(
      await t.mutation(internal.publicationJobs.completeJob, { jobId: leader.jobId, cacheToken: revision, payloadHash })
    ).toMatchObject({ status: 'completed' });
    expect(await leaderFront()).toBe(publishedHref('faction-leader', leaderAssetId, revision));
  });

  test('an unknown ruleset links nothing and still lists the factions', async () => {
    const t = convexTest(schema, modules);
    await t.run(seed);
    const { factions } = await t.query(api.playCatalogue.draftableFactions, { rulesetId: 'nowhere' as Id<'rulesets'> });
    expect(factions).toHaveLength(2);
    expect(factions.every((faction) => !faction.linked)).toBe(true);
  });
});
