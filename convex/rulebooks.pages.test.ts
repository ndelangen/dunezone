import { describe, expect, it } from 'vitest';

import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

describe('Rulebook lifecycle page queries', () => {
  it('keeps the creation route free when a Rulebook is named Create', async () => {
    const { owner, ids } = await rulebookFixture();
    const created = await owner.mutation(api.rulebooks.create, {
      ruleset_id: ids.rulesetId,
      name: 'Create',
      source: { kind: 'starter' },
    });
    expect(created.rulebook.slug).toBe('create-2');
    await owner.mutation(api.rulebooks.rename, { rulebook_id: created.rulebook._id, name: 'Reference' });
    expect(
      (await owner.mutation(api.rulebooks.rename, { rulebook_id: created.rulebook._id, name: 'Create' })).slug
    ).toBe('create-2');
  });

  it('shares the saved order and excludes deleted clone sources without exposing Contents', async () => {
    const { owner, ids } = await rulebookFixture();
    const create = (name: string) =>
      owner.mutation(api.rulebooks.create, {
        ruleset_id: ids.rulesetId,
        name,
        source: { kind: 'starter' },
      });
    const first = await create('First');
    const second = await create('Second');
    const deleted = await create('Deleted');
    await owner.mutation(api.rulebooks.softDelete, { rulebook_id: deleted.rulebook._id });
    await owner.mutation(api.rulebooks.reorder, {
      ruleset_id: ids.rulesetId,
      rulebook_ids: [second.rulebook._id, first.rulebook._id],
    });
    const listing = await owner.query(api.rulesets.detailPageBySlug, { slug: 'rulebook-test-rules' });
    const creation = await owner.query(api.rulebooks.creationPage, { ruleset_slug: 'rulebook-test-rules' });
    expect(listing?.rulebooks.map((book) => book.name)).toEqual(['Second', 'First']);
    expect(creation?.rulebooks).toEqual(listing?.rulebooks);
    expect(creation?.rulebooks[0]).not.toHaveProperty('contents');
    expect(creation).not.toHaveProperty('draft');
    expect(creation?.rulebooks[0]).not.toHaveProperty('name_key');
  });

  it('authorizes the owner and active members, but not outsiders, inactive members, or signed-out readers', async () => {
    const { t, ids, owner, member, outsider } = await rulebookFixture();
    await owner.mutation(api.rulebooks.create, {
      ruleset_id: ids.rulesetId,
      name: 'Rules',
      source: { kind: 'starter' },
    });
    const args = { ruleset_slug: 'rulebook-test-rules' };
    expect((await owner.query(api.rulebooks.creationPage, args))?.viewerAccess.capabilities).toMatchObject({
      edit: true,
      rename: true,
    });
    expect((await member.query(api.rulebooks.creationPage, args))?.viewerAccess.capabilities).toMatchObject({
      edit: true,
      rename: false,
    });
    for (const reader of [outsider, t]) {
      expect(await reader.query(api.rulebooks.creationPage, args)).toMatchObject({
        viewerAccess: { capabilities: { edit: false } },
        rulebooks: [],
      });
      expect((await reader.query(api.rulesets.detailPageBySlug, { slug: args.ruleset_slug }))?.rulebooks).toHaveLength(
        1
      );
    }
    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query('group_members')
        .withIndex('by_group_user', (q) => q.eq('group_id', ids.groupId).eq('user_id', ids.memberId))
        .unique();
      await ctx.db.patch('group_members', membership!._id, { status: 'removed' });
    });
    expect(await member.query(api.rulebooks.creationPage, args)).toMatchObject({
      viewerAccess: { capabilities: { edit: false } },
      rulebooks: [],
    });
    await expect(
      member.mutation(api.rulebooks.create, {
        ruleset_id: ids.rulesetId,
        name: 'No longer allowed',
        source: { kind: 'starter' },
      })
    ).rejects.toThrow('Not authorized');
  });

  it('treats a missing or deleted Ruleset as unavailable', async () => {
    const { t, ids } = await rulebookFixture();
    expect(await t.query(api.rulebooks.creationPage, { ruleset_slug: 'missing' })).toBeNull();
    await t.run((ctx) => ctx.db.patch('rulesets', ids.rulesetId, { is_deleted: true }));
    expect(await t.query(api.rulebooks.creationPage, { ruleset_slug: 'rulebook-test-rules' })).toBeNull();
  });
});
