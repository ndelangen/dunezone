/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import { projectRulebookRenderDocument } from '../src/shared/rulebooks/projectRenderDocument';
import { api, internal } from './_generated/api';
import { applicationTriggers } from './lib/applicationTriggers';
import { enqueueRulebookFirstPagePublication } from './lib/rulebookPublication';
import { rulebookFixture } from './rulebooks.test.fixture';

const CACHE_TOKEN = `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`;

async function rulebookPublicationFixture() {
  const fixture = await rulebookFixture();
  const created = await fixture.owner.mutation(api.rulebooks.create, {
    ruleset_id: fixture.ids.rulesetId,
    name: 'Publication manual',
    source: { kind: 'starter' },
  });
  const jobs = () =>
    fixture.t.run(async (ctx) =>
      ctx.db
        .query('publication_jobs')
        .withIndex('by_asset_type_and_asset_id', (q) =>
          q.eq('asset_type', 'rulebook-first-page').eq('asset_id', created.edition._id)
        )
        .collect()
    );
  const complete = async () => {
    const [job] = await jobs();
    if (!job) {
      throw new Error('Missing Rulebook first-page publication job');
    }
    await fixture.t.run(async (ctx) => {
      await ctx.db.patch(job._id, { status: 'in_progress', expires_at: Date.now() + 60_000 });
    });
    await fixture.t.mutation(internal.publicationJobs.completeJob, {
      jobId: job._id,
      cacheToken: CACHE_TOKEN,
    });
  };
  return { ...fixture, created, jobs, complete };
}

