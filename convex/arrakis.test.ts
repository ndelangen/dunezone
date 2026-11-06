/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { componentGeometrySchema } from '../src/shared/asset-publishing/componentGeometry';
import { ARRAKIS_BOARD_SLUG } from '../src/shared/boards/arrakisOfficial';
import { arrakisBoardCapture } from '../src/shared/boards/arrakisPreset';
import arrakisOfficialGeometry from '../src/shared/rulebooks/fixtures/arrakis-official-geometry.json';
import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

type Fixture = Awaited<ReturnType<typeof rulebookFixture>>;

const geometry = componentGeometrySchema.parse(arrakisOfficialGeometry);

async function insertArrakis(f: Fixture, isDeleted = false) {
  return await f.t.run((ctx) =>
    ctx.db.insert('assets', {
      owner_id: f.ids.ownerId,
      type: 'board',
      data: { name: 'Arrakis Official', about: '', board: arrakisBoardCapture.definition },
      slug: ARRAKIS_BOARD_SLUG,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
      is_deleted: isDeleted,
      group_id: null,
    })
  );
}

async function publish(f: Fixture, assetId: string) {
  await f.t.run((ctx) =>
    ctx.db.insert('publication_assets', {
      asset_type: 'board',
      asset_id: assetId,
      cache_token: 'token-1',
      published_at: 1,
      component_geometry: geometry,
    })
  );
}

describe('The saved Arrakis board', () => {
  test('is null while the site has no saved Arrakis, or only a deleted one', async () => {
    const f = await rulebookFixture();
    expect(await f.t.query(api.arrakis.board, {})).toBeNull();
    await publish(f, await insertArrakis(f, true));
    expect(await f.t.query(api.arrakis.board, {})).toBeNull();
  });

  test('is null until the board is published', async () => {
    const f = await rulebookFixture();
    await insertArrakis(f);
    expect(await f.t.query(api.arrakis.board, {})).toBeNull();
  });

  test('answers the live board’s id, name, published image, territories and own data, beside a deleted one of the same slug', async () => {
    const f = await rulebookFixture();
    await insertArrakis(f, true);
    const id = await insertArrakis(f);
    await publish(f, id);
    expect(await f.t.query(api.arrakis.board, {})).toEqual({
      assetId: id,
      name: 'Arrakis Official',
      imageUrl: expect.stringContaining(id),
      geometry,
      board: arrakisBoardCapture.definition,
    });
  });
});

describe('The saved Arrakis board while it republishes', () => {
  test('keeps its published face and its own board data while a new capture is queued or has failed', async () => {
    const f = await rulebookFixture();
    const id = await insertArrakis(f);
    await publish(f, id);
    await f.t.run((ctx) =>
      ctx.db.insert('publication_jobs', {
        asset_type: 'board',
        asset_id: id,
        asset_data: { name: 'Arrakis Official', about: '', board: arrakisBoardCapture.definition },
        status: 'error',
        attempt_counter: 3,
        created_at: 2,
        updated_at: 2,
      } as never)
    );
    expect(await f.t.query(api.arrakis.board, {})).toMatchObject({
      assetId: id,
      geometry,
      board: arrakisBoardCapture.definition,
    });
    expect(await f.t.query(api.arrakis.face, {})).toMatchObject({ assetId: id, geometry });
  });
});

describe('The saved Arrakis face, kept for bundles from before the board query', () => {
  test('answers only the live board’s id, published image and territories', async () => {
    const f = await rulebookFixture();
    const id = await insertArrakis(f);
    expect(await f.t.query(api.arrakis.face, {})).toBeNull();
    await publish(f, id);
    expect(await f.t.query(api.arrakis.face, {})).toEqual({
      assetId: id,
      imageUrl: expect.stringContaining(id),
      geometry,
    });
  });
});
