// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

/**
 * Two books, one of which is discarded while its creation-time artifacts and first-page job are still queued.
 * The queue must settle the discarded work without reading its retained Contents and still hand out the supported neighbour's work.
 */
async function queuedPairFixture() {
  const fixture = await rulebookFixture();
  const { t, owner, ids } = fixture;
  const discarded = await owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: ids.rulesetId,
    name: 'Discarded manual',
    source: { kind: 'starter' },
  });
  const supported = await owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: ids.rulesetId,
    name: 'Supported manual',
    source: { kind: 'starter' },
  });
  await t.run(async (ctx) => {
    /* The retained Contents of a discarded book are whatever an earlier catalogue wrote; a reader that touched them would refuse this. */
    const stored = await ctx.db
      .query('rulebook_edition_contents')
      .withIndex('by_edition_id', (q) => q.eq('edition_id', discarded.edition._id))
      .unique();
    await ctx.db.patch('rulebook_edition_contents', stored!._id, { contents: { schemaVersion: 1, retired: true } });
    await ctx.db.insert('admin_settings', {
      key: 'publication',
      publication_pickup_enabled: true,
      renderer_revisions: {},
      updated_at: Date.now(),
    });
  });
  await owner.mutation(api.rulebooks.softDelete, { rulebook_id: discarded.rulebook._id });
  return { ...fixture, discarded, supported };
}

describe('Retired catalogue queue settlement', () => {
  test('settles the discarded book’s unfinished HTML and PDF artifacts before reading their Contents', async () => {
    const { t, discarded, supported } = await queuedPairFixture();
    /* One artifact is picked per round, so the settled one spends the first round and the neighbour is handed out on the next. */
    const html = [
      ...(await t.mutation(internal.rulebookHtmlPublication.takeHtmlWork, {})),
      ...(await t.mutation(internal.rulebookHtmlPublication.takeHtmlWork, {})),
    ];
    const pdf = [
      ...(await t.mutation(internal.rulebookPdfPublication.takePdfWork, {})),
      ...(await t.mutation(internal.rulebookPdfPublication.takePdfWork, {})),
    ];
    expect(html.map((work) => work.rulebookId)).toEqual([supported.rulebook._id]);
    expect(pdf.map((work) => work.rulebookId)).toEqual([supported.rulebook._id]);
    const artifacts = await t.run(async (ctx) =>
      ctx.db
        .query('rulebook_edition_artifacts')
        .withIndex('by_edition_and_kind', (q) => q.eq('edition_id', discarded.edition._id))
        .collect()
    );
    expect(artifacts.map(({ kind, status, failure_reason }) => ({ kind, status, failure_reason }))).toEqual([
      { kind: 'html', status: 'failed', failure_reason: 'Rulebook or Ruleset is deleted' },
      { kind: 'pdf', status: 'failed', failure_reason: 'Rulebook or Ruleset is deleted' },
    ]);
  });

  test('drops the discarded book’s queued first-page job and assigns the supported one', async () => {
    const { t, discarded, supported } = await queuedPairFixture();
    const before = await t.run(async (ctx) => ctx.db.query('publication_jobs').collect());
    expect(before.map(({ asset_id }) => asset_id).sort()).toEqual(
      [discarded.edition._id, supported.edition._id].sort()
    );
    const taken = await t.mutation(internal.publicationJobs.takeWork, {});
    expect(taken.items.map(({ assetId }) => assetId)).toEqual([supported.edition._id]);
    const after = await t.run(async (ctx) => ctx.db.query('publication_jobs').collect());
    expect(after.map(({ asset_id, status }) => ({ asset_id, status }))).toEqual([
      { asset_id: supported.edition._id, status: 'in_progress' },
    ]);
  });
});
