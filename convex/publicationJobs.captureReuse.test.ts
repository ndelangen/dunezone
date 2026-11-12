// @vitest-environment edge-runtime

import type { FunctionReturnType } from 'convex/server';
import { describe, expect, test } from 'vite-plus/test';

import { ensureFactionComponentIds } from '../src/shared/factions/componentIdentity';
import { assetPublishingFaction as legacyFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import { applicationTest } from './application.test.fixture';

const assetPublishingFaction = ensureFactionComponentIds(legacyFaction);
const REVISIONS = { 'faction-leader': 1, 'faction-troop': 1, 'faction-traitor': 1, 'faction-alliance': 1 };
const LEADER_REVISION = '00000000-0000-4000-8000-000000000001';

type Item = FunctionReturnType<typeof internal.publicationJobs.takeWork>['items'][number];

async function reuseFixture() {
  const t = applicationTest();
  const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Capture reuse author' }));
  const owner = t.withIdentity({ subject: ownerId });
  const settingsId = await t.run(
    async (ctx) =>
      await ctx.db.insert('admin_settings', {
        key: 'publication',
        publication_pickup_enabled: true,
        renderer_revisions: REVISIONS,
        updated_at: 1,
      })
  );
  /* Every job of one pickup, read until the queue is empty, so a faction's whole roster is in hand. */
  const takeAll = async () => {
    const items: Item[] = [];
    for (;;) {
      const batch = await t.mutation(internal.publicationJobs.takeWork, {});
      if (batch.items.length === 0) {
        return items;
      }
      items.push(...batch.items);
    }
  };
  /* Completes a faction face the way the Worker does after a capture. */
  const complete = async (item: Item) => {
    if (item.assetType === 'faction-leader') {
      const render = await t.query(internal.publicationJobs.readJobForRender, { jobId: item.jobId });
      return await t.mutation(internal.publicationJobs.completeJob, {
        jobId: item.jobId,
        cacheToken: LEADER_REVISION,
        payloadHash: render!.payloadHash,
      });
    }
    return await t.mutation(internal.publicationJobs.completeJob, { jobId: item.jobId, cacheToken: FIRST_CAPTURE });
  };
  const create = async (name: string) =>
    await owner.mutation(api.factions.create, { data: { ...assetPublishingFaction, name }, group_id: null });
  const leaderPublication = async (assetId: string) =>
    await t.run(
      async (ctx) =>
        await ctx.db
          .query('publication_assets')
          .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'faction-leader').eq('asset_id', assetId))
          .unique()
    );
  return { t, settingsId, takeAll, complete, create, leaderPublication };
}

const FIRST_CAPTURE = 'first-capture';
const leaders = (items: Item[]) => items.filter((item) => item.assetType === 'faction-leader');
const troops = (items: Item[]) => items.filter((item) => item.assetType === 'faction-troop');
const traitors = (items: Item[]) => items.filter((item) => item.assetType === 'faction-traitor');
const alliances = (items: Item[]) => items.filter((item) => item.assetType === 'faction-alliance');
/* The same face of the first faction: asset ids lead with the faction's id. */
const firstFactionFace = (item: Item, ids: { first: string; second: string }) =>
  item.assetId.replace(ids.second, ids.first);

describe('Capture reuse by drawn content', () => {
  test('a second faction drawing the same leaders and troops copies the first one’s captures', async () => {
    const { takeAll, complete, create } = await reuseFixture();
    const first = await create('Atreides');
    for (const item of await takeAll()) {
      expect(item.reuse).toBeUndefined();
      await complete(item);
    }

    const second = await create('Atreides variant');
    const ids = { first: first._id, second: second._id };
    const items = await takeAll();
    expect(leaders(items).length).toBeGreaterThan(0);
    expect(troops(items).length).toBeGreaterThan(0);
    for (const item of leaders(items)) {
      expect(item.reuse).toMatchObject({
        assetId: firstFactionFace(item, ids),
        cacheToken: LEADER_REVISION,
        payloadHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
    }
    for (const item of troops(items)) {
      expect(item.reuse).toMatchObject({
        assetId: firstFactionFace(item, ids),
        cacheToken: FIRST_CAPTURE,
      });
    }
  });

  test('the reuse hash is the one the job’s own capture would report, so the copy completes', async () => {
    const { t, takeAll, complete, create, leaderPublication } = await reuseFixture();
    const first = await create('Atreides');
    for (const item of await takeAll()) {
      await complete(item);
    }
    await create('Atreides variant');
    const [leader] = leaders(await takeAll());
    const reuse = leader!.reuse!;
    const render = await t.query(internal.publicationJobs.readJobForRender, { jobId: leader!.jobId });
    expect(reuse.payloadHash).toBe(render!.payloadHash);

    expect(
      await t.mutation(internal.publicationJobs.completeJob, {
        jobId: leader!.jobId,
        cacheToken: '00000000-0000-4000-8000-000000000002',
        payloadHash: reuse.payloadHash,
      })
    ).toMatchObject({ status: 'completed' });
    const copied = await leaderPublication(leader!.assetId);
    const source = await leaderPublication(reuse.assetId);
    expect(copied?.content_key).toBeDefined();
    expect(copied?.content_key).toBe(source?.content_key);
    expect(reuse.assetId.startsWith(first._id)).toBe(true);
  });

  test('a traitor naming a different faction and the alliance card are never reused', async () => {
    const { takeAll, complete, create } = await reuseFixture();
    await create('Atreides');
    for (const item of await takeAll()) {
      await complete(item);
    }
    await create('Atreides variant');
    const items = await takeAll();
    expect(traitors(items).length).toBeGreaterThan(0);
    for (const item of [...traitors(items), ...alliances(items)]) {
      expect(item.reuse).toBeUndefined();
    }
  });

  test('a capture made under an older renderer revision is not reused', async () => {
    const { t, settingsId, takeAll, complete, create } = await reuseFixture();
    await create('Atreides');
    for (const item of await takeAll()) {
      await complete(item);
    }
    await t.run(
      async (ctx) => await ctx.db.patch(settingsId, { renderer_revisions: { ...REVISIONS, 'faction-troop': 2 } })
    );
    await create('Atreides variant');
    const items = await takeAll();
    for (const item of troops(items)) {
      expect(item.reuse).toBeUndefined();
    }
    expect(leaders(items).every((item) => item.reuse !== undefined)).toBe(true);
  });

  test('identical content queued together is drawn once: the twin waits, then copies it', async () => {
    const { takeAll, complete, create } = await reuseFixture();
    const first = await create('Atreides');
    const second = await create('Atreides variant');
    const assigned = await takeAll();
    const ownedBy = (items: Item[], factionId: string) => items.filter((item) => item.assetId.startsWith(factionId));
    expect(leaders(ownedBy(assigned, first._id)).length).toBeGreaterThan(0);
    expect(leaders(ownedBy(assigned, second._id))).toEqual([]);
    expect(troops(ownedBy(assigned, second._id))).toEqual([]);

    for (const item of assigned) {
      await complete(item);
    }
    const twins = await takeAll();
    expect(leaders(twins).length).toBeGreaterThan(0);
    expect([...leaders(twins), ...troops(twins)].every((item) => item.reuse)).toBe(true);
  });
});
