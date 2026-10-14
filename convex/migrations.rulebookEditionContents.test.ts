/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { describe, expect, test } from 'vitest';

import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

async function editionFixture() {
  const { t, owner, ids } = await rulebookFixture();
  migrationsTest.register(t);
  const created = await owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: ids.rulesetId,
    name: 'Historical manual',
    source: { kind: 'starter' },
  });
  const rows = () =>
    t.run(async (ctx) => ({
      edition: await ctx.db.get('rulebook_editions', created.edition._id),
      contents: await ctx.db.query('rulebook_edition_contents').collect(),
    }));
  return { t, created, rows };
}

describe('the Rulebook Edition Contents migration', () => {
  test('replays as a no-op, and the verifier passes while every Edition has its Contents row', async () => {
    const { t, rows } = await editionFixture();
    const before = await rows();

    await expect(t.mutation(internal.migrations.rulebook_edition_contents_v1, {})).resolves.toMatchObject({
      processed: 1,
    });
    await expect(t.mutation(internal.migrations.rulebook_edition_contents_verify_v1, {})).resolves.toMatchObject({
      processed: 1,
    });
    expect(await rows()).toEqual(before);
  });

  test('the verifier stops at an Edition without its Contents row', async () => {
    const { t, created } = await editionFixture();
    await t.run(async (ctx) => {
      const stored = await ctx.db
        .query('rulebook_edition_contents')
        .withIndex('by_edition_id', (query) => query.eq('edition_id', created.edition._id))
        .unique();
      await ctx.db.delete(stored!._id);
    });

    await expect(t.mutation(internal.migrations.rulebook_edition_contents_verify_v1, {})).resolves.toMatchObject({
      Status: expect.stringContaining('Contents not found'),
      processed: 0,
    });
  });
});
