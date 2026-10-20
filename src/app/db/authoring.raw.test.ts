import { describe, expect, test, vi } from 'vite-plus/test';
/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { api } from '../../../convex/_generated/api';
import { applicationTest } from '../../../convex/application.test.fixture';
import { publishingCustomCard } from '../../shared/assets/fixtures/publishingCustomCard';
import { publishingSpiceCard } from '../../shared/assets/fixtures/publishingSpiceCard';
import { publishingTokenFace } from '../../shared/assets/fixtures/publishingTokenFace';
import { arrakisBoard } from '../../shared/boards/geometry';
import { assetPublishingFaction } from '../../shared/factions/fixtures/assetPublishingFaction';
import { prepareRawAsset, prepareRawFaction } from './authoring';

describe('raw authoring reference checks', () => {
  test('prepares a valid Faction locally and writes nothing', async () => {
    const t = applicationTest();
    reads.query.mockImplementation((fn, args) => t.query(fn, args));
    await expect(prepareRawFaction(JSON.stringify(assetPublishingFaction))).resolves.toEqual(assetPublishingFaction);
    expect(reads.query).not.toHaveBeenCalled();
    await t.run(async (ctx) => {
      expect(await ctx.db.query('factions').collect()).toEqual([]);
      expect(await ctx.db.query('user_image_ingest_tokens').collect()).toEqual([]);
      expect(await ctx.db.query('publication_jobs').collect()).toEqual([]);
    });
  });
  test('rejects unavailable typed faction Extras before Load', async () => {
    const t = applicationTest();
    const id = await t.run((ctx) => ctx.db.insert('users', { name: 'Author' }));
    const viewer = t.withIdentity({ subject: id });
    reads.query.mockImplementation((fn, args) => viewer.query(fn, args));
    await expect(
      prepareRawFaction(JSON.stringify({ ...assetPublishingFaction, extras: [{ type: 'deck', slug: 'missing' }] }))
    ).rejects.toThrow('$.extras.0');
  });
});

const reads = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@db/core', () => ({ db: reads }));
vi.mock('@db/profiles', () => ({ useSessionViewer: vi.fn() }));

test.each([
  '{',
  `${'['.repeat(66)}0${']'.repeat(66)}`,
  JSON.stringify({ ...assetPublishingFaction, owner_id: 'protected' }),
])('invalid writable input reaches no reference read', async (text) => {
  reads.query.mockClear();
  await expect(prepareRawFaction(text)).rejects.toThrow();
  expect(reads.query).not.toHaveBeenCalled();
});

test('custom card preparation resolves only deduplicated selected IDs and rejects missing or wrong types', async () => {
  const t = applicationTest();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Author' });
    const common = {
      owner_id: ownerId,
      group_id: null,
      is_deleted: false,
      created_at: '2026-10-20',
      updated_at: '2026-10-20',
    };
    const token = await ctx.db.insert('assets', {
      ...common,
      type: 'token-disc',
      slug: 'linked',
      data: { name: 'Linked', about: '', front: publishingTokenFace, back: { mode: 'same' } },
    });
    const target = await ctx.db.insert('assets', {
      ...common,
      type: 'card-custom',
      slug: 'target',
      data: publishingCustomCard,
    });
    return { ownerId, token, target };
  });
  const viewer = t.withIdentity({ subject: ids.ownerId });
  reads.query.mockClear();
  reads.query.mockImplementation((fn, args) => viewer.query(fn, args));
  const card = (id: string) => ({
    ...publishingCustomCard,
    layers: [0, 1].map((index) => ({
      kind: 'token',
      layerId: `20000000-2000-4000-8000-20000000000${index}`,
      asset_id: id,
      offset: [0, 0],
      scale: 1,
      opacity: 1,
      rotation: 0,
    })),
  });
  await expect(prepareRawAsset({ type: 'card-custom', text: JSON.stringify(card(ids.token)) })).resolves.toMatchObject({
    data: card(ids.token),
  });
  expect(reads.query).toHaveBeenCalledExactlyOnceWith(
    api.assets.customCardTokens,
    { ids: [ids.token] },
    { hold: false }
  );
  for (const id of [ids.target, 'foreign-token-id']) {
    await expect(prepareRawAsset({ type: 'card-custom', text: JSON.stringify(card(id)) })).rejects.toThrow('$.layers');
  }
  await t.run(async (ctx) => {
    await ctx.db.patch('assets', ids.token, { is_deleted: true });
    expect((await ctx.db.get('assets', ids.target))!.data).toEqual(publishingCustomCard);
    expect(await ctx.db.query('asset_relations').collect()).toEqual([]);
    expect(await ctx.db.query('publication_jobs').collect()).toEqual([]);
  });
  await expect(prepareRawAsset({ type: 'card-custom', text: JSON.stringify(card(ids.token)) })).rejects.toThrow(
    '$.layers'
  );
});

