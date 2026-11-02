import { describe, expect, test } from 'vite-plus/test';

import { factionMemberPublicationId } from '../src/shared/asset-publishing/componentPublication';
import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { applicationTest } from './application.test.fixture';
import {
  enqueueFactionLeaderPublications,
  enqueueFactionTokenPublication,
  FACTION_TOKEN_BACK_REVISION,
} from './lib/publication';

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
  const retired = await faction('Retired', 'retired', { deleted: true });
  await ctx.db.insert('ruleset_factions', { ruleset_id: ruleset, faction_id: linked, position: 0 });
  await ctx.db.insert('ruleset_factions', { ruleset_id: ruleset, faction_id: broken, position: 1 });
  /* Fremen has only the front, and a game needs both faces of the reversible token. */
  for (const assetId of [linked, `${linked}.back`, other]) {
    await ctx.db.insert('publication_assets', {
      asset_type: 'faction-token',
      asset_id: assetId,
      cache_token: 'abc',
      published_at: 1,
    });
  }
  return { ruleset, linked, other, retired };
}

describe('the draft reads the catalogue', () => {
  test('returns render backgrounds for custom and preset-linked factions', async () => {
    const t = applicationTest();
    const { ruleset, linked, other } = await t.run(seed);
    const custom: typeof assetPublishingFaction.background = {
      ...assetPublishingFaction.background,
      colors: ['#98a0a6', '#2a7982'],
      source: { kind: 'custom' },
    };
    const preset: typeof assetPublishingFaction.background = {
      ...assetPublishingFaction.background,
      colors: ['#112233', '#445566'],
    };
    await t.run(async (ctx) => {
      await ctx.db.insert('background_presets', {
        key: 'draft-test',
        name: 'Draft test',
        value: preset,
        revision: 1,
        updated_at: 1,
      });
      await ctx.db.patch('factions', linked, { data: { ...assetPublishingFaction, background: custom } });
      await ctx.db.patch('factions', other, {
        data: {
          ...assetPublishingFaction,
          background: { ...assetPublishingFaction.background, source: { kind: 'preset', key: 'draft-test' } },
        },
      });
    });

    const { factions } = await t.query(api.playCatalogue.draftableFactions, { rulesetId: ruleset });
    expect(factions.find((faction) => faction.id === linked)?.background).toEqual({
      ...assetPublishingFaction.background,
      colors: custom.colors,
    });
    expect(factions.find((faction) => faction.id === other)?.background).toEqual(preset);
    expect(await t.run((ctx) => ctx.db.get('factions', linked))).toMatchObject({
      data: { background: custom },
    });
  });

  test('lists every live faction that parses, with its ruleset link and whether both token faces are published', async () => {
    const t = applicationTest();
    const { ruleset, linked, other } = await t.run(seed);
    const { factions } = await t.query(api.playCatalogue.draftableFactions, { rulesetId: ruleset });
    const byId = (first: readonly unknown[], second: readonly unknown[]) =>
      String(first[0]).localeCompare(String(second[0]));
    expect(factions.map((faction) => [faction.id, faction.linked, faction.published]).sort(byId)).toEqual(
      [
        [linked, true, true],
        [other, false, false],
      ].sort(byId)
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
    const t = applicationTest();
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
    const t = applicationTest();
    await t.run(seed);
    const { factions } = await t.query(api.playCatalogue.draftableFactions, { rulesetId: 'nowhere' as Id<'rulesets'> });
    expect(factions).toHaveLength(2);
    expect(factions.every((faction) => !faction.linked)).toBe(true);
  });

  test('a draft with 220 KiB of linked faction text stays below a 384 KiB read budget', async () => {
    const t = applicationTest();
    const { ruleset, linked, other } = await t.run(seed);
    await t.run((ctx) =>
      ctx.db.patch('factions', linked, {
        data: {
          ...assetPublishingFaction,
          rules: { ...assetPublishingFaction.rules, startText: 'x'.repeat(220 * 1024) },
        },
      })
    );
    const answer = await t.run((ctx) =>
      ctx.runQuery(
        api.playCatalogue.draftableFactions,
        { rulesetId: ruleset },
        { transactionLimits: { bytesRead: 384 * 1024 } }
      )
    );
    expect(answer.factions.map((faction) => faction.id)).toEqual([linked, other]);
  });

  test('a ruleset faction created after the first 500 live factions is still listed', async () => {
    const t = applicationTest();
    const { ruleset, linked, other, retired } = await t.run(seed);
    const late = await t.run(async (ctx) => {
      const owner = (await ctx.db.query('users').first())!._id;
      const stamp = { created_at: '2026-09-19T00:00:00.000Z', updated_at: '2026-09-19T00:00:00.000Z' };
      for (let index = 0; index < 500; index += 1) {
        await ctx.db.insert('factions', {
          owner_id: owner,
          slug: `filler-${index}`,
          data: { ...assetPublishingFaction, name: `Filler ${index}` },
          group_id: null,
          is_deleted: false,
          ...stamp,
        });
      }
      const id = await ctx.db.insert('factions', {
        owner_id: owner,
        slug: 'late',
        data: { ...assetPublishingFaction, name: 'Late' },
        group_id: null,
        is_deleted: false,
        ...stamp,
      });
      await ctx.db.insert('ruleset_factions', { ruleset_id: ruleset, faction_id: id, position: 2 });
      await ctx.db.insert('ruleset_factions', { ruleset_id: ruleset, faction_id: retired, position: 3 });
      const missing = await ctx.db.insert('factions', {
        owner_id: owner,
        slug: 'missing',
        data: assetPublishingFaction,
        group_id: null,
        is_deleted: false,
        ...stamp,
      });
      await ctx.db.delete('factions', missing);
      await ctx.db.insert('ruleset_factions', { ruleset_id: ruleset, faction_id: missing, position: 4 });
      return id;
    });
    const { factions } = await t.query(api.playCatalogue.draftableFactions, { rulesetId: ruleset });
    expect(factions.find((faction) => faction.id === late)).toMatchObject({ linked: true });
    expect(factions[0]).toMatchObject({ id: linked, linked: true });
    expect(factions.at(-1)).toMatchObject({ id: late, linked: true });
    expect(factions.some((faction) => faction.id === other)).toBe(false);
    /* The live but invalid linked faction still occupies its original slot, so the same 499 valid rows remain. */
    expect(factions).toHaveLength(499);
  });

  test('500 live linked factions leave no slot for a newer unlinked faction', async () => {
    const t = applicationTest();
    const { ruleset, linked, other } = await t.run(seed);
    await t.run(async (ctx) => {
      const source = (await ctx.db.get('factions', linked))!;
      const { _id: _sourceId, _creationTime: _created, ...fields } = source;
      for (let index = 0; index < 498; index += 1) {
        const id = await ctx.db.insert('factions', { ...fields, slug: `linked-${index}` });
        await ctx.db.insert('ruleset_factions', { ruleset_id: ruleset, faction_id: id, position: index + 2 });
      }
      await ctx.db.insert('factions', { ...fields, slug: 'newer-unlinked' });
    });
    const { factions } = await t.query(api.playCatalogue.draftableFactions, { rulesetId: ruleset });
    expect(factions).toHaveLength(499);
    expect(factions.every((faction) => faction.linked)).toBe(true);
    expect(factions.some((faction) => faction.id === other || faction.slug === 'newer-unlinked')).toBe(false);
  });
});
