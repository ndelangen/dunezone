/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import { rulebookEditionArtifactPath } from '../src/shared/rulebooks/editionArtifacts';
import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

async function editionFixture() {
  const fixture = await rulebookFixture();
  const created = await fixture.owner.mutation(api.rulebooks.create, {
    ruleset_id: fixture.ids.rulesetId,
    name: 'Edition manual',
    source: { kind: 'starter' },
  });
  return {
    ...fixture,
    created,
    locator: { ruleset_slug: 'rulebook-test-rules', rulebook_slug: created.rulebook.slug },
  };
}

function withFirstPageTitle(contents: RulebookContentsV1, title: string) {
  const changed = structuredClone(contents);
  changed.pagesById[changed.pageOrder[0]].title = title;
  return changed;
}

describe('Rulebook Editions', () => {
  test('creation reserves independent permanent HTML and PDF identities for Edition 1', async () => {
    const { t, created } = await editionFixture();

    await expect(t.run(async (ctx) => await ctx.db.query('rulebook_edition_artifacts').collect())).resolves.toEqual([
      expect.objectContaining({
        edition_id: created.edition._id,
        edition_number: 1,
        kind: 'html',
        status: 'preparing',
        path: rulebookEditionArtifactPath(created.rulebook._id, 1, 'html'),
      }),
      expect.objectContaining({
        edition_id: created.edition._id,
        edition_number: 1,
        kind: 'pdf',
        status: 'preparing',
        path: rulebookEditionArtifactPath(created.rulebook._id, 1, 'pdf'),
      }),
    ]);
  });

  test('an active collaborator publishes the clean saved draft as immutable current Edition 2', async () => {
    const { t, ids, member, created, locator } = await editionFixture();
    const contents = withFirstPageTitle(created.draft.contents as RulebookContentsV1, 'Edition 2 title');
    await member.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 1,
      contents,
    });

    const result = await member.mutation(api.rulebooks.publish, {
      rulebook_id: created.rulebook._id,
      expected_revision: 2,
      confirmed: true,
    });

    expect(result).toMatchObject({
      kind: 'published',
      currentEdition: {
        edition_number: 2,
        html: { status: 'preparing', href: null },
        pdf: { status: 'preparing', href: null },
      },
    });
    const rows = await t.run(async (ctx) => ({
      rulebook: await ctx.db.get('rulebooks', created.rulebook._id),
      draft: await ctx.db.get('rulebook_drafts', created.draft._id),
      editions: await ctx.db
        .query('rulebook_editions')
        .withIndex('by_rulebook_and_edition_number', (q) => q.eq('rulebook_id', created.rulebook._id))
        .collect(),
      artifacts: await ctx.db.query('rulebook_edition_artifacts').collect(),
      jobs: await ctx.db
        .query('publication_jobs')
        .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'rulebook-first-page'))
        .collect(),
    }));
    expect(rows.rulebook?.current_edition_number).toBe(2);
    expect(rows.draft).toMatchObject({ revision: 2, contents });
    expect(rows.editions).toHaveLength(2);
    expect(rows.editions[0]).toMatchObject({ edition_number: 1, created_by: ids.ownerId });
    expect(rows.editions[1]).toMatchObject({ edition_number: 2, created_by: ids.memberId, contents });
    expect(rows.artifacts).toHaveLength(4);
    expect(rows.jobs).toEqual([
      expect.objectContaining({ asset_id: created.edition._id }),
      expect.objectContaining({
        asset_id: rows.editions[1]._id,
        asset_data: expect.objectContaining({ editionNumber: 2 }),
      }),
    ]);
    await expect(member.query(api.rulebooks.editorPage, locator)).resolves.toMatchObject({
      kind: 'editable',
      hasUnpublishedChanges: false,
      currentEdition: { edition_number: 2 },
    });
  });

  test('stale and unchanged publication attempts never create another Edition', async () => {
    const { t, owner, member, created } = await editionFixture();
    const contents = withFirstPageTitle(created.draft.contents as RulebookContentsV1, 'Saved change');
    await owner.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 1,
      contents,
    });

    await expect(
      member.mutation(api.rulebooks.publish, {
        rulebook_id: created.rulebook._id,
        expected_revision: 1,
        confirmed: true,
      })
    ).resolves.toMatchObject({ kind: 'stale', draft: { revision: 2, contents } });
    const attempts = await Promise.all([
      member.mutation(api.rulebooks.publish, {
        rulebook_id: created.rulebook._id,
        expected_revision: 2,
        confirmed: true,
      }),
      owner.mutation(api.rulebooks.publish, {
        rulebook_id: created.rulebook._id,
        expected_revision: 2,
        confirmed: true,
      }),
    ]);
    expect(attempts.map(({ kind }) => kind).sort()).toEqual(['published', 'unchanged']);
    expect(attempts).toEqual([
      expect.objectContaining({ currentEdition: expect.objectContaining({ edition_number: 2 }) }),
      expect.objectContaining({ currentEdition: expect.objectContaining({ edition_number: 2 }) }),
    ]);

    await expect(t.run(async (ctx) => await ctx.db.query('rulebook_editions').collect())).resolves.toHaveLength(2);
  });

  test('an Edition already occupying the next number stops publication instead of overwriting it', async () => {
    const { t, owner, created } = await editionFixture();
    const contents = withFirstPageTitle(created.draft.contents as RulebookContentsV1, 'Contested change');
    await owner.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 1,
      contents,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('rulebook_editions', {
        rulebook_id: created.rulebook._id,
        edition_number: 2,
        contents: created.edition.contents,
        created_by: created.edition.created_by,
        created_at: created.edition.created_at,
      });
    });

    await expect(
      owner.mutation(api.rulebooks.publish, {
        rulebook_id: created.rulebook._id,
        expected_revision: 2,
        confirmed: true,
      })
    ).rejects.toThrow('Next Rulebook Edition already exists');
    await expect(t.run(async (ctx) => await ctx.db.query('rulebook_editions').collect())).resolves.toHaveLength(2);
    await expect(t.run(async (ctx) => ctx.db.get('rulebooks', created.rulebook._id))).resolves.toMatchObject({
      current_edition_number: 1,
    });
  });

  test('publication requires maintenance access and a live Rulebook', async () => {
    const { owner, outsider, created } = await editionFixture();

    await expect(
      outsider.mutation(api.rulebooks.publish, {
        rulebook_id: created.rulebook._id,
        expected_revision: 1,
        confirmed: true,
      })
    ).rejects.toThrow('Not authorized');
    await owner.mutation(api.rulebooks.softDelete, { rulebook_id: created.rulebook._id });
    await expect(
      owner.mutation(api.rulebooks.publish, {
        rulebook_id: created.rulebook._id,
        expected_revision: 1,
        confirmed: true,
      })
    ).rejects.toThrow('Rulebook not found');
  });

  test('artifact completion is independent and cannot alter a successful identity', async () => {
    const { t, created } = await editionFixture();
    await t.mutation(internal.rulebookEditionArtifacts.complete, {
      edition_id: created.edition._id,
      kind: 'html',
      outcome: { status: 'failed', reason: 'HTML capture failed' },
    });
    const ready = await t.mutation(internal.rulebookEditionArtifacts.complete, {
      edition_id: created.edition._id,
      kind: 'pdf',
      outcome: { status: 'ready' },
    });

    expect(ready).toEqual({
      edition_number: 1,
      created_at: created.edition.created_at,
      html: { status: 'failed', href: null },
      pdf: { status: 'ready', href: rulebookEditionArtifactPath(created.rulebook._id, 1, 'pdf') },
    });
    await expect(
      t.mutation(internal.rulebookEditionArtifacts.complete, {
        edition_id: created.edition._id,
        kind: 'pdf',
        outcome: { status: 'failed', reason: 'Late failure' },
      })
    ).rejects.toThrow('immutable');
    await expect(t.run(async (ctx) => ctx.db.get('rulebooks', created.rulebook._id))).resolves.toMatchObject({
      current_edition_number: 1,
    });
    await expect(t.run(async (ctx) => ctx.db.get('rulebook_editions', created.edition._id))).resolves.toMatchObject({
      contents: created.edition.contents,
    });
  });

  test('duplicate artifact kinds are rejected even when the Edition still has two rows', async () => {
    const { t, owner, created, locator } = await editionFixture();
    await t.run(async (ctx) => {
      const artifacts = await ctx.db
        .query('rulebook_edition_artifacts')
        .withIndex('by_edition_and_kind', (q) => q.eq('edition_id', created.edition._id))
        .collect();
      const html = artifacts.find((artifact) => artifact.kind === 'html');
      const pdf = artifacts.find((artifact) => artifact.kind === 'pdf');
      if (!html || !pdf) {
        throw new Error('Edition artifact fixture is incomplete');
      }
      await ctx.db.delete(pdf._id);
      await ctx.db.insert('rulebook_edition_artifacts', {
        rulebook_id: html.rulebook_id,
        edition_id: html.edition_id,
        edition_number: html.edition_number,
        kind: html.kind,
        status: html.status,
        path: html.path,
        failure_reason: html.failure_reason,
        created_at: html.created_at,
        updated_at: html.updated_at,
      });
    });

    await expect(owner.query(api.rulebooks.editorPage, locator)).rejects.toThrow('duplicate artifact records');
  });

  test('editor reads tolerate an Edition not yet reached by the artifact migration', async () => {
    const { t, owner, locator } = await editionFixture();
    await t.run(async (ctx) => {
      for (const artifact of await ctx.db.query('rulebook_edition_artifacts').collect()) {
        await ctx.db.delete(artifact._id);
      }
    });

    await expect(owner.query(api.rulebooks.editorPage, locator)).resolves.toMatchObject({
      kind: 'editable',
      currentEdition: {
        html: { status: 'preparing', href: null },
        pdf: { status: 'preparing', href: null },
      },
    });
  });
});
