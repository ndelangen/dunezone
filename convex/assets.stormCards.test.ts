/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { expect, test } from 'vite-plus/test';

import { publishingTokenFace } from '../src/shared/assets/fixtures/publishingTokenFace';
import { standardStormCard } from '../src/shared/assets/standardStormDeck';
import { api, internal } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { assetPageAs } from './viewerAccess.test.fixture';

test('storm cards publish ordered layers and refresh linked tokens', async () => {
  const t = applicationTest();
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const owner = t.withIdentity({ subject: ownerId });
  const token = await owner.mutation(api.assets.create, {
    type: 'token-disc',
    data: { name: 'Storm token', about: '', front: publishingTokenFace, back: { mode: 'same' } },
  });
  const data = {
    ...standardStormCard(3),
    layers: [
      ...standardStormCard(3).layers,
      {
        kind: 'token',
        layerId: '30000000-3000-4000-8000-300000000003',
        asset_id: token.id,
        offset: [0, 0],
        scale: 1,
        opacity: 1,
        rotation: 0,
      },
    ],
  };
  const created = await owner.mutation(api.assets.create, { type: 'card-storm', data });
  const page = await assetPageAs(owner, { type: 'card-storm', slug: created.slug });
  expect(page?.asset.data).toEqual(data);
  expect(page?.cardTokens?.[token.id]?.name).toBe('Storm token');
  const job = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-storm').eq('asset_id', created.id))
      .unique()
  );
  expect(job?.asset_data).toMatchObject({ card: data, tokens: { [token.id]: { name: 'Storm token' } } });
  await owner.mutation(api.assets.update, { id: created.id, data: { ...data, sectors: 6 } });
  expect((await assetPageAs(owner, { type: 'card-storm', slug: created.slug }))?.asset.data).toMatchObject({
    sectors: 6,
    layers: data.layers,
  });
  await owner.mutation(api.assets.update, {
    id: token.id,
    data: { name: 'Changed token', about: '', front: publishingTokenFace, back: { mode: 'same' } },
  });
  await t.mutation(internal.assets.refreshEmbeddedCard, { tokenId: token.id, cardId: created.id });
  const refreshed = await t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-storm').eq('asset_id', created.id))
      .order('desc')
      .first()
  );
  expect(refreshed?.asset_data).toMatchObject({ tokens: { [token.id]: { name: 'Changed token' } } });
});

test('storm card writes require an author and preserve the fixed identity and movement range', async () => {
  const t = applicationTest();
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const owner = t.withIdentity({ subject: ownerId });
  const data = standardStormCard(3);
  const created = await owner.mutation(api.assets.create, { type: 'card-storm', data });
  for (const update of [
    { sectors: 0 },
    { sectors: 7 },
    { sectors: 1.5 },
    { format: 'plain' },
    { subName: 'Weapon' },
    { icon: [data.icon[0], '/vector/icon/karama.svg'] },
  ]) {
    await expect(owner.mutation(api.assets.update, { id: created.id, data: { ...data, ...update } })).rejects.toThrow();
  }
  await expect(t.mutation(api.assets.create, { type: 'card-storm', data })).rejects.toThrow();
});
