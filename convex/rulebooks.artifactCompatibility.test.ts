/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { rulebookContentsV1Schema } from '../src/shared/rulebooks/contents';
import type { RulebookContentsDraftV1 } from '../src/shared/rulebooks/contents';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { rulebookFixture } from './rulebooks.test.fixture';

type RulebookFixture = Awaited<ReturnType<typeof rulebookFixture>>;

function contentsFromEarlierV1Contract(contents: RulebookContentsDraftV1) {
  const historical = structuredClone(contents);
  const firstPage = historical.pagesById.CHAP;
  if (firstPage?.layoutId !== 'chapter-opener') {
    throw new Error('Expected the starter chapter Page');
  }
  const feature = firstPage.blocksById.HERA;
  if (feature?.kind !== 'asset-figure') {
    throw new Error('Expected the starter feature Block');
  }
  feature.text = '__a__';
  return historical;
}

async function replaceStoredContents(
  t: RulebookFixture['t'],
  editionId: Id<'rulebook_editions'>,
  contents: RulebookContentsDraftV1
) {
  await t.run(async (ctx) => {
    const stored = await ctx.db
      .query('rulebook_edition_contents')
      .withIndex('by_edition_id', (query) => query.eq('edition_id', editionId))
      .unique();
    if (!stored) {
      throw new Error('Missing Edition Contents');
    }
    await ctx.db.patch('rulebook_edition_contents', stored._id, { contents });
  });
}

async function clearFirstPageJobs(t: RulebookFixture['t']) {
  await t.run(async (ctx) => {
    for (const job of await ctx.db.query('publication_jobs').collect()) {
      await ctx.db.delete(job._id);
    }
  });
}

describe('Rulebook Edition artifact compatibility', () => {
  test('an Edition accepted by the earlier V1 text contract reaches every artifact renderer', async () => {
    const { t, owner, ids } = await rulebookFixture();
    const created = await owner.mutation(api.rulebooks.create, {
      ruleset_id: ids.rulesetId,
      name: 'Historical field manual',
      source: { kind: 'starter' },
    });
    const historicalContents = contentsFromEarlierV1Contract(created.edition.contents);
    expect(rulebookContentsV1Schema.safeParse(historicalContents).success).toBe(false);
    await expect(
      owner.mutation(api.rulebooks.save, {
        rulebook_id: created.rulebook._id,
        expected_revision: created.draft.revision,
        contents: historicalContents,
      })
    ).rejects.toThrow('Formatted text must be valid and normalized');

    await replaceStoredContents(t, created.edition._id, historicalContents);
    await clearFirstPageJobs(t);

    const [html] = await t.mutation(internal.rulebookHtmlPublication.takeHtmlWork, {});
    const [pdf] = await t.mutation(internal.rulebookPdfPublication.takePdfWork, {});
    await owner.mutation(api.rulebooks.retryFirstPagePreview, { rulebook_id: created.rulebook._id });
    const jobs = await t.run(async (ctx) => ctx.db.query('publication_jobs').collect());

    expect(html?.document.pagesById.CHAP.regions[0]?.blocks[0]).toMatchObject({ text: '__a__' });
    expect(pdf?.document.pagesById.CHAP.regions[0]?.blocks[0]).toMatchObject({ text: '__a__' });
    expect(jobs).toEqual([
      expect.objectContaining({
        asset_type: 'rulebook-first-page',
        asset_id: created.edition._id,
        asset_data: expect.objectContaining({
          page: expect.objectContaining({
            regions: [expect.objectContaining({ blocks: [expect.objectContaining({ text: '__a__' })] })],
          }),
        }),
      }),
    ]);
  });
});
