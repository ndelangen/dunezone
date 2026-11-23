/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { expect, test } from 'vite-plus/test';

import { componentGeometrySchema } from '../src/shared/asset-publishing/componentGeometry';
import { ARRAKIS_BOARD_SLUG } from '../src/shared/boards/arrakisOfficial';
import { arrakisBoardCapture } from '../src/shared/boards/arrakisPreset';
import arrakisOfficialGeometry from '../src/shared/rulebooks/fixtures/arrakis-official-geometry.json';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

const geometry = componentGeometrySchema.parse(arrakisOfficialGeometry);
const data = { name: 'Arrakis Official', about: '', board: arrakisBoardCapture.definition };

/* The board row dominates the read; anything near two copies of it means it was read twice. */
const rowBytes = JSON.stringify(data).length;

async function arrakisFixture(bytesRead?: number) {
  const t = applicationTest(bytesRead ? { transactionLimits: { bytesRead } } : {});
  await t.run(async (ctx) => {
    const owner = await ctx.db.insert('users', { name: 'Board owner' });
    const fields = {
      owner_id: owner,
      type: 'board',
      data: data as never,
      slug: ARRAKIS_BOARD_SLUG,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
      is_deleted: false,
      group_id: null,
    };
    const assetId = await ctx.db.insert('assets', fields);
    /* The asset trigger's own write, without the rest of the triggers' reads, which the tight budgets below would count. */
    await ctx.db.insert('publication_assets', {
      asset_type: 'board',
      asset_id: assetId,
      cache_token: 'token-1',
      published_at: 1,
      component_geometry: geometry,
    });
    /* The row the triggers keep, written directly because their reads would count against the tight budgets below. */
    await ctx.db.insert('board_readiness', {
      asset_id: assetId,
      usable: true,
      name: data.name,
      slug: fields.slug,
      owner_id: owner,
      group_id: null,
      created_at: fields.created_at,
      updated_at: fields.updated_at,
      is_deleted: false,
      asset_creation_time: 1,
      publication_token: 'token-1',
    });
  });
  return t;
}

test('the saved Arrakis board reads its large row once', async () => {
  const t = await arrakisFixture(Math.round(rowBytes * 1.5));
  expect((await t.query(api.arrakis.board, {}))?.board).toEqual(data.board);
  expect((await t.query(api.arrakis.face, {}))?.imageUrl).toBeTruthy();
});

test('the read budget is tight enough to catch a second read of the row', async () => {
  const t = await arrakisFixture(Math.round(rowBytes * 0.9));
  await expect(t.query(api.arrakis.board, {})).rejects.toThrow();
});

test('the reference reads the small row only, never the board or its geometry', async () => {
  const t = await arrakisFixture(2000);
  expect(await t.query(api.arrakis.reference, {})).toMatchObject({
    name: 'Arrakis Official',
    revision: 'v1.token-1.2026-10-01T00:00:00.000Z',
  });
});

test('the reference and the board name the same revision, and a save or a republish changes it', async () => {
  const t = await arrakisFixture();
  const revision = async () => {
    const [reference, board] = await Promise.all([t.query(api.arrakis.reference, {}), t.query(api.arrakis.board, {})]);
    expect(reference?.revision).toBe(board?.revision);
    return reference?.revision;
  };
  const first = await revision();
  await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const asset = (await ctx.db.query('assets').collect())[0]!;
    await ctx.db.patch(asset._id, { updated_at: '2026-10-02T00:00:00.000Z' });
  });
  const saved = await revision();
  expect(saved).not.toBe(first);
  await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const publication = (await ctx.db.query('publication_assets').collect())[0]!;
    await ctx.db.patch(publication._id, { cache_token: 'token-2' });
  });
  expect(await revision()).not.toBe(saved);
});
