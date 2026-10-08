/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { arrakisBoard, blankBoard } from '../src/shared/boards/geometry';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
describe('authored board Assets', () => {
  test('saves editable Arrakis, clones it, and publishes the latest saved geometry', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Board owner' }));
    const owner = t.withIdentity({ subject: ownerId });
    const board = arrakisBoard();
    const created = await owner.mutation(api.assets.create, {
      type: 'board',
      data: { name: 'Arrakis', about: '', board },
    });
    const page = await owner.query(api.assets.getPage, { type: 'board', slug: created.slug });
    expect(page?.asset.data).toEqual({ name: 'Arrakis', about: '', board });
    expect(page?.viewerAccess.capabilities.edit).toBe(true);
    expect(page?.assetPublishing?.captureStatus).toBe('scheduled');
    const cloned = await owner.mutation(api.assets.create, {
      type: 'board',
      data: { name: 'New Arrakis', about: '', board },
    });
    expect(cloned.id).not.toBe(created.id);
    const changed = blankBoard();
    await owner.mutation(api.assets.update, { id: created.id, data: { name: 'Arrakis', about: '', board: changed } });
    const jobs = await t.run((ctx) =>
      ctx.db
        .query('publication_jobs')
        .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'board').eq('asset_id', created.id))
        .collect()
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].asset_data).toEqual({ assetId: created.id, slug: created.slug, board: changed });
    expect((await owner.query(api.assets.getPage, { type: 'board', slug: cloned.slug }))?.asset.data).toMatchObject({
      board,
    });
  });
  test('refuses invalid board payloads and unauthorized writes', async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner' }));
    const otherId = await t.run((ctx) => ctx.db.insert('users', { name: 'Other' }));
    const owner = t.withIdentity({ subject: ownerId });
    const board = blankBoard();
    const created = await owner.mutation(api.assets.create, {
      type: 'board',
      data: { name: 'Board', about: '', board },
    });
    await expect(
      t
        .withIdentity({ subject: otherId })
        .mutation(api.assets.update, { id: created.id, data: { name: 'Stolen', about: '', board } })
    ).rejects.toThrow('Not authorized');
    board.nodes.outside = [900, 900];
    await expect(
      owner.mutation(api.assets.update, { id: created.id, data: { name: 'Broken', about: '', board } })
    ).rejects.toThrow();
    expect((await owner.query(api.assets.getPage, { type: 'board', slug: created.slug }))?.asset.name).toBe('Board');
  });
});
