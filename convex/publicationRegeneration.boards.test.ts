/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { expect, test } from 'vite-plus/test';

import { arrakisBoard } from '../src/shared/boards/geometry';
import { internal } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

test('a board regeneration scan takes few boards per transaction, so large boards cannot end it', async () => {
  /* Under a 1 MiB budget a page of twenty real Arrakis definitions fails, as a page of large boards does at 16 MiB. */
  const t = applicationTest({ transactionLimits: { bytesRead: 1024 * 1024, bytesWritten: 1024 * 1024 } });
  const owner = await t.run((ctx) => ctx.db.insert('users', { name: 'Board owner' }));
  const boards = [];
  for (let index = 0; index < 20; index += 1) {
    const board = await t.run(async (raw) => {
      return await applicationTriggers.wrapDB(raw).db.insert('assets', {
        owner_id: owner,
        group_id: null,
        type: 'board',
        slug: `board-${index}`,
        is_deleted: false,
        created_at: '2026-10-20T00:00:00.000Z',
        updated_at: '2026-10-20T00:00:00.000Z',
        data: { name: `Board ${index}`, about: '', board: arrakisBoard() },
      });
    });
    boards.push(board);
  }

  let args = { assetType: 'board', cursor: null as string | null, scanned: 0, enqueued: 0 };
  for (;;) {
    await t.mutation(internal.publicationRegeneration.scan, args);
    const scheduled = await t.run((ctx) =>
      ctx.db.system
        .query('_scheduled_functions')
        .filter((q) => q.eq(q.field('state.kind'), 'pending'))
        .collect()
    );
    const next = scheduled.find((job) => job.name.includes('publicationRegeneration'));
    if (!next) {
      break;
    }
    await t.run((ctx) => ctx.scheduler.cancel(next._id));
    args = next.args[0] as typeof args;
  }
  for (const board of boards) {
    const queued = await t.run(
      async (ctx) =>
        (
          await ctx.db
            .query('publication_jobs')
            .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'board').eq('asset_id', board))
            .first()
        )?._id
    );
    expect(queued).toBeDefined();
  }
});
