/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { expect, test } from 'vite-plus/test';

import { componentGeometrySchema } from '../src/shared/asset-publishing/componentGeometry';
import { ARRAKIS_BOARD_SLUG } from '../src/shared/boards/arrakisOfficial';
import { arrakisBoardCapture } from '../src/shared/boards/arrakisPreset';
import arrakisOfficialGeometry from '../src/shared/rulebooks/fixtures/arrakis-official-geometry.json';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';

const geometry = componentGeometrySchema.parse(arrakisOfficialGeometry);
const data = { name: 'Arrakis Official', about: '', board: arrakisBoardCapture.definition };

/* The board row dominates the read; anything near two copies of it means it was read twice. */
const rowBytes = JSON.stringify(data).length;

async function arrakisFixture(bytesRead?: number) {
  const t = applicationTest(bytesRead ? { transactionLimits: { bytesRead } } : {});
  await t.run(async (ctx) => {
    const owner = await ctx.db.insert('users', { name: 'Board owner' });
    const assetId = await ctx.db.insert('assets', {
      owner_id: owner,
      type: 'board',
      data: data as never,
      slug: ARRAKIS_BOARD_SLUG,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
      is_deleted: false,
      group_id: null,
    });
    await ctx.db.insert('publication_assets', {
      asset_type: 'board',
      asset_id: assetId,
      cache_token: 'token-1',
      published_at: 1,
      component_geometry: geometry,
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
