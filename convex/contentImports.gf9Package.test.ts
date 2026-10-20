import { expect, test } from 'vite-plus/test';

import gf9Package from '../content/gf9/package.json';
import { contentImportPackageSchema } from '../src/shared/contentImports/package';
import { api } from './_generated/api';
import { applicationTriggers } from './lib/applicationTriggers';
import { rulebookFixture } from './rulebooks.test.fixture';

/* Published stock records are fixtures here; this test never connects to a deployment. */
test('imports and retries the delivered GF9 package using complete paged previews', async () => {
  const { t, owner, ids } = await rulebookFixture();
  const target = { rulesetSlug: 'rulebook-test-rules', groupSlug: 'rulebook-authors' };
  const packages = [contentImportPackageSchema.parse(gf9Package)];
  await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    for (const bundle of packages) {
      for (const item of bundle.items) {
        if (item.kind === 'asset' && item.existing) {
          await ctx.db.insert('assets', {
            owner_id: ids.ownerId,
            type: item.type,
            slug: item.existing.slug,
            data: item.data,
            group_id: null,
            is_deleted: false,
            created_at: '2026-10-20T00:00:00.000Z',
            updated_at: '2026-10-20T00:00:00.000Z',
          });
        }
      }
    }
  });
  const previewPackage = async (bundle: (typeof packages)[number]) => {
    const first = await owner.mutation(api.contentImports.preview, { package: bundle, target });
    const entries = [...first.entries];
    let cursor = first.nextCursor;
    while (cursor !== null) {
      const page = await owner.mutation(api.contentImports.preview, { package: bundle, target, cursor });
      expect([page.rulesetId, page.groupId, page.ownerId]).toEqual([first.rulesetId, first.groupId, first.ownerId]);
      entries.push(...page.entries);
      cursor = page.nextCursor;
    }
    return { ...first, entries, nextCursor: null };
  };
  for (const bundle of packages) {
    const preview = await previewPackage(bundle);
    expect(preview.entries.filter((entry) => entry.status === 'conflict')).toEqual([]);
    const results = [];
    for (const [index, item] of bundle.items.entries()) {
      results.push(
        await owner.mutation(api.contentImports.applyItem, {
          packageKey: bundle.packageKey,
          item,
          target,
          expectedHash: preview.entries[index]!.expectedHash,
        })
      );
    }
    expect(results).toHaveLength(bundle.items.length);
    const retry = await previewPackage(bundle);
    expect(retry.entries.filter((entry) => entry.status === 'conflict')).toEqual([]);
    for (const [index, item] of bundle.items.entries()) {
      expect(
        await owner.mutation(api.contentImports.applyItem, {
          packageKey: bundle.packageKey,
          item,
          target,
          expectedHash: retry.entries[index]!.expectedHash,
        })
      ).toMatchObject({ id: results[index]!.id, status: 'unchanged' });
    }
  }
}, 60_000);
