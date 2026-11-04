/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { describe, expect, test } from 'vite-plus/test';

import { publishingSpiceCard } from '../src/shared/assets/fixtures/publishingSpiceCard';
import { SPICE_BOARD_REVISION } from '../src/shared/assets/schema';
import { arrakisBoard } from '../src/shared/boards/geometry';
import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { ARRAKIS_BOARD_SLUG, contentsOnBoard } from './arrakisMigrations';
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

describe('Arrakis board migration', () => {
  test(
    'links classic Spice cards to the saved board, carrying their highlights, and empties linked cards’ old lists',
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
        board: { asset_id: boardId, tints: [], tokens: [] },
      };
      const linkedId = await insertCard(f, 'linked', linked);
      await f.t.mutation(internal.arrakisMigrations.arrakis_spice_cards_v1, { reset: true });

      expect(await cardData(f, classicId)).toEqual({
        ...classic,
        highlights: [],
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
      expect(await cardData(f, linkedId)).toEqual({ ...linked, highlights: [] });
      expect(await cardData(f, deletedId)).toMatchObject({ highlights: [], board: { asset_id: boardId, tints: [] } });

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
        expect(jobs.length).toBeGreaterThan(0);
      });

      await f.t.mutation(internal.arrakisMigrations.arrakis_spice_cards_v1, { reset: true });
      expect(await Promise.all([classicId, linkedId, deletedId].map((id) => cardData(f, id)))).toEqual(migrated);
    },
    BUDGET_MS
  );

  test(
    'gives live Rulesets without a board the saved board and leaves an authored board alone',
    async () => {
      const f = await rulebookFixture();
      migrationsTest.register(f.t);
      const boardId = await saveArrakis(f);
      const otherBoard = await f.owner.mutation(api.assets.create, {
        type: 'board',
        data: { name: 'Other board', about: '', board: arrakisBoard() },
      });
      await f.t.run((ctx) =>
        ctx.db.insert('ruleset_asset_slots', {
          ruleset_id: f.ids.otherRulesetId,
          asset_id: otherBoard.id as Id<'assets'>,
          slot: 'board',
        })
      );
      const boards = () =>
        f.t.run(async (ctx) =>
          Promise.all(
            [f.ids.rulesetId, f.ids.otherRulesetId].map(async (rulesetId) =>
              (
                await ctx.db
                  .query('ruleset_asset_slots')
                  .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', rulesetId).eq('slot', 'board'))
                  .collect()
              ).map((slot) => slot.asset_id)
            )
          )
        );

      await f.t.mutation(internal.arrakisMigrations.arrakis_ruleset_boards_v1, {});
      expect(await boards()).toEqual([[boardId], [otherBoard.id]]);
      await f.t.mutation(internal.arrakisMigrations.arrakis_ruleset_boards_v1, { reset: true });
      expect(await boards()).toEqual([[boardId], [otherBoard.id]]);
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
      const legacy = { ...(created.draft.contents as object), scenes: [{ boardId: 'arrakis', note: 'arrakis' }] };
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
      await migrate();
      const migrated = await rows();

      expect(migrated.draft.contents).toEqual(contentsOnBoard(legacy, boardId));
      expect(migrated.draft.contents).toMatchObject({ scenes: [{ boardId, note: 'arrakis' }] });
      expect(migrated.contents).toEqual(migrated.draft.contents);
      expect(migrated.draft.contents_hash).toBe(rulebookDraftContentsHash(migrated.draft.contents));
      expect(migrated.edition.contents_hash).toBe(rulebookEditionContentsHash(migrated.contents));

      await migrate();
      expect(await rows()).toEqual(migrated);
    },
    BUDGET_MS
  );
});
