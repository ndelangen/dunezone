/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { expect, test, vi } from 'vite-plus/test';

import { publishingSpiceCard } from '../src/shared/assets/fixtures/publishingSpiceCard';
import { publishingTokenFace } from '../src/shared/assets/fixtures/publishingTokenFace';
import { SPICE_BOARD_REVISION } from '../src/shared/assets/schema';
import { arrakisBoard } from '../src/shared/boards/geometry';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';

/* Two Arrakis board saves validate the full geometry; CI runs files in parallel, so the 5 s default is too tight. */
const BUDGET_MS = 30_000;

async function setup(revision: number) {
  const t = applicationTest();
  const ownerId = await t.run(async (ctx) => {
    await ctx.db.insert('admin_settings', {
      key: 'publication',
      publication_pickup_enabled: true,
      renderer_revisions: { 'card-spice': revision },
      updated_at: 1,
    });
    return await ctx.db.insert('users', { name: 'Creator' });
  });
  const owner = t.withIdentity({ subject: ownerId });
  const boardData = { name: 'Arrakis', about: '', board: arrakisBoard() };
  const board = await owner.mutation(api.assets.create, { type: 'board', data: boardData });
  const tokenData = { name: 'Spice', about: '', front: publishingTokenFace, back: { mode: 'same' } };
  const token = await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData });
  const card = {
    ...publishingSpiceCard,
    highlights: [],
    board: {
      asset_id: board.id,
      tints: [{ id: 'blow', name: 'Spice blow', color: '#e8b923', territories: ['arsunt'], types: ['stronghold'] }],
      tokens: [
        { layerId: 'a', asset_id: token.id, x: 100, y: 100, size: 40, rotation: 0 },
        { layerId: 'b', asset_id: token.id, x: 140, y: 100, size: 40, rotation: 15 },
      ],
    },
  };
  return { t, owner, board, boardData, token, tokenData, card };
}

const jobsFor = (t: ReturnType<typeof applicationTest>, id: string) =>
  t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-spice').eq('asset_id', id))
      .take(10)
  );

test(
  'a Spice card linked to a board publishes it with its tokens, and redraws when the board changes',
  async () => {
    vi.useFakeTimers();
    try {
      const { t, owner, board, boardData, token, card } = await setup(SPICE_BOARD_REVISION);
      const created = await owner.mutation(api.assets.create, { type: 'card-spice', data: card });
      const relations = await t.run((ctx) =>
        ctx.db
          .query('asset_relations')
          .withIndex('by_from_kind', (q) => q.eq('from_asset_id', created.id))
          .take(10)
      );
      expect(
        relations.map((relation) => [relation.kind, relation.to_asset_id]).sort(([a], [b]) => a.localeCompare(b))
      ).toEqual([
        ['spice-card-board', board.id],
        ['spice-card-token', token.id],
      ]);
      const [first] = await jobsFor(t, created.id);
      expect(first.asset_data.board.nodes).toEqual(boardData.board.nodes);
      expect(first.asset_data.tokens[token.id].face).toEqual(publishingTokenFace);
      await t.run((ctx) => ctx.db.patch(first._id, { status: 'in_progress', expires_at: Date.now() + 60_000 }));

      const renamed = structuredClone(boardData);
      const key = Object.keys(renamed.board.properties).find((k) => renamed.board.properties[k].name === 'Arsunt')!;
      renamed.board.properties[key] = { ...renamed.board.properties[key], name: 'Arsunt flats' };
      await owner.mutation(api.assets.update, { id: board.id, data: renamed });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const pending = (await jobsFor(t, created.id)).find((job) => job.status === 'pending')!;
      expect(pending.asset_data.board.properties[key].name).toBe('Arsunt flats');
      /* The card's authored tints stay as they were, missing territory and all. */
      expect(pending.asset_data.card).toEqual(card);

      await owner.mutation(api.assets.softDelete, { id: board.id });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const afterDelete = (await jobsFor(t, created.id)).find((job) => job.status === 'pending')!;
      expect(afterDelete.asset_data.board).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  },
  BUDGET_MS
);

test(
  'new links must resolve, and a card waits for the renderer that draws boards',
  async () => {
    const { t, owner, card, token } = await setup(1);
    await expect(
      owner.mutation(api.assets.create, {
        type: 'card-spice',
        data: { ...card, board: { ...card.board, asset_id: token.id } },
      })
    ).rejects.toThrow('available board');
    const created = await owner.mutation(api.assets.create, { type: 'card-spice', data: card });
    expect(await jobsFor(t, created.id)).toEqual([]);
    const unlinked = await owner.mutation(api.assets.create, {
      type: 'card-spice',
      data: { ...publishingSpiceCard, name: 'Legacy' },
    });
    expect(await jobsFor(t, unlinked.id)).toHaveLength(1);
    /* Linking that card drops its queued unlinked draft rather than letting it publish over the save. */
    await owner.mutation(api.assets.update, { id: unlinked.id, data: { ...card, name: 'Legacy' } });
    expect(await jobsFor(t, unlinked.id)).toEqual([]);
    /* A draft carrying IDs from another deployment reads as missing instead of failing the editor. */
    await expect(
      t.query(api.assets.spiceCardBoard, { boardId: 'arrakis-board', tokenIds: ['spice-token'] })
    ).resolves.toMatchObject({
      board: null,
      boardName: null,
    });
  },
  BUDGET_MS
);

test(
  'a fixed type-token slot validates, saves, publishes and refreshes through normal token dependencies',
  async () => {
    vi.useFakeTimers();
    try {
      const { t, owner, card, token, tokenData } = await setup(SPICE_BOARD_REVISION);
      const fixed = {
        ...card,
        board: {
          ...card.board,
          tokens: [],
          typeToken: { asset_id: token.id },
          look: { style: 'textured-burn', strength: 1 },
        },
      };
      const created = await owner.mutation(api.assets.create, { type: 'card-spice', data: fixed });
      const first = (await jobsFor(t, created.id))[0];
      expect(first.asset_data.card.board.typeToken).toEqual({ asset_id: token.id });
      expect(first.asset_data.tokens[token.id].face).toEqual(publishingTokenFace);
      const relations = await t.run((ctx) =>
        ctx.db
          .query('asset_relations')
          .withIndex('by_from_kind', (q) => q.eq('from_asset_id', created.id).eq('kind', 'spice-card-token'))
          .take(10)
      );
      expect(relations.map((row) => row.to_asset_id)).toEqual([token.id]);
      const styled = {
        ...publishingTokenFace,
        symbolFill: '#07120f',
        symbolStroke: '#f3edbf',
        symbolStrokeWidth: 5.5,
        symbolShadow: false,
      };
      await owner.mutation(api.assets.update, { id: token.id, data: { ...tokenData, front: styled } });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const jobs = await jobsFor(t, created.id);
      expect(jobs.some((job) => job.asset_data.tokens[token.id]?.face.symbolShadow === false)).toBe(true);
      await expect(
        owner.mutation(api.assets.update, {
          id: created.id,
          data: { ...fixed, board: { ...fixed.board, typeToken: { asset_id: 'missing' } } },
        })
      ).rejects.toThrow('Choose an available token');
      await owner.mutation(api.assets.update, {
        id: created.id,
        data: { ...fixed, board: { ...fixed.board, typeToken: undefined } },
      });
      const removed = await t.run((ctx) =>
        ctx.db
          .query('asset_relations')
          .withIndex('by_from_kind', (q) => q.eq('from_asset_id', created.id).eq('kind', 'spice-card-token'))
          .take(10)
      );
      expect(removed).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  },
  BUDGET_MS
);
