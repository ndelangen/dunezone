/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { GF9_LEADER_SKILLS } from '../src/shared/assets/gf9LeaderSkills';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('renderer regeneration republishes live leader skills and skips deleted cards', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const owner = t.withIdentity({ subject: ownerId });
  const live = await owner.mutation(api.assets.create, {
    type: 'card-leaderability',
    data: GF9_LEADER_SKILLS[0]!,
  });
  const deleted = await owner.mutation(api.assets.create, {
    type: 'card-leaderability',
    data: GF9_LEADER_SKILLS[1]!,
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(deleted.id, { is_deleted: true });
    await Promise.all((await ctx.db.query('publication_jobs').collect()).map((job) => ctx.db.delete(job._id)));
  });
  await t.mutation(internal.publicationRegeneration.scan, {
    assetType: 'card-leaderability',
    cursor: null,
    scanned: 0,
    enqueued: 0,
  });
  const jobs = await t.run((ctx) => ctx.db.query('publication_jobs').collect());
  expect(jobs).toHaveLength(1);
  expect(jobs[0]?.asset_id).toBe(live.id);
  expect(jobs[0]?.asset_data.card).toEqual(GF9_LEADER_SKILLS[0]);
});