describe('Rulebook first-page publication', () => {
  test('creation queues the immutable Edition 1 first Page', async () => {
    const { created, jobs, owner } = await rulebookPublicationFixture();
    const expected = projectRulebookRenderDocument(created.edition.contents, {});
    const firstPageId = expected.pageOrder[0];
    const firstPage = firstPageId ? expected.pagesById[firstPageId] : undefined;

    await expect(jobs()).resolves.toEqual([
      expect.objectContaining({
        asset_type: 'rulebook-first-page',
        asset_id: created.edition._id,
        status: 'pending',
        attempt_counter: 0,
        asset_data: {
          rulebookId: created.rulebook._id,
          editionId: created.edition._id,
          editionNumber: 1,
          page: firstPage,
        },
      }),
    ]);
    await expect(
      owner.query(api.rulebooks.listByRulesetSlug, { ruleset_slug: 'rulebook-test-rules' })
    ).resolves.toMatchObject([
      {
        first_page_image_url: null,
        first_page_capture_status: 'scheduled',
      },
    ]);
  });

  test('a completed image appears without a Rulebook publication action and survives draft changes and reordering', async () => {
    const { created, complete, jobs, owner, ids } = await rulebookPublicationFixture();
    const editionDate = created.edition.created_at;
    await complete();

    const contents = structuredClone(created.draft.contents) as RulebookContentsV1;
    contents.pagesById[contents.pageOrder[0]].title = 'Unsaved Edition title';
    await owner.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 1,
      contents,
    });
    await owner.mutation(api.rulebooks.reorder, {
      ruleset_id: ids.rulesetId,
      rulebook_ids: [created.rulebook._id],
    });

    const [listed] = await owner.query(api.rulebooks.listByRulesetSlug, {
      ruleset_slug: 'rulebook-test-rules',
    });
    expect(listed).toMatchObject({
      edition_published_at: editionDate,
      first_page_capture_status: null,
    });
    expect(listed.first_page_image_url).toContain(`/published/rulebooks/${created.edition._id}/first-page.jpg`);
    await expect(jobs()).resolves.toEqual([]);
  });

  test('an author sees terminal failure and can retry it without changing the Edition or draft', async () => {
    const { t, created, jobs, member } = await rulebookPublicationFixture();
    const [failed] = await jobs();
    if (!failed) {
      throw new Error('Missing Rulebook first-page publication job');
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(failed._id, {
        status: 'error',
        attempt_counter: 10,
        error: 'Capture failed ten times',
      });
    });
    await expect(
      member.query(api.rulebooks.listByRulesetSlug, { ruleset_slug: 'rulebook-test-rules' })
    ).resolves.toMatchObject([{ first_page_capture_status: 'failed' }]);

    await member.mutation(api.rulebooks.retryFirstPagePreview, { rulebook_id: created.rulebook._id });
    await expect(jobs()).resolves.toEqual([expect.objectContaining({ status: 'pending', attempt_counter: 0 })]);
    const persisted = await t.run(async (ctx) => ({
      edition: await ctx.db.get('rulebook_editions', created.edition._id),
      draft: await ctx.db.get('rulebook_drafts', created.draft._id),
    }));
    expect(persisted.edition).toEqual(expect.objectContaining(created.edition));
    expect(persisted.draft).toEqual(expect.objectContaining(created.draft));
  });

  test('a future Edition gets a new URL while soft deletion leaves historical bytes immutable', async () => {
    const { t, created, complete, owner } = await rulebookPublicationFixture();
    await complete();
    const secondContents = structuredClone(created.edition.contents) as RulebookContentsV1;
    secondContents.pagesById[secondContents.pageOrder[0]].title = 'Second Edition';
    const secondEditionId = await t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      const editionId = await ctx.db.insert('rulebook_editions', {
        rulebook_id: created.rulebook._id,
        edition_number: 2,
        contents: secondContents,
        created_by: created.rulebook.created_by,
        created_at: '2026-09-01T00:00:00.000Z',
      });
      await ctx.db.patch('rulebooks', created.rulebook._id, { current_edition_number: 2 });
      await enqueueRulebookFirstPagePublication(ctx, {
        _id: editionId,
        rulebook_id: created.rulebook._id,
        edition_number: 2,
        contents: secondContents,
      });
      return editionId;
    });

    const rows = await t.run(async (ctx) => ({
      assets: await ctx.db.query('publication_assets').collect(),
      jobs: await ctx.db.query('publication_jobs').collect(),
    }));
    expect(rows.assets).toEqual([expect.objectContaining({ asset_id: created.edition._id, cache_token: CACHE_TOKEN })]);
    expect(rows.jobs).toEqual([
      expect.objectContaining({
        asset_id: secondEditionId,
        asset_data: expect.objectContaining({
          editionId: secondEditionId,
          editionNumber: 2,
          page: expect.objectContaining({ title: 'Second Edition' }),
        }),
      }),
    ]);

    await owner.mutation(api.rulebooks.softDelete, { rulebook_id: created.rulebook._id });
    await expect(
      owner.query(api.rulebooks.listByRulesetSlug, { ruleset_slug: 'rulebook-test-rules' })
    ).resolves.toEqual([]);
    await expect(t.run(async (ctx) => ctx.db.get('publication_assets', rows.assets[0]._id))).resolves.toMatchObject({
      asset_id: created.edition._id,
      cache_token: CACHE_TOKEN,
    });
  });

  test('Renderer activation backfills only the current Edition of live Rulebooks', async () => {
    const { t, created, owner, ids } = await rulebookPublicationFixture();
    const deleted = await owner.mutation(api.rulebooks.create, {
      ruleset_id: ids.rulesetId,
      name: 'Deleted publication manual',
      source: { kind: 'starter' },
    });
    await owner.mutation(api.rulebooks.softDelete, { rulebook_id: deleted.rulebook._id });
    await t.run(async (ctx) => {
      for (const job of await ctx.db.query('publication_jobs').collect()) {
        await ctx.db.delete(job._id);
      }
    });

    await t.mutation(internal.publicationRegeneration.scan, {
      assetType: 'rulebook-first-page',
      cursor: null,
      scanned: 0,
      enqueued: 0,
    });

    await expect(t.run(async (ctx) => ctx.db.query('publication_jobs').collect())).resolves.toEqual([
      expect.objectContaining({
        asset_type: 'rulebook-first-page',
        asset_id: created.edition._id,
      }),
    ]);
  });

  test('an Edition with no first Page is reported rather than thrown', async () => {
    const { t, created } = await rulebookPublicationFixture();
    await expect(
      t.run(async (ctx) =>
        enqueueRulebookFirstPagePublication(ctx, {
          _id: created.edition._id,
          rulebook_id: created.rulebook._id,
          edition_number: 1,
          contents: { schemaVersion: 1, pageOrder: [], pagesById: {} } as unknown as RulebookContentsV1,
        })
      )
    ).resolves.toEqual({ enqueued: false, skipped: 'no-first-page' });
  });

  test('one unrenderable Edition does not end the backfill for the rest of its page', async () => {
    const { t, created, owner, ids } = await rulebookPublicationFixture();
    const emptied = await owner.mutation(api.rulebooks.create, {
      ruleset_id: ids.rulesetId,
      name: 'Emptied publication manual',
      source: { kind: 'starter' },
    });
    await t.run(async (ctx) => {
      await ctx.db.patch('rulebook_editions', emptied.edition._id, {
        contents: { schemaVersion: 1, pageOrder: [], pagesById: {} },
      });
      for (const job of await ctx.db.query('publication_jobs').collect()) {
        await ctx.db.delete(job._id);
      }
    });

    await t.mutation(internal.publicationRegeneration.scan, {
      assetType: 'rulebook-first-page',
      cursor: null,
      scanned: 0,
      enqueued: 0,
    });

    await expect(t.run(async (ctx) => ctx.db.query('publication_jobs').collect())).resolves.toEqual([
      expect.objectContaining({ asset_type: 'rulebook-first-page', asset_id: created.edition._id }),
    ]);
  });
});
