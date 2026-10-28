/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { expect, test } from 'vite-plus/test';

import { publisherCaptureSnapshotSchema } from '../src/shared/asset-publishing/publisher-snapshot';
import { GF9_LEADER_SKILLS } from '../src/shared/assets/gf9LeaderSkills';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { assetPageAs } from './viewerAccess.test.fixture';

test('leader skills save, publish their two abilities, and reopen with author access', async () => {
  const t = applicationTest();
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const outsiderId = await t.run((ctx) => ctx.db.insert('users', { name: 'Other' }));
  const owner = t.withIdentity({ subject: ownerId });
  const card = GF9_LEADER_SKILLS[5]!;
  await expect(t.mutation(api.assets.create, { type: 'card-leaderability', data: card })).rejects.toThrow(
    'Not authenticated'
  );
  const created = await owner.mutation(api.assets.create, { type: 'card-leaderability', data: card });
  const job = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) =>
        q.eq('asset_type', 'card-leaderability').eq('asset_id', created.id)
      )
      .unique()
  );
  expect(
    publisherCaptureSnapshotSchema.parse({
      ok: true,
      assetType: 'card-leaderability',
      payload: job!.asset_data,
      payloadHash: 'a'.repeat(64),
    }).payload
  ).toEqual({ assetId: created.id, slug: created.slug, card });
  await expect(
    t.withIdentity({ subject: outsiderId }).mutation(api.assets.update, { id: created.id, data: card })
  ).rejects.toThrow('Not authorized');
  const updated = { ...card, battleText: 'Add +4 to this leader disc.' };
  await owner.mutation(api.assets.update, { id: created.id, data: updated });
  expect((await assetPageAs(t, { type: 'card-leaderability', slug: created.slug }))?.asset.data).toEqual(updated);
  for (const change of [
    { battleText: '*unclosed' },
    { textSize: 4 },
    { generalText: 'x'.repeat(601) },
    { layers: [] },
  ]) {
    await expect(
      owner.mutation(api.assets.update, { id: created.id, data: { ...updated, ...change } })
    ).rejects.toThrow();
  }
});
