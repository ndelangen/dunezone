/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { rulebookEditionArtifactPath } from '../src/shared/rulebooks/editionArtifacts';
import { createRulebookEditorialStarterContents } from '../src/shared/rulebooks/fixtures';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('the Rulebook Edition artifact migration', () => {
  test('backfills each historical Edition exactly once', async () => {
    const t = convexTest(schema, modules);
    migrationsTest.register(t);
    const ids = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Edition owner' });
      const rulesetId = await ctx.db.insert('rulesets', {
        name: 'Edition rules',
        slug: 'edition-rules',
        about: '',
        owner_id: ownerId,
        group_id: null,
        image_cover: null,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
        is_deleted: false,
      });
      const rulebookId = await ctx.db.insert('rulebooks', {
        ruleset_id: rulesetId,
        name: 'Historical manual',
        name_key: 'historical manual',
        slug: 'historical-manual',
        sort_order: 0,
        current_edition_number: 1,
        created_by: ownerId,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
        is_deleted: false,
        deleted_at: null,
      });
      const editionId = await ctx.db.insert('rulebook_editions', {
        rulebook_id: rulebookId,
        edition_number: 1,
        contents: createRulebookEditorialStarterContents(),
        created_by: ownerId,
        created_at: '2026-09-01T00:00:00.000Z',
      });
      return { rulebookId, editionId };
    });

    await t.mutation(internal.migrations.rulebook_edition_artifacts_v1, {});
    await t.mutation(internal.migrations.rulebook_edition_artifacts_v1, {});

    await expect(t.run(async (ctx) => await ctx.db.query('rulebook_edition_artifacts').collect())).resolves.toEqual([
      expect.objectContaining({
        edition_id: ids.editionId,
        kind: 'html',
        path: rulebookEditionArtifactPath(ids.rulebookId, 1, 'html'),
      }),
      expect.objectContaining({
        edition_id: ids.editionId,
        kind: 'pdf',
        path: rulebookEditionArtifactPath(ids.rulebookId, 1, 'pdf'),
      }),
    ]);
  });
});
