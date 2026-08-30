/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

async function editorFixture() {
  const fixture = await rulebookFixture();
  const created = await fixture.owner.mutation(api.rulebooks.create, {
    ruleset_id: fixture.ids.rulesetId,
    name: 'Editor manual',
    source: { kind: 'starter' },
  });
  return {
    ...fixture,
    created,
    locator: { ruleset_slug: 'rulebook-test-rules', rulebook_slug: created.rulebook.slug },
  };
}

describe('Rulebook editor page', () => {
  test('returns no draft to anonymous or denied viewers, including a former member', async () => {
    const { t, ids, owner, member, outsider, locator } = await editorFixture();
    expect(await t.query(api.rulebooks.editorPage, locator)).toMatchObject({ kind: 'sign-in-required' });
    const denied = await outsider.query(api.rulebooks.editorPage, locator);
    expect(denied).toMatchObject({ kind: 'denied' });
    expect(denied).not.toHaveProperty('draft');
    expect(denied).not.toHaveProperty('assetsById');
    expect(await owner.query(api.rulebooks.editorPage, locator)).toMatchObject({
      kind: 'editable',
      draft: { revision: 1 },
    });
    expect(await member.query(api.rulebooks.editorPage, locator)).toMatchObject({ kind: 'editable' });
    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query('group_members')
        .withIndex('by_group_user', (q) => q.eq('group_id', ids.groupId).eq('user_id', ids.memberId))
        .unique();
      await ctx.db.patch(membership!._id, { status: 'pending' });
    });
    const former = await member.query(api.rulebooks.editorPage, locator);
    expect(former).toMatchObject({ kind: 'denied' });
    expect(former).not.toHaveProperty('draft');
    expect(await owner.query(api.rulebooks.editorPage, { ...locator, rulebook_slug: 'missing' })).toBeNull();
  });

  test('resolves only live referenced Assets to their published image and observes deletion', async () => {
    const { t, ids, owner, created, locator } = await editorFixture();
    const assetId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('assets', {
        type: 'token-disc',
        slug: 'storm',
        owner_id: ids.ownerId,
        group_id: null,
        is_deleted: false,
        data: { name: 'Storm marker' },
        created_at: '2026-08-30',
        updated_at: '2026-08-30',
      });
      await ctx.db.insert('publication_assets', {
        asset_type: 'token-disc',
        asset_id: id,
        cache_token: 'ready',
        published_at: 1,
      });
      return id;
    });
    const contents = structuredClone(created.draft.contents) as RulebookContentsV1;
    for (const page of Object.values(contents.pagesById)) {
      for (const block of Object.values(page.blocksById)) {
        if (block.kind === 'asset-figure') {
          block.assetId = assetId;
        }
      }
    }
    await owner.mutation(api.rulebooks.save, { rulebook_id: created.rulebook._id, expected_revision: 1, contents });
    const page = await owner.query(api.rulebooks.editorPage, locator);
    expect(page).toMatchObject({
      kind: 'editable',
      draft: { revision: 2 },
      assetsById: { [assetId]: { name: 'Storm marker', imageUrl: publishedHref('token-disc', assetId, 'ready') } },
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(assetId, { is_deleted: true });
    });
    expect(await owner.query(api.rulebooks.editorPage, locator)).toMatchObject({ assetsById: {} });
  });
});
