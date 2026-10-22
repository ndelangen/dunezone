/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { describe, expect, test } from 'vite-plus/test';

import { arrakisBoard, blankBoard } from '../src/shared/boards/geometry';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { assetPageAs } from './viewerAccess.test.fixture';

describe('authored board Assets', () => {
  test('saves editable Arrakis, clones it, and publishes the latest saved geometry', async () => {
    const t = applicationTest();
    const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Board owner' }));
    const owner = t.withIdentity({ subject: ownerId });
    const board = arrakisBoard();
    const created = await owner.mutation(api.assets.create, {
      type: 'board',
      data: { name: 'Arrakis', about: '', board },
    });
    const page = await assetPageAs(owner, { type: 'board', slug: created.slug });
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
    expect((await assetPageAs(owner, { type: 'board', slug: cloned.slug }))?.asset.data).toMatchObject({
      board,
    });
  });
  test('refuses invalid board payloads and unauthorized writes', async () => {
    const t = applicationTest();
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
    expect((await assetPageAs(owner, { type: 'board', slug: created.slug }))?.asset.name).toBe('Board');
  });
});

test('rejects missing territory names and canonical ID collisions on create and update', async () => {
  const t = applicationTest();
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner' }));
  const owner = t.withIdentity({ subject: ownerId });
  const created = await owner.mutation(api.assets.create, {
    type: 'board',
    data: { name: 'Named board', about: '', board: blankBoard() },
  });
  const missing = blankBoard();
  missing.properties = {};
  const empty = blankBoard();
  Object.values(empty.properties)[0].name = ' ';
  const collision = arrakisBoard();
  const values = Object.values(collision.properties);
  values[0].name = 'Rock outcroppings';
  values[1].name = 'ROCK-OUTCROPPINGS';
  for (const board of [missing, empty, collision]) {
    await expect(
      owner.mutation(api.assets.create, { type: 'board', data: { name: 'Invalid names', about: '', board } })
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.assets.update, { id: created.id, data: { name: 'Invalid names', about: '', board } })
    ).rejects.toThrow();
  }
  const renamed = blankBoard();
  const savedId = Object.values(renamed.properties)[0].id;
  Object.values(renamed.properties)[0].name = 'Rock outcroppings';
  await owner.mutation(api.assets.update, { id: created.id, data: { name: 'Named board', about: '', board: renamed } });
  const page = await assetPageAs(owner, { type: 'board', slug: created.slug });
  expect(Object.values((page!.asset.data as { board: typeof renamed }).board.properties)[0]).toMatchObject({
    name: 'Rock outcroppings',
    /* A rename keeps the territory's saved ID, so markup that names it still finds it. */
    id: savedId,
  });
});

test('rejects face-less writes while accepting unfinished cuts inside the circular rim', async () => {
  const t = applicationTest();
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner' }));
  const owner = t.withIdentity({ subject: ownerId });
  const open = {
    nodes: { a: [200, 200], b: [220, 230] },
    edges: [{ id: 'open', a: 'a', b: 'b', kind: 'line' }],
    properties: {},
  };
  for (const board of [{ nodes: {}, edges: [], properties: {} }, open]) {
    await expect(
      owner.mutation(api.assets.create, { type: 'board', data: { name: 'Invalid', about: '', board } })
    ).rejects.toThrow('closed, renderable');
  }
  const board = blankBoard();
  Object.assign(board.nodes, open.nodes);
  board.edges.push({ id: 'open', a: 'a', b: 'b', kind: 'line' });
  const created = await owner.mutation(api.assets.create, {
    type: 'board',
    data: { name: 'Open cut', about: '', board },
  });
  await expect(
    owner.mutation(api.assets.update, { id: created.id, data: { name: 'Invalid update', about: '', board: open } })
  ).rejects.toThrow('closed, renderable');
  expect((await assetPageAs(owner, { type: 'board', slug: created.slug }))?.asset.data).toMatchObject({
    board,
  });
});

test('revalidates changed properties, points and edges after saving identical linework', async () => {
  const t = applicationTest();
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Board author' }));
  const author = t.withIdentity({ subject: userId });
  const board = {
    nodes: { a: [200, 200], b: [250, 200], c: [230, 240] },
    edges: [
      { id: 'ab', a: 'a', b: 'b', kind: 'line' as const },
      { id: 'bc', a: 'b', b: 'c', kind: 'line' as const },
      { id: 'ca', a: 'c', b: 'a', kind: 'line' as const },
    ],
    properties: {
      'ab|bc|ca': { name: 'Triangle', id: 'triangle', type: 'sand' as const, insetLine: 'none' as const, decals: [] },
    },
  };
  const data = { name: 'Triangle', about: '', board };
  const created = await author.mutation(api.assets.create, { type: 'board', data });
  await author.mutation(api.assets.create, { type: 'board', data: structuredClone(data) });
  const missing = structuredClone(data);
  missing.board.properties = {} as typeof board.properties;
  await expect(author.mutation(api.assets.update, { id: created.id, data: missing })).rejects.toThrow(
    'Every territory needs a name'
  );
  const unnamed = structuredClone(data);
  unnamed.board.properties['ab|bc|ca'].name = ' ';
  await expect(author.mutation(api.assets.update, { id: created.id, data: unnamed })).rejects.toThrow();
  const flat = structuredClone(data);
  flat.board.nodes.c = [225, 200];
  await expect(author.mutation(api.assets.update, { id: created.id, data: flat })).rejects.toThrow(
    'closed, renderable'
  );
  const open = structuredClone(data);
  open.board.edges.pop();
  await expect(author.mutation(api.assets.update, { id: created.id, data: open })).rejects.toThrow(
    'closed, renderable'
  );
  expect((await assetPageAs(author, { type: 'board', slug: created.slug }))?.asset.data).toMatchObject(data);
});
