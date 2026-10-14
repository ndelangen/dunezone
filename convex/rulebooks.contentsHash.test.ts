/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { rulebookDraftContentsHash, rulebookEditionContentsHash } from './lib/rulebookEditionContents';
import { rulebookFixture } from './rulebooks.test.fixture';

async function hashFixture() {
  const fixture = await rulebookFixture();
  const created = await fixture.owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: fixture.ids.rulesetId,
    name: 'Hashed manual',
    source: { kind: 'starter' },
  });
  const locator = { ruleset_slug: 'rulebook-test-rules', rulebook_slug: created.rulebook.slug };
  const rows = () =>
    fixture.t.run(async (ctx) => {
      const rulebook = await ctx.db.get('rulebooks', created.rulebook._id);
      const draft = await ctx.db.get('rulebook_drafts', created.draft._id);
      const edition = await ctx.db
        .query('rulebook_editions')
        .withIndex('by_rulebook_and_edition_number', (q) =>
          q.eq('rulebook_id', created.rulebook._id).eq('edition_number', rulebook!.current_edition_number)
        )
        .unique();
      return { draft: draft!, edition: edition! };
    });
  /* With the Contents row gone, any read of the Edition's Contents throws, so a page that still answers never read them. */
  const deleteEditionContents = (editionId: Id<'rulebook_editions'>) =>
    fixture.t.run(async (ctx) => {
      const stored = await ctx.db
        .query('rulebook_edition_contents')
        .withIndex('by_edition_id', (q) => q.eq('edition_id', editionId))
        .unique();
      await ctx.db.delete(stored!._id);
    });
  const unpublished = async () => {
    const page = await fixture.owner.query(api.rulebooks.editorPage, locator);
    if (page?.kind !== 'editable') {
      throw new Error('Expected an editable Rulebook');
    }
    return page.hasUnpublishedChanges;
  };
  return { ...fixture, created, rows, deleteEditionContents, unpublished };
}

function withFirstPageTitle(contents: RulebookContentsV1, title: string) {
  const next = structuredClone(contents);
  next.pagesById[next.pageOrder[0]!]!.title = title;
  return next;
}

describe('Rulebook Contents hashes', () => {
  test('creation writes matching hashes, and the editor settles from them without reading Edition Contents', async () => {
    const f = await hashFixture();
    const { draft, edition } = await f.rows();
    expect(draft.contents_hash).toBe(rulebookDraftContentsHash(draft.contents));
    expect(edition.contents_hash).toBe(rulebookEditionContentsHash(f.created.edition.contents));
    expect(draft.contents_hash).toBe(edition.contents_hash);

    await f.deleteEditionContents(edition._id);
    expect(await f.unpublished()).toBe(false);
  });

  test('saving rewrites the draft hash, and the editor reports the change from hashes alone', async () => {
    const f = await hashFixture();
    const contents = withFirstPageTitle(f.created.draft.contents as RulebookContentsV1, 'Saved change');
    const saved = await f.owner.mutation(api.rulebooks.save, {
      rulebook_id: f.created.rulebook._id,
      expected_revision: 1,
      contents,
    });
    const { draft, edition } = await f.rows();
    expect(draft.contents_hash).toBe(rulebookDraftContentsHash(contents));
    expect(draft.contents_hash).not.toBe(edition.contents_hash);
    expect(saved).toMatchObject({ kind: 'saved', draft: { contents_hash: draft.contents_hash } });

    await f.deleteEditionContents(edition._id);
    expect(await f.unpublished()).toBe(true);
  });

  test('publishing writes the new Edition hash, which matches the draft it published', async () => {
    const f = await hashFixture();
    const contents = withFirstPageTitle(f.created.draft.contents as RulebookContentsV1, 'Published change');
    await f.owner.mutation(api.rulebooks.save, {
      rulebook_id: f.created.rulebook._id,
      expected_revision: 1,
      contents,
    });
    await f.owner.mutation(api.rulebooks.publish, {
      rulebook_id: f.created.rulebook._id,
      expected_revision: 2,
      confirmed: true,
    });
    const { draft, edition } = await f.rows();
    expect(edition.edition_number).toBe(2);
    expect(edition.contents_hash).toBe(rulebookEditionContentsHash(contents));
    expect(edition.contents_hash).toBe(draft.contents_hash);

    await f.deleteEditionContents(edition._id);
    expect(await f.unpublished()).toBe(false);
  });

  test.each([
    ['missing', undefined],
    ['written under another version', 'v0:0000'],
  ])('falls back to comparing Contents when hashes are %s', async (_name, staleHash) => {
    const f = await hashFixture();
    const strip = async () => {
      const { draft, edition } = await f.rows();
      await f.t.run(async (ctx) => {
        await ctx.db.patch('rulebook_drafts', draft._id, { contents_hash: staleHash });
        await ctx.db.patch('rulebook_editions', edition._id, { contents_hash: staleHash });
      });
    };
    await strip();
    expect(await f.unpublished()).toBe(false);

    const contents = withFirstPageTitle(f.created.draft.contents as RulebookContentsV1, 'Unhashed change');
    await f.owner.mutation(api.rulebooks.save, {
      rulebook_id: f.created.rulebook._id,
      expected_revision: 1,
      contents,
    });
    await strip();
    expect(await f.unpublished()).toBe(true);
  });

  test('falls back to comparing Contents when only the Edition lacks a hash', async () => {
    const f = await hashFixture();
    const { edition } = await f.rows();
    await f.t.run((ctx) => ctx.db.patch('rulebook_editions', edition._id, { contents_hash: undefined }));
    expect(await f.unpublished()).toBe(false);
    await f.deleteEditionContents(edition._id);
    await expect(f.unpublished()).rejects.toThrow('Contents not found');
  });
});