test('linked artwork budget failure is caught during preparation through the existing token read', async () => {
  const t = applicationTest();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Author' });
    const tokens = [];
    for (const slug of ['one', 'two']) {
      tokens.push(
        await ctx.db.insert('assets', {
          owner_id: ownerId,
          group_id: null,
          is_deleted: false,
          created_at: '2026-10-20',
          updated_at: '2026-10-20',
          type: 'token-disc',
          slug,
          data: {
            name: slug,
            about: '',
            front: { ...publishingTokenFace, top: 'x'.repeat(270_000) },
            back: { mode: 'same' },
          },
        })
      );
    }
    return { ownerId, tokens };
  });
  const viewer = t.withIdentity({ subject: ids.ownerId });
  reads.query.mockImplementation((fn, args) => viewer.query(fn, args));
  const card = {
    ...publishingCustomCard,
    layers: ids.tokens.map((asset_id, index) => ({
      kind: 'token',
      layerId: `20000000-2000-4000-8000-20000000000${index}`,
      asset_id,
      offset: [0, 0],
      scale: 1,
      opacity: 1,
      rotation: 0,
    })),
  };
  await expect(prepareRawAsset({ type: 'card-custom', text: JSON.stringify(card) })).rejects.toThrow('too large');
});

test('Spice preparation uses its board read and rejects unavailable placed tokens', async () => {
  const t = applicationTest();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Author' });
    const board = await ctx.db.insert('assets', {
      owner_id: ownerId,
      group_id: null,
      is_deleted: false,
      created_at: '2026-10-20',
      updated_at: '2026-10-20',
      type: 'board',
      slug: 'arrakis',
      data: { name: 'Arrakis', about: '', board: arrakisBoard() },
    });
    return { ownerId, board };
  });
  const viewer = t.withIdentity({ subject: ids.ownerId });
  reads.query.mockClear();
  reads.query.mockImplementation((fn, args) => viewer.query(fn, args));
  const card = { ...publishingSpiceCard, board: { asset_id: ids.board, tints: [], tokens: [] } };
  await expect(prepareRawAsset({ type: 'card-spice', text: JSON.stringify(card) })).resolves.toMatchObject({
    data: card,
  });
  expect(reads.query).toHaveBeenCalledExactlyOnceWith(
    api.assets.spiceCardBoard,
    { boardId: ids.board, tokenIds: [] },
    { hold: false }
  );
  await expect(
    prepareRawAsset({
      type: 'card-spice',
      text: JSON.stringify({
        ...card,
        board: {
          ...card.board,
          tokens: [{ layerId: 'missing', asset_id: 'foreign-token-id', x: 100, y: 100, size: 40, rotation: 0 }],
        },
      }),
    })
  ).rejects.toThrow('$.board.tokens');
  await expect(
    prepareRawAsset({
      type: 'card-spice',
      text: JSON.stringify({ ...card, board: { ...card.board, asset_id: 'foreign-board-id' } }),
    })
  ).rejects.toThrow('$.board.asset_id');
});
