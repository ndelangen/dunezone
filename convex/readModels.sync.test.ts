/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { arrakisBoard, blankBoard } from '../src/shared/boards/geometry';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { factionAuthor, factionTest, insertStoredFactions } from './factions.test.fixture';
import { assetDisplayName } from './lib/assetInput';
import { syncBoardReadiness } from './lib/boardReadiness';
import { FACTION_CARD_PROJECTION, syncFactionCard } from './lib/factionCards';
import { toCatalogueFaction } from './lib/factionCatalogue';

type FactionTest = ReturnType<typeof factionTest>;

/* The card every faction should have, built from the faction the way the catalogue builds it today. */
function expectedCard(faction: Doc<'factions'>) {
  return {
    faction_id: faction._id,
    owner_id: faction.owner_id,
    group_id: faction.group_id,
    slug: faction.slug,
    created_at: faction.created_at,
    updated_at: faction.updated_at,
    is_deleted: faction.is_deleted,
    faction_creation_time: faction._creationTime,
    projection: FACTION_CARD_PROJECTION,
    data: toCatalogueFaction(faction, []).data,
  };
}

function expectedBoardListing(asset: Doc<'assets'>) {
  return {
    asset_id: asset._id,
    name: assetDisplayName(asset),
    slug: asset.slug,
    owner_id: asset.owner_id,
    group_id: asset.group_id,
    created_at: asset.created_at,
    updated_at: asset.updated_at,
    is_deleted: asset.is_deleted,
    asset_creation_time: asset._creationTime,
  };
}

async function readModels(t: FactionTest) {
  return await t.run(async (ctx) => ({
    factions: await ctx.db.query('factions').collect(),
    cards: await ctx.db.query('faction_cards').collect(),
    boards: (await ctx.db.query('assets').collect()).filter((asset) => asset.type === 'board'),
    readiness: await ctx.db.query('board_readiness').collect(),
  }));
}

/* Every faction has exactly its card, and every board exactly its listing, with nothing left over. */
async function assertInSync(t: FactionTest) {
  const { factions, cards, boards, readiness } = await readModels(t);
  const strip = <Row extends { _id: unknown; _creationTime: unknown }>({ _id, _creationTime, ...rest }: Row) => rest;
  expect(cards.map(strip).sort((a, b) => a.faction_id.localeCompare(b.faction_id))).toEqual(
    factions.map(expectedCard).sort((a, b) => a.faction_id.localeCompare(b.faction_id))
  );
  expect(
    readiness.map(({ usable: _usable, ...row }) => strip(row)).sort((a, b) => a.asset_id.localeCompare(b.asset_id))
  ).toEqual(boards.map(expectedBoardListing).sort((a, b) => a.asset_id.localeCompare(b.asset_id)));
}

describe('faction cards and board listings', () => {
  test('follow every faction and board write', async () => {
    const t = factionTest();
    const author = await factionAuthor(t, 'Card Author');

    const faction = await author.mutation(api.factions.create, {
      data: { ...assetPublishingFaction, name: 'Fremen' },
    });
    await assertInSync(t);

    await author.mutation(api.factions.update, {
      id: faction._id,
      data: { ...assetPublishingFaction, name: 'Fremen of Sietch Tabr' },
    });
    await assertInSync(t);

    const board = await author.mutation(api.assets.create, {
      type: 'board',
      data: { name: 'Arrakis', about: '', board: arrakisBoard() },
    });
    await author.mutation(api.assets.update, { id: board.id, data: { name: 'Small', about: '', board: blankBoard() } });
    await assertInSync(t);

    await author.mutation(api.factions.softDelete, { id: faction._id });
    await author.mutation(api.assets.softDelete, { id: board.id });
    await assertInSync(t);
  }, 20_000);

  test('a faction whose stored data no longer parses keeps a card without data', async () => {
    const t = factionTest();
    const [id] = await insertStoredFactions(t, [{ slug: 'broken', data: { leaders: 'not a list' } }]);
    await t.mutation(internal.migrations.faction_cards_v1, {});
    const { cards } = await readModels(t);
    expect(cards).toMatchObject([{ faction_id: id, slug: 'broken', data: null }]);
  });

  test('the backfills fill rows written without triggers, and rerunning them writes nothing', async () => {
    const t = factionTest();
    await insertStoredFactions(t, [
      { slug: 'atreides', data: assetPublishingFaction },
      { slug: 'gone', data: assetPublishingFaction, isDeleted: true },
    ]);
    await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Board owner' });
      const board = await ctx.db.insert('assets', {
        owner_id: ownerId,
        type: 'board',
        data: { name: 'Legacy', about: '', board: blankBoard() },
        slug: 'legacy',
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
        is_deleted: false,
        group_id: null,
      });
      /* A row as `board_readiness_v1` left it, before the listing fields existed. */
      await ctx.db.insert('board_readiness', { asset_id: board, usable: true });
    });

    await t.mutation(internal.migrations.faction_cards_v1, {});
    await t.mutation(internal.migrations.board_readiness_listing_v1, {});
    await assertInSync(t);

    /* A rerun goes through a database that refuses every write, so an unconditional rewrite fails here. */
    await t.run(async (ctx) => {
      const refuse = () => {
        throw new Error('a rerun wrote to the database');
      };
      const db = new Proxy(ctx.db, {
        get: (target, key) =>
          ['insert', 'patch', 'replace', 'delete'].includes(String(key))
            ? refuse
            : (Reflect.get(target, key, target).bind?.(target) ?? Reflect.get(target, key, target)),
      });
      const readOnly = { ...ctx, db };
      for (const faction of await ctx.db.query('factions').collect()) {
        await syncFactionCard(readOnly, faction._id, faction);
      }
      for (const asset of await ctx.db.query('assets').collect()) {
        await syncBoardReadiness(readOnly, asset._id, asset);
      }
    });
    await assertInSync(t);
  });
});
