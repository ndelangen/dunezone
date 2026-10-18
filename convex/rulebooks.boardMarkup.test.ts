/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { expect, test } from 'vite-plus/test';

import { arrakisBoard } from '../src/shared/boards/geometry';
import { projectRulebookDraftRenderBlock } from '../src/shared/rulebooks/projectRenderDocument';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { resolveRulebookReferences } from './lib/rulebookReferences';

/* An Arrakis board save validates the full geometry; CI runs files in parallel, so the 5 s default is too tight. */
const BUDGET_MS = 30_000;

const scene = (boardId: string, markup: object) => ({
  kind: 'board-scene' as const,
  id: 'scene',
  boardId,
  caption: '',
  players: [],
  troops: [],
  highlights: [],
  annotations: [],
  ...markup,
});

const contentsWith = (block: ReturnType<typeof scene>) =>
  ({
    version: 1,
    pageOrder: ['page'],
    pagesById: { page: { layoutId: 'standard', blocksById: { scene: block } } },
  }) as unknown as Parameters<typeof resolveRulebookReferences>[1];

test(
  'a scene reads its saved board only to draw tints on it, and resolves its placed tokens',
  async () => {
    const t = applicationTest();
    const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
    const owner = t.withIdentity({ subject: ownerId });
    const board = await owner.mutation(api.assets.create, {
      type: 'board',
      data: { name: 'Arrakis copy', about: '', board: arrakisBoard() },
    });

    const plain = await t.run((ctx) => resolveRulebookReferences(ctx, contentsWith(scene(board.id, {}))));
    expect(plain.assetsById[board.id]?.board).toBeUndefined();
    const editing = await t.run((ctx) =>
      resolveRulebookReferences(ctx, contentsWith(scene(board.id, {})), { boardData: true })
    );
    expect(editing.assetsById[board.id]?.board).toMatchObject({ properties: expect.any(Object) });

    const tinted = scene(board.id, {
      tints: [{ id: 'tint', name: 'Spice', color: '#e8b923', territories: ['funeral_plain'] }],
      tokens: [{ layerId: 'token', asset_id: 'gone', x: 10, y: 10, size: 40, rotation: 0 }],
    });
    const { assetsById } = await t.run((ctx) => resolveRulebookReferences(ctx, contentsWith(tinted)));
    expect(assetsById[board.id]?.board).toBeDefined();
    const rendered = projectRulebookDraftRenderBlock(tinted, assetsById);
    expect(rendered).toMatchObject({ kind: 'board-scene', tints: [{ id: 'tint', color: '#e8b923' }] });
    const drawing = rendered.kind === 'board-scene' ? rendered.tints?.[0] : undefined;
    expect(drawing?.fills).toHaveLength(1);
    /* A token whose asset is gone drops out of the drawing; the scene keeps it stored. */
    expect(rendered.kind === 'board-scene' ? rendered.tokens : 'not a scene').toBeUndefined();
  },
  BUDGET_MS
);
