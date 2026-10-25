import { contentImportPackageSchema } from '@shared/contentImports/package';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { previewContentImport } from './contentImports';
import { db } from './core';

vi.mock('@db/core', () => ({ db: { mutation: vi.fn() } }));
afterEach(() => vi.resetAllMocks());

const bundle = contentImportPackageSchema.parse({
  format: 'dunezone-package',
  version: 1,
  packageKey: 'test',
  items: [{ key: 'item', kind: 'faction', data: {} }],
});
const target = { rulesetSlug: 'rules', groupSlug: 'group' };
const page = {
  packageKey: 'test',
  rulesetId: 'ruleset-a',
  groupId: 'group-a',
  rulesetName: 'Rules',
  groupName: 'Group',
  ownerId: 'owner-a',
  nextCursor: 50,
  entries: [{ key: 'first', kind: 'faction', name: 'First', status: 'update', expectedHash: 'reviewed-first' }],
};

test('collects preview pages in order while preserving every reviewed item hash', async () => {
  vi.mocked(db.mutation)
    .mockResolvedValueOnce(page)
    .mockResolvedValueOnce({
      ...page,
      nextCursor: null,
      entries: [{ ...page.entries[0], key: 'last', expectedHash: 'reviewed-last' }],
    });
  const result = await previewContentImport(bundle, target);
  expect(result.entries.map((entry) => [entry.key, entry.expectedHash])).toEqual([
    ['first', 'reviewed-first'],
    ['last', 'reviewed-last'],
  ]);
  expect(result.nextCursor).toBeNull();
  expect(vi.mocked(db.mutation).mock.calls.map((call) => call[1])).toEqual([
    { package: bundle, target },
    { package: bundle, target, cursor: 50 },
  ]);
});

test.each(['rulesetId', 'groupId', 'ownerId'])(
  'refuses preview pages when %s changes between transactions',
  async (field) => {
    vi.mocked(db.mutation)
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({ ...page, [field]: 'different-target', nextCursor: null });
    await expect(previewContentImport(bundle, target)).rejects.toThrow('target changed while previewing');
  }
);
