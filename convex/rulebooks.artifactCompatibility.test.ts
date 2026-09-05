/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { rulebookContentsV1Schema } from '../src/shared/rulebooks/contents';
import type { RulebookContentsDraftV1 } from '../src/shared/rulebooks/contents';
import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

describe('Rulebook Edition artifact compatibility', () => {
  test('an Edition accepted by the earlier V1 text contract reaches every artifact renderer', async () => {
    const { t, owner, ids } = await rulebookFixture();
    const created = await owner.mutation(api.rulebooks.create, {
      ruleset_id: ids.rulesetId,
      name: 'Historical field manual',
      source: { kind: 'starter' },
    });
    const historicalContents = structuredClone(created.edition.contents) as RulebookContentsDraftV1;
    const firstPage = historicalContents.pagesById.CHAP;
    if (firstPage?.layoutId !== 'chapter-opener') {
      throw new Error('Expected the starter chapter Page');
    }
    const feature = firstPage.blocksById.HERA;
    if (feature?.kind !== 'asset-figure') {
      throw new Error('Expected the starter feature Block');
    }
    feature.text = '__a__';
    expect(rulebookContentsV1Schema.safeParse(historicalContents).success).toBe(false);
    await expect(
      owner.mutation(api.rulebooks.save, {
        rulebook_id: created.rulebook._id,
        expected_revision: created.draft.revision,
        contents: historicalContents,
      })
    ).rejects.toThrow('Formatted text must be valid and normalized');

    await t.run(async (ctx) => {
      const stored = await ctx.db
        .query('rulebook_edition_contents')
        .withIndex('by_edition_id', (query) => query.eq('edition_id', created.edition._id))
        .unique();
      if (!stored) {
        throw new Error('Missing Edition Contents');
      }
      await ctx.db.patch('rulebook_edition_contents', stored._id, { contents: historicalContents });
      for (const job of await ctx.db.query('publication_jobs').collect()) {
        await ctx.db.delete(job._id);
      }
    });

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
