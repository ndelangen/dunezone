/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { describe, expect, test } from 'vite-plus/test';

import { publishingSpiceCard } from '../src/shared/assets/fixtures/publishingSpiceCard';
import { SPICE_BOARD_REVISION } from '../src/shared/assets/schema';
import { ARRAKIS_BOARD_SLUG } from '../src/shared/boards/arrakisOfficial';
import { arrakisBoard } from '../src/shared/boards/geometry';
import { propertyId } from '../src/shared/boards/schema';
import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { contentsOnBoard } from './arrakisMigrations';
import { rulebookDraftContentsHash, rulebookEditionContentsHash } from './lib/rulebookEditionContents';
import { rulebookFixture } from './rulebooks.test.fixture';

/* Saving the Arrakis board validates its full geometry; CI runs files in parallel, so the 5 s default is too tight. */
const BUDGET_MS = 30_000;

type Fixture = Awaited<ReturnType<typeof rulebookFixture>>;

async function insertCard(f: Fixture, slug: string, data: unknown, isDeleted = false) {
  return await f.t.run((ctx) =>
    ctx.db.insert('assets', {
      owner_id: f.ids.ownerId,
      type: 'card-spice',
      data,
      slug,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
      is_deleted: isDeleted,
      group_id: null,
    })
  );
}

async function saveArrakis(f: Fixture) {
  const board = await f.owner.mutation(api.assets.create, {
    type: 'board',
    data: { name: 'Arrakis official', about: '', board: arrakisBoard() },
  });
  expect(board.slug).toBe(ARRAKIS_BOARD_SLUG);
  return board.id as Id<'assets'>;
}

const cardData = (f: Fixture, id: Id<'assets'>) => f.t.run(async (ctx) => (await ctx.db.get('assets', id))!.data);

/** A card as the move leaves it: its old highlight list removed, every other field as stored. */
const withoutList = ({ highlights: _highlights, ...rest }: Record<string, unknown>) => rest;

