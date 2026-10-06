/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { convexTest } from 'convex-test';
import { expect, test, vi } from 'vitest';

import { publishingCustomCard } from '../src/shared/assets/fixtures/publishingCustomCard';
import { publishingTokenFace } from '../src/shared/assets/fixtures/publishingTokenFace';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function tokenLayer(asset_id: string) {
  return {
    kind: 'token',
    layerId: crypto.randomUUID(),
    asset_id,
    offset: [0, 0],
    scale: 1,
    opacity: 1,
    rotation: 0,
  };
}

test('linked token layers resolve current fronts and refresh immutable card captures', async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules);
    const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
    const owner = t.withIdentity({ subject: ownerId });
    const tokenData = { name: 'Linked Karama', about: '', front: publishingTokenFace, back: { mode: 'same' } };
    const token = await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData });
    const layers = [0, 1].map((index) => ({
      kind: 'token',
      layerId: crypto.randomUUID(),
      asset_id: token.id,
      offset: [index * 160, -120],
      scale: 0.8,
      opacity: 1,
      rotation: 0,
    }));
    const cardData = { ...publishingCustomCard, layers };
    const card = await owner.mutation(api.assets.create, { type: 'card-custom', data: cardData });
    const first = await t.run(async (ctx) => {
      const job = await ctx.db
        .query('publication_jobs')
        .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-custom').eq('asset_id', card.id))
        .unique();
      await ctx.db.patch(job!._id, { status: 'in_progress', expires_at: Date.now() + 60_000 });
      const links = await ctx.db
        .query('asset_relations')
        .withIndex('by_from_kind', (q) => q.eq('from_asset_id', card.id).eq('kind', 'custom-card-token'))
        .take(10);
      expect(links).toHaveLength(1);
      return job!;
    });
    const changed = { ...tokenData, front: { ...publishingTokenFace, top: 'UPDATED TOKEN' } };
    await owner.mutation(api.assets.update, { id: token.id, data: changed });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const page = await owner.query(api.assets.getPage, { type: 'card-custom', slug: card.slug });
    expect(page!.asset.data).toEqual(cardData);
    expect(page!.cardTokens![token.id]!.face).toEqual(changed.front);
    const jobs = await t.run((ctx) =>
      ctx.db
        .query('publication_jobs')
        .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-custom').eq('asset_id', card.id))
        .take(10)
    );
    expect(jobs.find((job) => job._id === first._id)!.asset_data.tokens[token.id].face).toEqual(publishingTokenFace);
    expect(jobs.find((job) => job.status === 'pending')!.asset_data.tokens[token.id].face).toEqual(changed.front);
    await owner.mutation(api.assets.softDelete, { id: token.id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (await owner.query(api.assets.getPage, { type: 'card-custom', slug: card.slug }))?.cardTokens?.[token.id]
    ).toBeNull();
    await owner.mutation(api.assets.update, { id: card.id, data: cardData });
    await expect(
      owner.mutation(api.assets.create, { type: 'card-custom', data: { ...cardData, name: 'New dangling card' } })
    ).rejects.toThrow('available token');
    await owner.mutation(api.assets.update, { id: card.id, data: { ...cardData, layers: [] } });
    const links = await t.run((ctx) =>
      ctx.db
        .query('asset_relations')
        .withIndex('by_from_kind', (q) => q.eq('from_asset_id', card.id).eq('kind', 'custom-card-token'))
        .take(10)
    );
    expect(links).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

test('token layers reject non-token assets and invalid identities before saving', async () => {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
  const owner = t.withIdentity({ subject: ownerId });
  const card = await owner.mutation(api.assets.create, { type: 'card-custom', data: publishingCustomCard });
  for (const asset_id of [card.id, 'https://example.com/token']) {
    await expect(
      owner.mutation(api.assets.update, {
        id: card.id,
        data: {
          ...publishingCustomCard,
          layers: [
            {
              kind: 'token',
              layerId: crypto.randomUUID(),
              asset_id,
              offset: [0, 0],
              scale: 1,
              opacity: 1,
              rotation: 0,
            },
          ],
        },
      })
    ).rejects.toThrow('available token');
  }
  expect((await owner.query(api.assets.getPage, { type: 'card-custom', slug: card.slug }))?.asset.data).toEqual(
    publishingCustomCard
  );
});

test('oversized linked artwork reports an error while other dependent cards keep refreshing', async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules);
    const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
    const owner = t.withIdentity({ subject: ownerId });
    const tokenData = { name: 'Growing token', about: '', front: publishingTokenFace, back: { mode: 'same' } };
    const growing = await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData });
    const large = await owner.mutation(api.assets.create, {
      type: 'token-disc',
      data: { ...tokenData, name: 'Large token', front: { ...publishingTokenFace, top: 'x'.repeat(270_000) } },
    });

    const oversized = await owner.mutation(api.assets.create, {
      type: 'card-custom',
      data: {
        ...publishingCustomCard,
        name: 'Oversized after token edit',
        layers: [tokenLayer(growing.id), tokenLayer(large.id)],
      },
    });
    const cards: (typeof growing)[] = [];
    for (let index = 0; index < 21; index++) {
      cards.push(
        await owner.mutation(api.assets.create, {
          type: 'card-custom',
          data: { ...publishingCustomCard, name: `Dependent card ${index}`, layers: [tokenLayer(growing.id)] },
        })
      );
    }
    const changed = { ...tokenData, front: { ...publishingTokenFace, top: 'y'.repeat(270_000) } };
    await owner.mutation(api.assets.update, { id: growing.id, data: changed });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const page = await owner.query(api.assets.getPage, { type: 'card-custom', slug: oversized.slug });
    expect(page!.cardTokens).toEqual({});
    expect(page!.cardTokensError).toContain('too large');
    await expect(
      owner.mutation(api.assets.create, {
        type: 'card-custom',
        data: {
          ...publishingCustomCard,
          name: 'Too large to save',
          layers: [tokenLayer(growing.id), tokenLayer(large.id)],
        },
      })
    ).rejects.toThrow('too large');
    await t.run(async (ctx) => {
      const failed = await ctx.db
        .query('publication_jobs')
        .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-custom').eq('asset_id', oversized.id))
        .unique();
      expect(failed!.status).toBe('error');
      expect(failed!.error).toContain('too large');
      for (const card of cards) {
        const job = await ctx.db
          .query('publication_jobs')
          .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-custom').eq('asset_id', card.id))
          .unique();
        expect(job!.status).toBe('pending');
        expect(job!.asset_data.tokens[growing.id].face).toEqual(changed.front);
      }
    });
  } finally {
    vi.useRealTimers();
  }
});
