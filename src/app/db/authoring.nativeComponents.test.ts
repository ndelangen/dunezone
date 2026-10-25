/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { expect, test, vi } from 'vite-plus/test';

import { api } from '../../../convex/_generated/api';
import { rulebookFixture } from '../../../convex/rulebooks.test.fixture';
import { publishingSpiceCard } from '../../shared/assets/fixtures/publishingSpiceCard';
import { publishingTokenFace } from '../../shared/assets/fixtures/publishingTokenFace';
import { publishingTreacheryCard } from '../../shared/assets/fixtures/publishingTreacheryCard';
import { DUKE_PRAD_VIDAL_TOKEN } from '../../shared/assets/leaderToken';
import { parseRawAsset, readRawAuthoringJson } from '../../shared/authoring/raw';
import { arrakisBoard } from '../../shared/boards/geometry';
import { contentImportPackageSchema } from '../../shared/contentImports/package';
import { prepareRawAsset } from './authoring';

const target = { rulesetSlug: 'rulebook-test-rules', groupSlug: 'rulebook-authors' };
const styledFace = {
  ...publishingTokenFace,
  symbolFill: '#07120f',
  symbolStroke: '#f3edbf80',
  symbolStrokeWidth: 5.5,
  symbolShadow: false,
};

test('native component fields survive local preparation, normal Save and authenticated export', async () => {
  const { t, owner, outsider, ids } = await rulebookFixture();
  reads.query.mockImplementation((fn, args) => owner.query(fn, args));
  const token = await owner.mutation(api.assets.create, {
    type: 'token-disc',
    group_id: ids.groupId,
    data: { name: 'Native marker', about: '', front: publishingTokenFace, back: { mode: 'same' } },
  });
  const board = await owner.mutation(api.assets.create, {
    type: 'board',
    data: { name: 'Native board', about: '', board: arrakisBoard() },
  });
  const leader = await owner.mutation(api.assets.create, {
    type: 'token-leader',
    group_id: ids.groupId,
    data: DUKE_PRAD_VIDAL_TOKEN,
  });
  const cases = [
    {
      type: 'token-leader',
      created: leader,
      data: { ...DUKE_PRAD_VIDAL_TOKEN, strength: 'X', about: 'Standalone leader.' },
    },
    {
      type: 'token-disc',
      created: token,
      data: { name: 'Native marker', about: '', front: styledFace, back: { mode: 'custom', face: styledFace } },
    },
    {
      type: 'card-treachery',
      data: { ...publishingTreacheryCard, text: 'Keep the *complete* instruction.', bodyLayout: 'text-only' },
    },
    {
      type: 'card-spice',
      data: {
        ...publishingSpiceCard,
        board: {
          asset_id: board.id,
          typeToken: { asset_id: token.id },
          look: { style: 'textured-burn', strength: 0.8 },
          tokens: [],
          tints: [],
        },
      },
    },
  ];
  for (const entry of cases) {
    const created =
      entry.created ??
      (await owner.mutation(api.assets.create, {
        type: entry.type,
        group_id: ids.groupId,
        data: entry.type === 'card-spice' ? publishingSpiceCard : publishingTreacheryCard,
      }));
    const before = await t.run(async (ctx) => ({
      row: await ctx.db.get(created.id),
      jobs: await ctx.db.query('publication_jobs').collect(),
      ingest: await ctx.db.query('user_image_ingest_tokens').collect(),
      relations: await ctx.db.query('asset_relations').collect(),
    }));
    const text = JSON.stringify(entry.data);
    expect(parseRawAsset(entry.type, readRawAuthoringJson(text)).data).toEqual(entry.data);
    reads.query.mockClear();
    const loaded = await prepareRawAsset({ type: entry.type, targetId: created.id, text });
    expect(loaded.data).toEqual(entry.data);
    if (entry.type === 'card-spice') {
      expect(reads.query).toHaveBeenCalledExactlyOnceWith(
        api.assets.spiceCardBoard,
        { boardId: board.id, tokenIds: [token.id] },
        { hold: false }
      );
    } else {
      expect(reads.query).not.toHaveBeenCalled();
    }
    expect(
      await t.run(async (ctx) => ({
        row: await ctx.db.get(created.id),
        jobs: await ctx.db.query('publication_jobs').collect(),
        ingest: await ctx.db.query('user_image_ingest_tokens').collect(),
        relations: await ctx.db.query('asset_relations').collect(),
      }))
    ).toEqual(before);
    await expect(outsider.mutation(api.assets.update, { id: created.id, data: entry.data })).rejects.toThrow(
      'Not authorized'
    );
    await owner.mutation(api.assets.update, { id: created.id, data: loaded.data });
    const exported = await owner.mutation(api.contentImports.exportRecord, {
      target,
      kind: 'asset',
      type: entry.type,
      slug: created.slug,
    });
    const item = contentImportPackageSchema.parse(exported.package).items[0]!;
    expect(item.data).toEqual(entry.data);
    expect(parseRawAsset(entry.type, readRawAuthoringJson(JSON.stringify(item.data))).data).toEqual(entry.data);
    expect(await t.run((ctx) => ctx.db.get(created.id))).toMatchObject({
      _id: created.id,
      owner_id: ids.ownerId,
      group_id: ids.groupId,
      data: entry.data,
    });
    await expect(
      outsider.mutation(api.contentImports.exportRecord, {
        target,
        kind: 'asset',
        type: entry.type,
        slug: created.slug,
      })
    ).rejects.toThrow();
  }
}, 30_000);

test('raw native Spice rejects a wrong-type fixed token or board before Load without changing its target', async () => {
  const { t, owner } = await rulebookFixture();
  reads.query.mockImplementation((fn, args) => owner.query(fn, args));
  const card = await owner.mutation(api.assets.create, { type: 'card-spice', data: publishingSpiceCard });
  const board = await owner.mutation(api.assets.create, {
    type: 'board',
    data: { name: 'Native board', about: '', board: arrakisBoard() },
  });
  const state = () =>
    t.run(async (ctx) => ({
      row: await ctx.db.get(card.id),
      jobs: await ctx.db.query('publication_jobs').collect(),
      ingest: await ctx.db.query('user_image_ingest_tokens').collect(),
      relations: await ctx.db.query('asset_relations').collect(),
    }));
  const before = await state();
  for (const [link, path] of [
    [{ asset_id: board.id, typeToken: { asset_id: card.id }, tokens: [], tints: [] }, '$.board.tokens'],
    [{ asset_id: board.id, typeToken: { asset_id: 'foreign-token-id' }, tokens: [], tints: [] }, '$.board.tokens'],
    [{ asset_id: board.id, typeToken: { asset_id: '__proto__' }, tokens: [], tints: [] }, '$.board.tokens'],
    [{ asset_id: card.id, tokens: [], tints: [] }, '$.board.asset_id'],
  ] as const) {
    await expect(
      prepareRawAsset({
        type: 'card-spice',
        targetId: card.id,
        text: JSON.stringify({ ...publishingSpiceCard, board: link }),
      })
    ).rejects.toThrow(path);
    expect(await state()).toEqual(before);
  }
});

const reads = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@db/core', () => ({ db: reads }));
vi.mock('@db/profiles', () => ({ useSessionViewer: vi.fn() }));
