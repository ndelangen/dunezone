/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { describe, expect, test } from 'vitest';

import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import { api, internal } from './_generated/api';
import { rulebookDraftContentsHash, rulebookEditionContentsHash } from './lib/rulebookEditionContents';
import { rulebookFixture } from './rulebooks.test.fixture';

async function unhashedFixture() {
  const fixture = await rulebookFixture();
  migrationsTest.register(fixture.t);
  const created = await fixture.owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: fixture.ids.rulesetId,
    name: 'Unhashed manual',
    source: { kind: 'starter' },
  });
  const contents = structuredClone(created.draft.contents as RulebookContentsV1);
  contents.pagesById[contents.pageOrder[0]!]!.title = 'Saved change';
  await fixture.owner.mutation(api.rulebooks.save, {
    rulebook_id: created.rulebook._id,
    expected_revision: 1,
    contents,
  });
  /* Rows written before the hash existed carry none. */
  await fixture.t.run(async (ctx) => {
    await ctx.db.patch('rulebook_drafts', created.draft._id, { contents_hash: undefined });
    await ctx.db.patch('rulebook_editions', created.edition._id, { contents_hash: undefined });
  });
  const rows = () =>
    fixture.t.run(async (ctx) => ({
      draft: (await ctx.db.get('rulebook_drafts', created.draft._id))!,
      edition: (await ctx.db.get('rulebook_editions', created.edition._id))!,
    }));
  const migrate = async () => {
    await fixture.t.mutation(internal.migrations.rulebook_contents_hash_drafts_v1, {});
    await fixture.t.mutation(internal.migrations.rulebook_contents_hash_editions_v1, {});
  };
  return { ...fixture, created, contents, rows, migrate };
}

describe('the Rulebook Contents hash backfill', () => {
  test('writes each draft and Edition hash from its stored Contents, and a replay changes nothing', async () => {
    const f = await unhashedFixture();
    await f.migrate();
    const migrated = await f.rows();
    expect(migrated.draft.contents_hash).toBe(rulebookDraftContentsHash(f.contents));
    expect(migrated.edition.contents_hash).toBe(rulebookEditionContentsHash(f.created.edition.contents));
    expect(migrated.draft.contents_hash).not.toBe(migrated.edition.contents_hash);

    await f.migrate();
    expect(await f.rows()).toEqual(migrated);
  });

  test('leaves no hash on Contents that no longer parse and finishes the rest', async () => {
    const f = await unhashedFixture();
    await f.t.run(async (ctx) => {
      await ctx.db.patch('rulebook_drafts', f.created.draft._id, {
        contents: { schemaVersion: 1, retired: true },
        contents_hash: 'v1:stale',
      });
    });
    await f.migrate();
    const migrated = await f.rows();
    expect(migrated.draft).not.toHaveProperty('contents_hash');
    expect(migrated.edition.contents_hash).toBe(rulebookEditionContentsHash(f.created.edition.contents));
  });
});
