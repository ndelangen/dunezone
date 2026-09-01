/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { describe, expect, test } from 'vitest';

import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

describe('the Rulebook Edition Contents migration', () => {
  test('moves each historical Contents document intact and clears the metadata row', async () => {
    const { t, owner, ids } = await rulebookFixture();
    migrationsTest.register(t);
    const created = await owner.mutation(api.rulebooks.create, {
      ruleset_id: ids.rulesetId,
      name: 'Historical manual',
      source: { kind: 'starter' },
    });
    await t.run(async (ctx) => {
      const stored = await ctx.db
        .query('rulebook_edition_contents')
        .withIndex('by_edition_id', (query) => query.eq('edition_id', created.edition._id))
        .unique();
      if (!stored) {
        throw new Error('Migration fixture is missing Edition Contents');
      }
      await ctx.db.delete(stored._id);
      await ctx.db.patch('rulebook_editions', created.edition._id, {
        contents: created.edition.contents,
      });
    });

    await t.mutation(internal.migrations.rulebook_edition_contents_v1, {});
    await t.mutation(internal.migrations.rulebook_edition_contents_verify_v1, {});

    const migrated = await t.run(async (ctx) => ({
      edition: await ctx.db.get('rulebook_editions', created.edition._id),
      contents: await ctx.db
        .query('rulebook_edition_contents')
        .withIndex('by_edition_id', (query) => query.eq('edition_id', created.edition._id))
        .collect(),
    }));
    expect(migrated.edition).not.toHaveProperty('contents');
    expect(migrated.contents).toEqual([
      expect.objectContaining({
        edition_id: created.edition._id,
        contents: created.edition.contents,
      }),
    ]);
  });

  test('keeps the inline source when a pre-existing Contents row disagrees', async () => {
    const { t, owner, ids } = await rulebookFixture();
    migrationsTest.register(t);
    const created = await owner.mutation(api.rulebooks.create, {
      ruleset_id: ids.rulesetId,
      name: 'Conflicting historical manual',
      source: { kind: 'starter' },
    });
    const conflicting = structuredClone(created.edition.contents);
    conflicting.pagesById[conflicting.pageOrder[0]].title = 'Conflicting title';
    await t.run((ctx) => ctx.db.patch('rulebook_editions', created.edition._id, { contents: conflicting }));

    await expect(t.mutation(internal.migrations.rulebook_edition_contents_v1, {})).resolves.toMatchObject({
      Status: expect.stringContaining('has conflicting Contents'),
      processed: 0,
    });
    await expect(t.run((ctx) => ctx.db.get('rulebook_editions', created.edition._id))).resolves.toMatchObject({
      contents: conflicting,
    });
  });
});
