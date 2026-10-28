/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { expect, test } from 'vite-plus/test';

import { publisherCaptureSnapshotSchema } from '../src/shared/asset-publishing/publisher-snapshot';
import { GF9_STRONGHOLD_CARDS } from '../src/shared/assets/gf9StrongholdDeck';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { assetPageAs } from './viewerAccess.test.fixture';

test('stronghold cards round-trip, publish their constrained face and enforce editing access', async () => {
  const t = applicationTest();
  const [ownerId, otherId] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { name: 'Owner' }),
    await ctx.db.insert('users', { name: 'Other' }),
  ]);
  const owner = t.withIdentity({ subject: ownerId! });
  const data = GF9_STRONGHOLD_CARDS[0]!;
  await expect(t.mutation(api.assets.create, { type: 'card-stronghold', data })).rejects.toThrow('Not authenticated');
  const created = await owner.mutation(api.assets.create, { type: 'card-stronghold', data });
  const page = await assetPageAs(t, { type: 'card-stronghold', slug: created.slug });
  expect(page?.asset.data).toEqual(data);
  expect(page?.asset.previewHref).toContain(`/published/stronghold-cards/${created.id}/card.jpg`);
  const job = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-stronghold').eq('asset_id', created.id))
      .unique()
  );
  expect(job?.asset_data).toEqual({ assetId: created.id, slug: created.slug, card: data });
  expect(
    publisherCaptureSnapshotSchema.parse({
      ok: true,
      assetType: 'card-stronghold',
      payload: job!.asset_data,
      payloadHash: '0'.repeat(64),
    }).assetType
  ).toBe('card-stronghold');
  await expect(
    t.withIdentity({ subject: otherId! }).mutation(api.assets.update, { id: created.id, data })
  ).rejects.toThrow('Not authorized');
  for (const extra of [
    { format: 'plain' },
    { textSize: 1 },
    { text: 'a'.repeat(1201) },
    { decals: [{ ...data.decals[0], id: 'https://example.com/art.svg' }] },
  ]) {
    await expect(owner.mutation(api.assets.update, { id: created.id, data: { ...data, ...extra } })).rejects.toThrow(
      'The stronghold card contains invalid fields'
    );
  }
  const changed = { ...data, name: 'Custom stronghold', text: 'Win tied battles here.' };
  await owner.mutation(api.assets.update, { id: created.id, data: changed });
  expect((await assetPageAs(t, { type: 'card-stronghold', slug: 'custom-stronghold' }))?.asset.data).toEqual(changed);
});
