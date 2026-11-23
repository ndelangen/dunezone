/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { componentGeometrySchema } from '../src/shared/asset-publishing/componentGeometry';
import { ARRAKIS_BOARD_SLUG } from '../src/shared/boards/arrakisOfficial';
import { arrakisBoardCapture } from '../src/shared/boards/arrakisPreset';
import arrakisOfficialGeometry from '../src/shared/rulebooks/fixtures/arrakis-official-geometry.json';
import { api, internal } from './_generated/api';
import { applicationTriggers } from './lib/applicationTriggers';
import { rulebookFixture } from './rulebooks.test.fixture';

type Fixture = Awaited<ReturnType<typeof rulebookFixture>>;

const geometry = componentGeometrySchema.parse(arrakisOfficialGeometry);

async function insertArrakis(
  f: Fixture,
  isDeleted = false,
  data: unknown = { name: 'Arrakis Official', about: '', board: arrakisBoardCapture.definition }
) {
  /* Through the triggers, as every app write is, so the board's reference row exists. */
  return await f.t.run((rawCtx) =>
    applicationTriggers.wrapDB(rawCtx).db.insert('assets', {
      owner_id: f.ids.ownerId,
      type: 'board',
      data: data as never,
      slug: ARRAKIS_BOARD_SLUG,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
      is_deleted: isDeleted,
      group_id: null,
    })
  );
}

async function publish(f: Fixture, assetId: string) {
  await f.t.run((rawCtx) =>
    applicationTriggers.wrapDB(rawCtx).db.insert('publication_assets', {
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
      revision: 'v1.token-1.2026-10-01T00:00:00.000Z',
    });
    /* The reference finds the same live board through its own row, past the deleted one. */
    expect((await f.t.query(api.arrakis.reference, {}))?.assetId).toBe(id);
  });
});

describe('The saved Arrakis board while it republishes', () => {
  test.each(['pending', 'error'] as const)(
    'keeps its published face and its own board data while a new capture is %s',
    async (status) => {
      const f = await rulebookFixture();
      const id = await insertArrakis(f);
      await publish(f, id);
      await f.t.run((ctx) =>
        ctx.db.insert('publication_jobs', {
          asset_type: 'board',
          asset_id: id,
          asset_data: { name: 'Arrakis Official', about: '', board: arrakisBoardCapture.definition },
          status,
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
    }
  );
});

describe('The saved Arrakis face, kept for bundles from before the board query', () => {
  test('stays when the saved board data no longer passes the board schema', async () => {
    const f = await rulebookFixture();
    const id = await insertArrakis(f, false, { name: 'Arrakis Official', about: '', board: { territories: 'broken' } });
    await publish(f, id);
    expect(await f.t.query(api.arrakis.board, {})).toBeNull();
    expect(await f.t.query(api.arrakis.face, {})).toEqual({
      assetId: id,
      imageUrl: expect.stringContaining(id),
      geometry,
    });
  });

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

describe('The saved Arrakis reference', () => {
  test('carries the publication token on its own row once the board is published, and falls back to the publication row before', async () => {
    const f = await rulebookFixture();
    const id = await insertArrakis(f);
    expect(await f.t.query(api.arrakis.reference, {})).toBeNull();
    await publish(f, id);
    const row = await f.t.run(async (ctx) =>
      ctx.db
        .query('board_readiness')
        .withIndex('by_asset', (q) => q.eq('asset_id', id))
        .unique()
    );
    expect(row?.publication_token).toBe('token-1');
    expect(await f.t.query(api.arrakis.reference, {})).toEqual({
      assetId: id,
      name: 'Arrakis Official',
      revision: 'v1.token-1.2026-10-01T00:00:00.000Z',
    });
    /* A row from before the token, as production's is until the board's next write. */
    await f.t.run(async (ctx) => {
      await ctx.db.patch(row!._id, { publication_token: undefined });
    });
    expect((await f.t.query(api.arrakis.reference, {}))?.revision).toBe('v1.token-1.2026-10-01T00:00:00.000Z');
  });
});

describe('The board rows’ publication token backfill', () => {
  test('gives a row from before the token its token, and reruns harmlessly', async () => {
    const f = await rulebookFixture();
    const id = await insertArrakis(f);
    await publish(f, id);
    const row = async () =>
      await f.t.run((ctx) =>
        ctx.db
          .query('board_readiness')
          .withIndex('by_asset', (q) => q.eq('asset_id', id))
          .unique()
      );
    const before = await row();
    await f.t.run((ctx) => ctx.db.patch(before!._id, { publication_token: undefined }));
    await f.t.mutation(internal.migrations.board_readiness_publication_token_v1, {});
    const after = await row();
    expect(after?.publication_token).toBe('token-1');
    await f.t.mutation(internal.migrations.board_readiness_publication_token_v1, {});
    expect(await row()).toEqual(after);
  });
});

describe('The saved Arrakis revision', () => {
  test('changes while capture work is open, so an answer that work could withhold is not cached under the old name', async () => {
    const f = await rulebookFixture();
    const id = await insertArrakis(f);
    await publish(f, id);
    const before = (await f.t.query(api.arrakis.reference, {}))?.revision;
    await f.t.run((rawCtx) =>
      applicationTriggers.wrapDB(rawCtx).db.insert('publication_jobs', {
        asset_type: 'board',
        asset_id: id,
        asset_data: { name: 'Arrakis Official', about: '', board: arrakisBoardCapture.definition },
        status: 'pending',
        attempt_counter: 0,
        created_at: 2,
        updated_at: 2,
      } as never)
    );
    const [reference, board] = await Promise.all([
      f.t.query(api.arrakis.reference, {}),
      f.t.query(api.arrakis.board, {}),
    ]);
    expect(reference?.revision).not.toBe(before);
    expect(board?.revision).toBe(reference?.revision);
  });

  test('a board save keeps the publication token on its row without reading the publication', async () => {
    const f = await rulebookFixture();
    const id = await insertArrakis(f);
    await publish(f, id);
    await f.t.run((rawCtx) =>
      applicationTriggers.wrapDB(rawCtx).db.patch(id as never, { updated_at: '2026-10-05T00:00:00.000Z' })
    );
    expect(await f.t.query(api.arrakis.reference, {})).toMatchObject({
      revision: 'v1.token-1.2026-10-05T00:00:00.000Z',
    });
  });
});

test('the reference still names a board whose saved data fails its schema, whose own null pages then fall back to', async () => {
  const f = await rulebookFixture();
  const id = await insertArrakis(f, false, { name: 'Arrakis Official', about: '', board: { territories: 'broken' } });
  await publish(f, id);
  expect(await f.t.query(api.arrakis.board, {})).toBeNull();
  expect((await f.t.query(api.arrakis.reference, {}))?.revision).toMatch(/^v1\./);
});
