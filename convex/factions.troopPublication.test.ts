/* @vitest-environment edge-runtime */
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

const back = {
  name: 'Elite side',
  image: '/vector/troop/fremen.svg' as const,
  description: 'The flipped side',
  striped: true,
};

async function troopFixture(revision: number | undefined) {
  const { t, owner } = await rulebookFixture();
  const { troops, ...rest } = structuredClone(assetPublishingFaction);
  /* The elite troop copies the regular one without its identity, so the save assigns it a new one. */
  const { troopId: _regularId, ...unidentified } = troops[0]!;
  const data = { ...rest, troops: [troops[0]!, { ...unidentified, name: 'Elite troop', count: 3, back }] };
  const settingsId = await t.run(async (ctx) =>
    ctx.db.insert('admin_settings', {
      key: 'publication',
      publication_pickup_enabled: true,
      renderer_revisions: revision === undefined ? {} : { 'faction-troop': revision },
      updated_at: 1,
    })
  );
  const faction = await owner.mutation(api.factions.create, { data, group_id: null });
  const [regular, elite] = faction.data.troops.map((troop) => troop.troopId!);
  const taken = async () =>
    (await t.mutation(internal.publicationJobs.takeWork, {})).items.filter(
      (item) => item.assetType === 'faction-troop'
    );
  return { t, owner, settingsId, faction, regular: regular!, elite: elite!, taken };
}

describe('Faction troop publication', () => {
  test('activation publishes each troop front, and the back only where one is authored', async () => {
    const { t, settingsId, faction, regular, elite, taken } = await troopFixture(undefined);
    expect(await taken()).toEqual([]);
    await t.run(async (ctx) => ctx.db.patch(settingsId, { renderer_revisions: { 'faction-troop': 1 } }));
    await t.mutation(internal.publicationRegeneration.scan, {
      assetType: 'faction-troop',
      cursor: null,
      scanned: 0,
      enqueued: 0,
    });
    const jobs = await taken();
    expect(jobs.map((job) => job.assetId).sort()).toEqual(
      [`${faction._id}.${regular}`, `${faction._id}.${elite}`, `${faction._id}.${elite}.back`].sort()
    );
    const eliteBack = jobs.find((job) => job.assetId === `${faction._id}.${elite}.back`)!;
    expect(await t.query(internal.publicationJobs.readJobForRender, { jobId: eliteBack.jobId })).toMatchObject({
      assetType: 'faction-troop',
      payload: { image: back.image, striped: true, background: assetPublishingFaction.background },
    });
  });

  test('only a changed side enqueues, and a dropped back or troop loses its pending work', async () => {
    const { t, owner, faction, elite, taken } = await troopFixture(1);
    const stored = async () => (await t.run(async (ctx) => ctx.db.get(faction._id)))!.data as typeof faction.data;
    for (const job of await taken()) {
      await t.mutation(internal.publicationJobs.completeJob, { jobId: job.jobId, cacheToken: 'troop-1' });
    }

    const [first, second] = faction.data.troops;
    await owner.mutation(api.factions.update, {
      id: faction._id,
      data: { ...faction.data, troops: [{ ...first!, name: 'Renamed', count: 9 }, second!] },
    });
    expect(await taken()).toEqual([]);

    await owner.mutation(api.factions.update, {
      id: faction._id,
      data: { ...faction.data, troops: [first!, { ...second!, back: { ...back, hue: '#123456' } }] },
    });
    expect((await taken()).map((job) => job.assetId)).toEqual([`${faction._id}.${elite}.back`]);

    /* Artwork edits leave pending work, then the edit that drops the back and the regular troop supersedes it. */
    const current = await stored();
    await owner.mutation(api.factions.update, {
      id: faction._id,
      data: {
        ...current,
        troops: [
          { ...current.troops[0]!, image: '/vector/troop/harkonnen.svg' },
          { ...current.troops[1]!, back: { ...back, hue: '#654321' } },
        ],
      },
    });
    const edited = await stored();
    const { back: _dropped, ...eliteOnly } = edited.troops[1]!;
    await owner.mutation(api.factions.update, { id: faction._id, data: { ...edited, troops: [eliteOnly] } });
    expect(await taken()).toEqual([]);
  });

  test('dropping one troop leaves a sibling pending, and a troop removed mid-capture never publishes', async () => {
    const { t, owner, faction, regular, elite, taken } = await troopFixture(1);
    const eliteFront = `${faction._id}.${elite}`;
    const [inFlight] = (await taken()).filter((job) => job.assetId === `${faction._id}.${regular}`);
    await t.run(async (ctx) => {
      for (const job of await ctx.db.query('publication_jobs').collect()) {
        if (job.asset_id !== inFlight!.assetId && job.status === 'in_progress') {
          await ctx.db.patch(job._id, { status: 'pending', expires_at: undefined });
        }
      }
    });

    const [, second] = faction.data.troops;
    await owner.mutation(api.factions.update, {
      id: faction._id,
      data: { ...faction.data, troops: [{ ...second!, image: '/vector/troop/harkonnen.svg' }] },
    });
    expect(
      await t.mutation(internal.publicationJobs.completeJob, { jobId: inFlight!.jobId, cacheToken: 'orphan' })
    ).toEqual({
      status: 'missing',
    });
    expect(await t.query(api.playCatalogue.factionDefinition, { factionId: faction._id })).toMatchObject({
      troops: [{ troopId: elite, front: null }],
    });
    expect((await taken()).map((job) => job.assetId).sort()).toEqual([eliteFront, `${eliteFront}.back`].sort());
  });

  test('a game reads each troop front, and a back only where one has published', async () => {
    const { t, faction, regular, elite, taken } = await troopFixture(1);
    for (const job of await taken()) {
      if (!job.assetId.endsWith('.back')) {
        await t.mutation(internal.publicationJobs.completeJob, { jobId: job.jobId, cacheToken: 'troop-1' });
      }
    }
    const definition = await t.query(api.playCatalogue.factionDefinition, { factionId: faction._id });
    expect(definition?.troops).toEqual([
      {
        troopId: regular,
        front: `/published/faction-troops/${faction._id}.${regular}/troop.jpg?v=troop-1`,
        back: null,
      },
      { troopId: elite, front: `/published/faction-troops/${faction._id}.${elite}/troop.jpg?v=troop-1`, back: null },
    ]);
  });
});
