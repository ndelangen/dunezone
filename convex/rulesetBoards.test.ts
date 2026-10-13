/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { blankBoard } from '../src/shared/boards/geometry';
import { arrakisBoardCapture } from '../src/shared/play/fixtures/board';
import { api, internal } from './_generated/api';
import { playTest, playPerson, playRuleset } from './play.test.fixture';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert('users', { name: 'Owner' });
    const fields = {
      owner_id: owner,
      group_id: null,
      is_deleted: false,
      created_at: '2026-10-13',
      updated_at: '2026-10-13',
    };
    const board = await ctx.db.insert('assets', {
      ...fields,
      type: 'board',
      slug: 'arrakis-official',
      data: { name: 'Arrakis Official', about: '', board: arrakisBoardCapture.definition },
    });
    const missing = await ctx.db.insert('rulesets', {
      ...fields,
      name: 'Missing',
      slug: 'missing',
      about: '',
      image_cover: null,
    });
    const chosen = await ctx.db.insert('rulesets', {
      ...fields,
      name: 'Chosen',
      slug: 'chosen',
      about: '',
      image_cover: null,
    });
    const link = await ctx.db.insert('ruleset_asset_slots', { ruleset_id: chosen, asset_id: board, slot: 'board' });
    return { board, missing, chosen, link };
  });
  return { t, ...ids };
}

test('backfill previews, fills absent slots once, and preserves selected boards and ownership', async () => {
  const { t, board, missing, chosen, link } = await setup();
  const args = { boardId: board, cursor: null, dryRun: true };
  expect(await t.mutation(internal.rulesetBoards.fillMissing, args)).toMatchObject({
    linked: [missing],
    links: [],
    skipped: 1,
    done: true,
  });
  expect((await t.query(api.playCatalogue.rulesetSupply, { rulesetId: missing }))?.board).toBeNull();
  const result = await t.mutation(internal.rulesetBoards.fillMissing, { ...args, dryRun: false });
  expect(result.linked).toEqual([missing]);
  expect(result.links).toHaveLength(1);
  expect(await t.mutation(internal.rulesetBoards.fillMissing, { ...args, dryRun: false })).toMatchObject({
    linked: [],
    links: [],
    skipped: 2,
  });
  expect(await t.run((ctx) => ctx.db.get(link))).toMatchObject({ ruleset_id: chosen, asset_id: board });
});

test('capture supplies a validated board separately from legacy slots and refuses missing, deleted or malformed geometry', async () => {
  const { t, board, chosen, missing } = await setup();
  const supply = await t.query(api.playCatalogue.rulesetSupply, { rulesetId: chosen });
  expect(supply?.board?.definition).toEqual(arrakisBoardCapture.definition);
  expect(supply?.slots).toEqual([]);
  expect((await t.query(api.playCatalogue.rulesetSupply, { rulesetId: missing }))?.board).toBeNull();
  await t.run((ctx) => ctx.db.patch(board, { is_deleted: true }));
  expect((await t.query(api.playCatalogue.rulesetSupply, { rulesetId: chosen }))?.board).toBeNull();
  await t.run((ctx) =>
    ctx.db.patch(board, {
      is_deleted: false,
      data: { name: 'Broken', about: '', board: { ...arrakisBoardCapture.definition, properties: {} } },
    })
  );
  expect((await t.query(api.playCatalogue.rulesetSupply, { rulesetId: chosen }))?.board).toBeNull();
  await t.run((ctx) => ctx.db.patch(board, { type: 'deck' }));
  expect((await t.query(api.playCatalogue.rulesetSupply, { rulesetId: chosen }))?.board).toBeNull();
});

test('asset writes keep ruleset eligibility current and creation refuses a deleted selection', async () => {
  const t = playTest();
  const seeded = await t.run(async (ctx) => {
    const person = await playPerson(ctx, 'Owner');
    return { ...person, rulesetId: await playRuleset(ctx, person.userId) };
  });
  const owner = t.withIdentity({ subject: seeded.subject });
  const board = await owner.mutation(api.assets.create, {
    type: 'board',
    data: { name: 'Custom board', about: '', board: blankBoard() },
  });
  await owner.mutation(api.rulesets.setAssetSlot, { ruleset_id: seeded.rulesetId, asset_id: board.id, slot: 'board' });
  const selectable = async () => {
    const result = await owner.query(api.playGames.creatable, {});
    return result.access === 'allowed' && result.rulesets.find((row) => row.id === seeded.rulesetId)?.selectable;
  };
  expect(await selectable()).toBe(true);
  await owner.mutation(api.assets.update, {
    id: board.id,
    data: { name: 'Edited board', about: '', board: arrakisBoardCapture.definition },
  });
  expect(await selectable()).toBe(true);
  expect((await t.query(api.playCatalogue.rulesetSupply, { rulesetId: seeded.rulesetId }))?.board?.asset.name).toBe(
    'Edited board'
  );
  await owner.mutation(api.assets.softDelete, { id: board.id });
  expect(await selectable()).toBe(false);
  expect(
    await owner.mutation(api.playGames.createGame, { rulesetId: seeded.rulesetId, minimumPlayers: 2 })
  ).toMatchObject({ ok: false, reason: 'unavailable' });
});
