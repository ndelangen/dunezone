/* @vitest-environment edge-runtime */
import { describe, expect, test } from 'vitest';

import { FACTION_SHEET_ASSET_TYPE } from '../src/shared/asset-publishing/publication';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { rulebookFixture } from './rulebooks.test.fixture';

/* Every faction-generated component type, each active, so a capture of any of them would show here. */
const COMPONENT_TYPES = ['faction-token', 'faction-leader', 'faction-troop', 'faction-traitor', 'faction-alliance'];
const revisions = {
  'faction-token': 2,
  'faction-leader': 1,
  'faction-troop': 1,
  'faction-traitor': 1,
  'faction-alliance': 1,
};
let revision = 0;
/* A Leader publication only accepts a UUID revision, so every capture gets a fresh one. */
const nextToken = () => `10000000-1000-4000-8000-${String(++revision).padStart(12, '0')}`;

async function recaptureFixture() {
  const { t, owner } = await rulebookFixture();
  await t.run(async (ctx) =>
    ctx.db.insert('admin_settings', {
      key: 'publication',
      publication_pickup_enabled: true,
      renderer_revisions: revisions,
      updated_at: 1,
    })
  );
  const faction = await owner.mutation(api.factions.create, {
    data: structuredClone(assetPublishingFaction),
    group_id: null,
  });
  const leaderId = `${faction._id}.${faction.data.leaders[0]!.memberId}`;
  const update = (data: typeof faction.data) => owner.mutation(api.factions.update, { id: faction._id, data });
  /* Component work only; the faction sheet redraws on every save by design and is not a component. */
  const jobs = async () =>
    (await t.run(async (ctx) => ctx.db.query('publication_jobs').collect())).filter(
      (job) => job.asset_type !== FACTION_SHEET_ASSET_TYPE
    );
  const take = async () =>
    (await t.mutation(internal.publicationJobs.takeWork, {})).items.filter(
      (item) => item.assetType !== FACTION_SHEET_ASSET_TYPE
    );
  const complete = async (job: { jobId: Id<'publication_jobs'> }) => {
    const snapshot = await t.query(internal.publicationJobs.readJobForRender, { jobId: job.jobId });
    return t.mutation(internal.publicationJobs.completeJob, {
      jobId: job.jobId,
      cacheToken: nextToken(),
      payloadHash: snapshot?.payloadHash,
    });
  };
  /* Publishes every component the save produced, so later assertions start from completed outputs. */
  const drain = async () => {
    for (let taken = await take(); taken.length > 0; taken = await take()) {
      for (const job of taken) {
        expect(await complete(job)).toMatchObject({ status: 'completed' });
      }
    }
    await t.run(async (ctx) => {
      for (const job of await ctx.db.query('publication_jobs').collect()) {
        await ctx.db.delete(job._id);
      }
    });
  };
  const published = async () =>
    t.run(async (ctx) => {
      const rows = await ctx.db.query('publication_assets').collect();
      return Object.fromEntries(rows.map((row) => [`${row.asset_type}:${row.asset_id}`, row.cache_token]));
    });
  return { t, faction, leaderId, update, jobs, take, complete, drain, published };
}

describe('Selective recapture of faction components', () => {
  test('an edit no component draws captures nothing for any component type', async () => {
    const { faction, update, jobs, drain, published } = await recaptureFixture();
    await drain();
    const before = await published();
    expect(new Set(Object.keys(before).map((key) => key.split(':')[0]))).toEqual(new Set(COMPONENT_TYPES));

    const { rules } = faction.data;
    await update({
      ...faction.data,
      themeColor: '#123456',
      rules: {
        ...rules,
        startText: 'A different start.',
        revivalText: '3 troops free.',
        spiceCount: 12,
        advantages: [...rules.advantages, { text: 'A new advantage.' }],
        fate: { ...rules.fate!, text: 'A different fate.' },
      },
    });

    expect(await jobs()).toEqual([]);
    expect(await published()).toEqual(before);
  });

  test('rapid edits that return to the earlier value leave one capture per component, carrying the earlier value', async () => {
    const { faction, leaderId, update, jobs, drain, published } = await recaptureFixture();
    await drain();
    const [first, ...rest] = faction.data.leaders;
    const renamed = { ...faction.data, leaders: [{ ...first!, name: 'Renamed' }, ...rest] };

    await update(renamed);
    await update(faction.data);
    await update(renamed);
    await update(faction.data);

    /* Coalescing is not change detection: the pending work is one job each, and it draws the restored name. */
    const pending = await jobs();
    expect(pending.map((job) => `${job.asset_type}:${job.asset_id}`).sort()).toEqual(
      [`faction-leader:${leaderId}`, `faction-traitor:${leaderId}`].sort()
    );
    for (const job of pending) {
      expect(job.status).toBe('pending');
      expect(JSON.stringify(job.asset_data)).toContain(`"name":"${first!.name}"`);
      expect(JSON.stringify(job.asset_data)).not.toContain('Renamed');
    }

    const before = await published();
    await drain();
    const after = await published();
    expect(
      Object.keys(after)
        .filter((key) => after[key] !== before[key])
        .sort()
    ).toEqual([`faction-leader:${leaderId}`, `faction-traitor:${leaderId}`].sort());
  });

  test('returning to the earlier value while the edit is capturing publishes the earlier value, not the edit', async () => {
    const { faction, leaderId, update, take, complete, drain, published } = await recaptureFixture();
    await drain();
    const [first, ...rest] = faction.data.leaders;
    const renamed = { ...faction.data, leaders: [{ ...first!, name: 'Renamed' }, ...rest] };

    await update(renamed);
    const inFlight = await take();
    expect(inFlight.map((job) => `${job.assetType}:${job.assetId}`).sort()).toEqual(
      [`faction-leader:${leaderId}`, `faction-traitor:${leaderId}`].sort()
    );
    await update(faction.data);

    /* The capture of the abandoned edit finishes late and is refused, so it never replaces the published image. */
    const before = await published();
    for (const job of inFlight) {
      expect(await complete(job)).toEqual({ status: 'missing' });
    }
    expect(await published()).toEqual(before);

    const successors = await take();
    expect(successors.map((job) => `${job.assetType}:${job.assetId}`).sort()).toEqual(
      [`faction-leader:${leaderId}`, `faction-traitor:${leaderId}`].sort()
    );
    for (const job of successors) {
      expect(await complete(job)).toMatchObject({ status: 'completed' });
    }
    expect(await take()).toEqual([]);
  });
});