describe('Arrakis board migration', () => {
  test(
    'links classic Spice cards to the saved board, carrying their highlights, and removes linked cards’ old lists',
    async () => {
      const f = await rulebookFixture();
      migrationsTest.register(f.t);
      /* Spice cards publish once their renderer is on, as in production. */
      await f.t.run((ctx) =>
        ctx.db.insert('admin_settings', {
          key: 'publication',
          publication_pickup_enabled: true,
          renderer_revisions: { 'card-spice': SPICE_BOARD_REVISION },
          updated_at: 1,
        })
      );
      const classic = { ...publishingSpiceCard, subName: 'Spice blow', highlights: ['arsunt', 'strongholds', 'polar'] };
      const classicId = await insertCard(f, 'classic', classic);
      const deletedId = await insertCard(f, 'deleted', { ...classic, highlights: [] }, true);

      /* Without the saved board nothing moves. */
      await f.t.mutation(internal.arrakisMigrations.arrakis_spice_cards_v1, {});
      expect(await cardData(f, classicId)).toEqual(classic);

      const boardId = await saveArrakis(f);
      const linked = {
        ...publishingSpiceCard,
        highlights: ['arsunt'],
        board: {
          asset_id: boardId,
          tints: [{ id: 'blow', name: 'Blow', color: '#9e5f00', territories: ['arsunt'] }],
          tokens: [],
        },
      };
      const linkedId = await insertCard(f, 'linked', linked);
      await f.t.mutation(internal.arrakisMigrations.arrakis_spice_cards_v1, { reset: true });
      expect(
        await f.t.mutation(internal.arrakisMigrations.arrakis_spice_cards_verify_v1, { reset: true })
      ).toMatchObject({ Status: expect.not.stringContaining('failed') });

      expect(await cardData(f, classicId)).toEqual({
        ...withoutList(classic),
        board: {
          asset_id: boardId,
          tokens: [],
          tints: [
            {
              id: 'highlights',
              name: 'Spice blow',
              color: '#9e5f00',
              territories: ['arsunt', 'polar_sink'],
              types: ['stronghold'],
            },
          ],
        },
      });
      expect(await cardData(f, linkedId)).toEqual(withoutList(linked));
      const deleted = await cardData(f, deletedId);
      expect(deleted).toMatchObject({ board: { asset_id: boardId, tints: [] } });
      expect(deleted).not.toHaveProperty('highlights');

      const migrated = await Promise.all([classicId, linkedId, deletedId].map((id) => cardData(f, id)));
      await f.t.run(async (ctx) => {
        const relation = await ctx.db
          .query('asset_relations')
          .withIndex('by_from_kind', (q) => q.eq('from_asset_id', classicId).eq('kind', 'spice-card-board'))
          .unique();
        expect(relation?.to_asset_id).toBe(boardId);
        const jobs = await ctx.db
          .query('publication_jobs')
          .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'card-spice').eq('asset_id', classicId))
          .take(5);
        /* The job captures the moved card, not the row as it was. */
        expect(jobs.at(-1)?.asset_data).toMatchObject({ card: { board: { asset_id: boardId } } });
        expect(jobs.at(-1)?.asset_data).not.toHaveProperty('card.highlights');
      });

      await f.t.mutation(internal.arrakisMigrations.arrakis_spice_cards_v1, { reset: true });
      expect(await Promise.all([classicId, linkedId, deletedId].map((id) => cardData(f, id)))).toEqual(migrated);
    },
    BUDGET_MS
  );

  test(
    'counts a type highlight as drawn when a tint lists its territories instead',
    async () => {
      const f = await rulebookFixture();
      migrationsTest.register(f.t);
      const boardId = await saveArrakis(f);
      /* An editor's paint spells the strongholds as their territories; that still draws the old group highlight. */
      const strongholds = Object.values(arrakisBoard().properties)
        .filter((property) => property.type === 'stronghold')
        .map((property) => propertyId(property));
      const painted = {
        ...publishingSpiceCard,
        highlights: ['strongholds'],
        board: {
          asset_id: boardId,
          tints: [{ id: 'blow', name: 'Blow', color: '#9e5f00', territories: strongholds }],
          tokens: [],
        },
      };
      const paintedId = await insertCard(f, 'painted', painted);
      await f.t.mutation(internal.arrakisMigrations.arrakis_spice_cards_v1, {});
      expect(await cardData(f, paintedId)).toEqual(withoutList(painted));
    },
    BUDGET_MS
  );

  test(
    'resolves a type highlight against the board a card already links',
    async () => {
      const f = await rulebookFixture();
      migrationsTest.register(f.t);
      await saveArrakis(f);
      /* A custom board where one stronghold became rock: four strongholds, not Arrakis's five. */
      const custom = arrakisBoard();
      const [demoted, ...kept] = Object.entries(custom.properties).filter(
        ([, property]) => property.type === 'stronghold'
      );
      custom.properties[demoted![0]] = { ...demoted![1], type: 'rock' };
      const created = await f.owner.mutation(api.assets.create, {
        type: 'board',
        data: { name: 'Four strongholds', about: '', board: custom },
      });
      const card = {
        ...publishingSpiceCard,
        highlights: ['strongholds'],
        board: {
          asset_id: created.id,
          tints: [
            {
              id: 'blow',
              name: 'Blow',
              color: '#9e5f00',
              territories: kept.map(([, property]) => propertyId(property)),
            },
          ],
          tokens: [],
        },
      };
      const cardId = await insertCard(f, 'custom', card);
      await f.t.mutation(internal.arrakisMigrations.arrakis_spice_cards_v1, {});
      expect(await cardData(f, cardId)).toEqual(withoutList(card));
    },
    BUDGET_MS
  );

  test(
    'leaves a card it cannot move as it is, and the verify names a live one',
    async () => {
      const f = await rulebookFixture();
      migrationsTest.register(f.t);
      const boardId = await saveArrakis(f);
      /* Its tints do not draw its old highlight, so clearing it would lose it. */
      const uncovered = {
        ...publishingSpiceCard,
        highlights: ['polar'],
        board: {
          asset_id: boardId,
          tints: [{ id: 'blow', name: 'Blow', color: '#9e5f00', territories: ['arsunt'] }],
          tokens: [],
        },
      };
      const uncoveredId = await insertCard(f, 'uncovered', uncovered);
      const brokenId = await insertCard(f, 'broken', { highlights: 'not a list' }, true);
      const emptyId = await insertCard(f, 'empty', null);
      await f.t.mutation(internal.arrakisMigrations.arrakis_spice_cards_v1, {});
      expect(await cardData(f, uncoveredId)).toEqual(uncovered);
      expect(await cardData(f, brokenId)).toEqual({ highlights: 'not a list' });
      expect(await cardData(f, emptyId)).toBeNull();

      await expect(f.t.mutation(internal.arrakisMigrations.arrakis_spice_cards_verify_v1, {})).resolves.toMatchObject({
        Status: expect.stringContaining(`card-spice ${uncoveredId} is still on the built-in Arrakis map.`),
      });
      /* The deleted, unparseable row never blocks the deploy. */
      await f.t.run((ctx) => ctx.db.delete('assets', uncoveredId));
      expect(
        await f.t.mutation(internal.arrakisMigrations.arrakis_spice_cards_verify_v1, { reset: true })
      ).toMatchObject({ Status: expect.not.stringContaining('failed') });
    },
    BUDGET_MS
  );

  test(
    'removes the emptied highlight list from stored cards and their settled captures, and the verifies name what is left',
    async () => {
      const f = await rulebookFixture();
      migrationsTest.register(f.t);
      const boardId = await saveArrakis(f);
      const onBoard = { ...publishingSpiceCard, board: { asset_id: boardId, tints: [], tokens: [] } };
      const emptiedId = await insertCard(f, 'emptied', { ...onBoard, highlights: [] });
      const cleanId = await insertCard(f, 'clean', onBoard);
      const deletedId = await insertCard(f, 'deleted', { ...onBoard, highlights: ['arsunt'] }, true);
      const brokenId = await insertCard(f, 'broken', { ...onBoard, highlights: null });
      /* A live list that still names a territory is kept for the verify to name, so its tint never silently goes missing. */
      const namingId = await insertCard(f, 'naming', { ...onBoard, highlights: ['arsunt'] });
      const queued = { assetId: emptiedId, slug: 'emptied', card: { ...onBoard, highlights: [] } };
      const job = (status: 'error' | 'in_progress') =>
        f.t.run((ctx) =>
          ctx.db.insert('publication_jobs', {
            asset_type: 'card-spice',
            asset_id: emptiedId,
            asset_data: queued,
            status,
            attempt_counter: 1,
            created_at: 1,
            updated_at: 1,
          })
        );
      const erroredId = await job('error');
      /* A running capture keeps the payload its completion hashes. */
      const runningId = await job('in_progress');
      const jobData = (id: Id<'publication_jobs'>) =>
        f.t.run(async (ctx) => (await ctx.db.get('publication_jobs', id))!.asset_data);

      await expect(
        f.t.mutation(internal.arrakisMigrations.arrakis_spice_highlights_verify_jobs_v1, {})
      ).resolves.toMatchObject({ Status: expect.stringContaining(`publication job ${erroredId}`) });
      /* The board-sized budget pages three cards at a time; one larger page runs them all here. */
      await f.t.mutation(internal.arrakisMigrations.arrakis_spice_highlights_strip_v1, { batchSize: 10 });

      expect(await cardData(f, emptiedId)).toEqual(onBoard);
      expect(await cardData(f, cleanId)).toEqual(onBoard);
      expect(await cardData(f, deletedId)).toEqual(onBoard);
      expect(await cardData(f, brokenId)).toEqual(onBoard);
      expect(await cardData(f, namingId)).toEqual({ ...onBoard, highlights: ['arsunt'] });
      expect(await jobData(erroredId)).toEqual({ ...queued, card: onBoard });
      expect(await jobData(runningId)).toEqual(queued);
      expect(
        await f.t.mutation(internal.arrakisMigrations.arrakis_spice_highlights_verify_jobs_v1, { reset: true })
      ).toMatchObject({ Status: expect.not.stringContaining('failed') });
      await expect(
        f.t.mutation(internal.arrakisMigrations.arrakis_spice_highlights_verify_cards_v1, {})
      ).resolves.toMatchObject({
        Status: expect.stringContaining(`card-spice ${namingId} still carries a highlights list.`),
      });

      /* A second pass changes nothing, and once the live list is gone the verify passes. */
      await f.t.run((ctx) => ctx.db.delete('assets', namingId));
      await f.t.mutation(internal.arrakisMigrations.arrakis_spice_highlights_strip_v1, { reset: true, batchSize: 10 });
      expect(await cardData(f, emptiedId)).toEqual(onBoard);
      expect(
        await f.t.mutation(internal.arrakisMigrations.arrakis_spice_highlights_verify_cards_v1, { reset: true })
      ).toMatchObject({ Status: expect.not.stringContaining('failed') });
    },
    BUDGET_MS
  );

  test(
    'renames the built-in board in Rulebook Contents with the hashes taken over them',
    async () => {
      const f = await rulebookFixture();
      migrationsTest.register(f.t);
      const created = await f.owner.mutation(api.rulebooks.create, {
        catalogue_version: RULEBOOK_CATALOGUE_VERSION,
        ruleset_id: f.ids.rulesetId,
        name: 'Arrakis manual',
        source: { kind: 'starter' },
      });
      const legacy = {
        ...(created.draft.contents as object),
        scenes: [
          { boardId: 'arrakis', note: 'arrakis', highlights: [{ territory: 'greater-flat' }] },
          /* Another board's own territory of that name is its own. */
          { boardId: 'custom-board', highlights: [{ territory: 'greater-flat' }] },
        ],
      };
      await f.t.run(async (ctx) => {
        await ctx.db.patch('rulebook_drafts', created.draft._id, { contents: legacy, contents_hash: 'v1:before' });
        const stored = (await ctx.db
          .query('rulebook_edition_contents')
          .withIndex('by_edition_id', (q) => q.eq('edition_id', created.edition._id))
          .unique())!;
        await ctx.db.patch('rulebook_edition_contents', stored._id, { contents: legacy });
        await ctx.db.patch('rulebook_editions', created.edition._id, { contents_hash: 'v1:before' });
      });
      const boardId = await saveArrakis(f);

      const migrate = async () => {
        await f.t.mutation(internal.arrakisMigrations.arrakis_rulebook_drafts_v1, { reset: true });
        await f.t.mutation(internal.arrakisMigrations.arrakis_rulebook_edition_contents_v1, { reset: true });
      };
      const rows = () =>
        f.t.run(async (ctx) => ({
          draft: (await ctx.db.get('rulebook_drafts', created.draft._id))!,
          edition: (await ctx.db.get('rulebook_editions', created.edition._id))!,
          contents: (await ctx.db
            .query('rulebook_edition_contents')
            .withIndex('by_edition_id', (q) => q.eq('edition_id', created.edition._id))
            .unique())!.contents,
        }));
      await expect(
        f.t.mutation(internal.arrakisMigrations.arrakis_rulebook_drafts_verify_v1, { reset: true })
      ).resolves.toMatchObject({ Status: expect.stringContaining('still names the built-in Arrakis board') });
      await migrate();
      expect(
        await f.t.mutation(internal.arrakisMigrations.arrakis_rulebook_drafts_verify_v1, { reset: true })
      ).toMatchObject({ Status: expect.not.stringContaining('failed') });
      expect(
        await f.t.mutation(internal.arrakisMigrations.arrakis_rulebook_edition_contents_verify_v1, { reset: true })
      ).toMatchObject({ Status: expect.not.stringContaining('failed') });
      const migrated = await rows();

      expect(migrated.draft.contents).toEqual(contentsOnBoard(legacy, boardId));
      expect(migrated.draft.contents).toMatchObject({
        scenes: [
          { boardId, note: 'arrakis', highlights: [{ territory: 'the-greater-flat' }] },
          { boardId: 'custom-board', highlights: [{ territory: 'greater-flat' }] },
        ],
      });
      expect(migrated.contents).toEqual(migrated.draft.contents);
      expect(migrated.draft.contents_hash).toBe(rulebookDraftContentsHash(migrated.draft.contents));
      expect(migrated.edition.contents_hash).toBe(rulebookEditionContentsHash(migrated.contents));

      await migrate();
      expect(await rows()).toEqual(migrated);
    },
    BUDGET_MS
  );
});
