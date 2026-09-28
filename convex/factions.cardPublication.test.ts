/* @vitest-environment edge-runtime */
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { rulebookFixture } from './rulebooks.test.fixture';

const CARD_TYPES = ['faction-traitor', 'faction-alliance'];

async function cardFixture(active: boolean) {
  const { t, owner } = await rulebookFixture();
  const settingsId = await t.run(async (ctx) =>
    ctx.db.insert('admin_settings', {
      key: 'publication',
      publication_pickup_enabled: true,
      renderer_revisions: active ? { 'faction-traitor': 1, 'faction-alliance': 1 } : {},
      updated_at: 1,
    })
  );
  const faction = await owner.mutation(api.factions.create, {
    data: structuredClone(assetPublishingFaction),
    group_id: null,
  });
  const memberIds = faction.data.leaders.map((leader) => leader.memberId!);
  /* Sheets, tokens and Leaders enqueue on the same saves; they are cleared so the pickup window holds only cards. */
  const taken = async () => {
    await t.run(async (ctx) => {
      for (const job of await ctx.db.query('publication_jobs').collect()) {
        if (!CARD_TYPES.includes(job.asset_type)) {
          await ctx.db.delete(job._id);
        }
      }
    });
    return (await t.mutation(internal.publicationJobs.takeWork, {})).items;
  };
  const complete = async (jobs?: { jobId: Id<'publication_jobs'> }[]) => {
    for (const job of jobs ?? (await taken())) {
      await t.mutation(internal.publicationJobs.completeJob, { jobId: job.jobId, cacheToken: 'card-1' });
    }
  };
  return { t, owner, settingsId, faction, memberIds, taken, complete };
}

describe('Faction card publication', () => {
  test('activation publishes a traitor front per supporting leader and one alliance front', async () => {
    const { t, settingsId, faction, memberIds, taken } = await cardFixture(false);
    expect(await taken()).toEqual([]);
    await t.run(async (ctx) =>
      ctx.db.patch(settingsId, { renderer_revisions: { 'faction-traitor': 1, 'faction-alliance': 1 } })
    );
    for (const assetType of CARD_TYPES) {
      await t.mutation(internal.publicationRegeneration.scan, { assetType, cursor: null, scanned: 0, enqueued: 0 });
    }
    const jobs = await taken();
    expect(jobs.map((job) => `${job.assetType}:${job.assetId}`).sort()).toEqual(
      [
        ...memberIds.map((memberId) => `faction-traitor:${faction._id}.${memberId}`),
        `faction-alliance:${faction._id}`,
      ].sort()
    );
    const [leader] = faction.data.leaders;
    const traitor = jobs.find((job) => job.assetId === `${faction._id}.${leader!.memberId}`)!;
    expect(await t.query(internal.publicationJobs.readJobForRender, { jobId: traitor.jobId })).toMatchObject({
      assetType: 'faction-traitor',
      payload: { name: leader!.name, image: leader!.image, owner: assetPublishingFaction.name },
    });
    const alliance = jobs.find((job) => job.assetType === 'faction-alliance')!;
    expect(await t.query(internal.publicationJobs.readJobForRender, { jobId: alliance.jobId })).toMatchObject({
      assetType: 'faction-alliance',
      payload: {
        title: assetPublishingFaction.name,
        text: assetPublishingFaction.rules.alliance.text,
        troop: assetPublishingFaction.troops[0]!.image,
      },
    });
  });

  test('only drawn changes enqueue, and a renamed faction redraws every card', async () => {
    const { owner, faction, memberIds, taken, complete } = await cardFixture(true);
    await complete();

    const [first, ...rest] = faction.data.leaders;
    const withRenamedLeader = { ...faction.data, leaders: [{ ...first!, name: 'Renamed' }, ...rest] };
    await owner.mutation(api.factions.update, { id: faction._id, data: withRenamedLeader });
    const renamed = await taken();
    expect(renamed.map((job) => job.assetId)).toEqual([`${faction._id}.${memberIds[0]}`]);
    await complete(renamed);

    await owner.mutation(api.factions.update, {
      id: faction._id,
      data: { ...withRenamedLeader, rules: { ...faction.data.rules, alliance: { text: 'New alliance text' } } },
    });
    const alliance = await taken();
    expect(alliance.map((job) => job.assetType)).toEqual(['faction-alliance']);
    await complete(alliance);

    await owner.mutation(api.factions.update, {
      id: faction._id,
      data: { ...withRenamedLeader, rules: faction.data.rules, name: 'Renamed faction' },
    });
    expect((await taken()).map((job) => job.assetType).sort()).toEqual(
      [...memberIds.map(() => 'faction-traitor'), 'faction-alliance'].sort()
    );
  });

  test('a leader removed mid-capture never publishes its traitor front, and a game reads the rest', async () => {
    const { t, owner, faction, memberIds, taken } = await cardFixture(true);
    const jobs = await taken();
    const [, ...rest] = faction.data.leaders;
    await owner.mutation(api.factions.update, { id: faction._id, data: { ...faction.data, leaders: rest } });
    const results = [];
    for (const job of jobs) {
      results.push(
        (await t.mutation(internal.publicationJobs.completeJob, { jobId: job.jobId, cacheToken: 'card-1' })).status
      );
    }
    expect(results.filter((status) => status === 'missing')).toHaveLength(1);
    const definition = await t.query(api.playCatalogue.factionDefinition, { factionId: faction._id });
    expect(definition?.traitors).toEqual(
      memberIds.slice(1).map((memberId) => ({
        memberId,
        front: `/published/traitor-cards/${faction._id}.${memberId}/card.jpg?v=card-1`,
      }))
    );
    expect(definition?.alliance).toBe(`/published/alliance-cards/${faction._id}/card.jpg?v=card-1`);
  });

  test('a soft-deleted faction drops its pending card work', async () => {
    const { t, owner, faction, taken } = await cardFixture(true);
    await t.run(async (ctx) => {
      for (const job of await ctx.db.query('publication_jobs').collect()) {
        await ctx.db.patch(job._id, { status: 'pending', expires_at: undefined });
      }
    });
    await owner.mutation(api.factions.softDelete, { id: faction._id });
    expect(await taken()).toEqual([]);
  });
});
