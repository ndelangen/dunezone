/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { expect, test } from 'vite-plus/test';

import { arrakisBoard } from '../src/shared/boards/geometry';
import { projectRulebookSource } from '../src/shared/rulebooks/projectRenderDocument';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { resolveRulebookReferences } from './lib/rulebookReferences';

/* An Arrakis board save validates the full geometry; CI runs files in parallel, so the 5 s default is too tight. */
const BUDGET_MS = 30_000;

const contentsWithBoard = (boardId: string) => ({
  version: 1,
  pageOrder: ['page'],
  pagesById: {
    page: {
      layoutId: 'standard',
      blocksById: {
        scene: {
          kind: 'board-scene',
          boardId,
          caption: '',
          players: [],
          troops: [],
          highlights: [{ territory: 'funeral-plain', color: '#ff0000' }],
          annotations: [],
        },
      },
    },
  },
});

test(
  'a Rulebook board scene on a saved board resolves its published image and its territories, and waits for the image',
  async () => {
    const t = applicationTest();
    const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Creator' }));
    const owner = t.withIdentity({ subject: ownerId });
    const board = await owner.mutation(api.assets.create, {
      type: 'board',
      data: { name: 'Arrakis copy', about: '', board: arrakisBoard() },
    });
    const contents = contentsWithBoard(board.id) as unknown as Parameters<typeof resolveRulebookReferences>[1];
    const reference = { kind: 'board' as const, boardId: board.id };

    await t.run(async (ctx) => {
      for (const row of await ctx.db.query('publication_assets').take(10)) {
        await ctx.db.delete(row._id);
      }
    });
    const pending = await t.run((ctx) => resolveRulebookReferences(ctx, contents));
    expect(projectRulebookSource(reference, pending.assetsById).status).toBe('unavailable');

    await t.run((ctx) =>
      ctx.db.insert('publication_assets', {
        asset_type: 'board',
        asset_id: board.id,
        cache_token: 'tok',
        published_at: 1,
      })
    );
    const { assetsById } = await t.run((ctx) => resolveRulebookReferences(ctx, contents));
    const source = projectRulebookSource(reference, assetsById);
    expect(source).toMatchObject({ status: 'ready', name: 'Arrakis copy', width: 1948, height: 1948 });
    const parts = source.status === 'ready' ? (source.geometry?.parts ?? []) : [];
    expect(parts.find((part) => part.key === 'funeral-plain')?.highlight?.paths).toHaveLength(1);

    await owner.mutation(api.assets.softDelete, { id: board.id });
    const gone = await t.run((ctx) => resolveRulebookReferences(ctx, contents));
    expect(projectRulebookSource(reference, gone.assetsById).status).toBe('unavailable');
  },
  BUDGET_MS
);
