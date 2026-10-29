import type { FunctionReturnType } from 'convex/server';
import { expect, test } from 'vite-plus/test';

import { GF9_STRONGHOLD_CARDS, GF9_STRONGHOLD_DECK } from '../src/shared/assets/gf9StrongholdDeck';
import { contentImportPackageSchema } from '../src/shared/contentImports/package';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';

const target = { rulesetSlug: 'limit-rules', groupSlug: 'limit-group' };
async function limitedFixture(options: Parameters<typeof applicationTest>[0] = { transactionLimits: true }) {
  const t = applicationTest(options);
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Owner' });
    const groupId = await ctx.db.insert('groups', {
      name: 'Group',
      slug: target.groupSlug,
      created_by: ownerId,
      created_at: '2026-10-20',
      is_deleted: false,
    });
    await ctx.db.insert('group_members', {
      group_id: groupId,
      user_id: ownerId,
      status: 'active',
      requested_at: '2026-10-20',
      approved_at: '2026-10-20',
      approved_by: ownerId,
    });
    const rulesetId = await ctx.db.insert('rulesets', {
      name: 'Rules',
      slug: target.rulesetSlug,
      about: 'Rules',
      owner_id: ownerId,
      group_id: groupId,
      image_cover: null,
      created_at: '2026-10-20',
      updated_at: '2026-10-20',
      is_deleted: false,
    });
    return { ownerId, groupId, rulesetId };
  });
  return { t, ids, owner: t.withIdentity({ subject: ids.ownerId }) };
}

test('previews all 500 existing items in bounded pages under transaction limits', async () => {
  const { t, ids, owner } = await limitedFixture();
  const items = Array.from({ length: 500 }, (_, index) => ({
    key: `deck-${index}`,
    kind: 'asset',
    type: 'deck',
    data: { ...GF9_STRONGHOLD_DECK, name: `Deck ${index}` },
    existing: { slug: `deck-${index}` },
  }));
  await t.run(async (ctx) => {
    for (const item of items) {
      await ctx.db.insert('assets', {
        type: 'deck',
        data: item.data,
        slug: item.existing.slug,
        owner_id: ids.ownerId,
        group_id: ids.groupId,
        is_deleted: false,
        created_at: '2026-10-20',
        updated_at: '2026-10-20',
      });
    }
  });
  const bundle = contentImportPackageSchema.parse({
    format: 'dunezone-package',
    version: 1,
    packageKey: 'limit-check',
    items,
  });
  const seen: string[] = [];
  let cursor: number | null = 0;
  let calls = 0;
  while (cursor !== null) {
    const page: FunctionReturnType<typeof api.contentImports.preview> = await owner.mutation(
      api.contentImports.preview,
      {
        package: bundle,
        target,
        ...(cursor === 0 ? {} : { cursor }),
      }
    );
    expect(page.entries.length).toBeLessThanOrEqual(50);
    expect(page.entries.filter((entry) => entry.status === 'conflict')).toEqual([]);
    expect([page.rulesetId, page.groupId, page.ownerId]).toEqual([ids.rulesetId, ids.groupId, ids.ownerId]);
    seen.push(...page.entries.map((entry) => entry.key));
    cursor = page.nextCursor;
    calls += 1;
  }
  expect(calls).toBe(10);
  expect(seen).toEqual(items.map((item) => item.key));
  for (const invalid of [-1, 0.5, 501]) {
    await expect(
      owner.mutation(api.contentImports.preview, { package: bundle, target, cursor: invalid })
    ).rejects.toThrow('cursor');
  }
});

test('applies a 499-member deck under transaction limits', async () => {
  const { t, ids, owner } = await limitedFixture();
  const members = Array.from({ length: 499 }, (_, index) => ({ key: `card-${index}`, count: 1 }));
  await t.run(async (ctx) => {
    for (const [index, member] of members.entries()) {
      const id = await ctx.db.insert('assets', {
        type: 'card-stronghold',
        slug: member.key,
        data: { ...GF9_STRONGHOLD_CARDS[0], name: `Card ${index}` },
        owner_id: ids.ownerId,
        group_id: ids.groupId,
        is_deleted: false,
        created_at: '2026-10-20',
        updated_at: '2026-10-20',
      });
      await ctx.db.insert('content_import_receipts', {
        ruleset_id: ids.rulesetId,
        package_key: 'limit-check',
        item_key: member.key,
        kind: 'asset',
        subject_id: id,
        item_hash: 'fixture',
        state_hash: 'fixture',
        updated_by: ids.ownerId,
      });
    }
  });
  const result = await owner.mutation(api.contentImports.applyItem, {
    packageKey: 'limit-check',
    item: { key: 'large-deck', kind: 'asset', type: 'deck', data: GF9_STRONGHOLD_DECK, members },
    target,
    expectedHash: null,
  });
  const page = await owner.query(api.assets.page, { type: 'deck', slug: result.slug });
  expect(page?.members).toHaveLength(499);
}, 30_000);

test('ends a preview page before large records consume its read headroom', async () => {
  const { t, ids, owner } = await limitedFixture({ transactionLimits: { bytesRead: 4_300_000 } });
  const items = Array.from({ length: 12 }, (_, index) => ({
    key: `large-deck-${index}`,
    kind: 'asset',
    type: 'deck',
    data: { ...GF9_STRONGHOLD_DECK, name: `Large deck ${index}`, about: 'A'.repeat(110_000) },
    existing: { slug: `large-deck-${index}` },
  }));
  await t.run(async (ctx) => {
    for (const item of items) {
      await ctx.db.insert('assets', {
        type: 'deck',
        data: item.data,
        slug: item.existing.slug,
        owner_id: ids.ownerId,
        group_id: ids.groupId,
        is_deleted: false,
        created_at: '2026-10-20',
        updated_at: '2026-10-20',
      });
    }
  });
  const bundle = contentImportPackageSchema.parse({
    format: 'dunezone-package',
    version: 1,
    packageKey: 'large-records',
    items,
  });
  const first = await owner.mutation(api.contentImports.preview, { package: bundle, target });
  expect(first.entries.length).toBeLessThan(items.length);
  expect(first.nextCursor).not.toBeNull();
  const seen = [...first.entries];
  let cursor = first.nextCursor;
  while (cursor !== null) {
    const page: FunctionReturnType<typeof api.contentImports.preview> = await owner.mutation(
      api.contentImports.preview,
      { package: bundle, target, cursor }
    );
    seen.push(...page.entries);
    cursor = page.nextCursor;
  }
  expect(seen.filter((entry) => entry.status === 'conflict')).toEqual([]);
  expect(seen.map((entry) => entry.key)).toEqual(items.map((item) => item.key));
});
