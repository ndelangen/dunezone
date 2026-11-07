/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';

const now = '2026-11-07T00:00:00.000Z';

async function seedAccount(t: ReturnType<typeof applicationTest>, slug: string, username = slug) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { account_state: 'active' });
    await ctx.db.insert('profiles', {
      user_id: userId,
      username,
      avatar_url: null,
      account_state: 'active',
      slug,
      created_at: now,
      updated_at: now,
    });
    const sessionId = await ctx.db.insert('authSessions', { userId, expirationTime: Date.now() + 86_400_000 });
    return { userId, subject: `${userId}|${sessionId}` };
  });
}

async function seedGroup(t: ReturnType<typeof applicationTest>, slug: string, ownerId: Id<'users'>, deleted = false) {
  return await t.run(async (ctx) => {
    const groupId = await ctx.db.insert('groups', {
      name: slug,
      slug,
      created_at: now,
      created_by: ownerId,
      is_deleted: deleted,
    });
    await ctx.db.insert('group_members', {
      group_id: groupId,
      user_id: ownerId,
      status: 'active',
      requested_at: now,
      approved_at: now,
      approved_by: ownerId,
    });
    return groupId;
  });
}

async function seedMembership(
  t: ReturnType<typeof applicationTest>,
  groupId: Id<'groups'>,
  userId: Id<'users'>,
  status: 'active' | 'pending' | 'invited' | 'removed'
) {
  await t.run(async (ctx) => {
    await ctx.db.insert('group_members', {
      group_id: groupId,
      user_id: userId,
      status,
      requested_at: now,
      approved_at: status === 'active' ? now : null,
      approved_by: status === 'pending' || status === 'removed' ? null : userId,
    });
  });
}

/**
 * The deleting account shares one Group with a co-member, and is also the owner of a second one the co-member shares as well;
 * beside them a stranger, an invited person, a requester, and a former member who was removed, none of whom share a Group.
 */
async function coMemberFixture() {
  const t = applicationTest();
  const source = await seedAccount(t, 'source');
  const coMember = await seedAccount(t, 'co-member', 'Chani');
  const stranger = await seedAccount(t, 'stranger', 'Alia');
  const invited = await seedAccount(t, 'invited', 'Duncan');
  const requester = await seedAccount(t, 'requester', 'Gurney');
  const former = await seedAccount(t, 'former', 'Thufir');
  const ownGroupId = await seedGroup(t, 'own-group', source.userId);
  const sharedGroupId = await seedGroup(t, 'shared-group', coMember.userId);
  await seedMembership(t, sharedGroupId, source.userId, 'active');
  await seedMembership(t, ownGroupId, coMember.userId, 'active');
  await seedMembership(t, ownGroupId, invited.userId, 'invited');
  await seedMembership(t, ownGroupId, requester.userId, 'pending');
  await seedMembership(t, ownGroupId, former.userId, 'removed');
  /* The stranger owns a Group of their own, which proves membership elsewhere counts for nothing. */
  await seedGroup(t, 'stranger-group', stranger.userId);
  return {
    t,
    source,
    coMember,
    stranger,
    invited,
    requester,
    former,
    ownGroupId,
    asSource: t.withIdentity({ subject: source.subject }),
  };
}

describe('account deletion replacement owners', () => {
  test('confirm accepts a co-member and refuses everyone who shares no Group', async () => {
    const { asSource, coMember, stranger, invited, requester, former } = await coMemberFixture();
    for (const candidate of [stranger, invited, requester, former]) {
      await expect(
        asSource.mutation(api.accountDeletion.confirm, { replacementUserId: candidate.userId })
      ).rejects.toThrow('must be a member of a group you are also a member of');
    }
    await expect(
      asSource.mutation(api.accountDeletion.confirm, { replacementUserId: coMember.userId })
    ).resolves.toMatchObject({ operationId: expect.any(String) });
  });

  test('a shared Group that was deleted no longer counts', async () => {
    const t = applicationTest();
    const source = await seedAccount(t, 'gone-source');
    const coMember = await seedAccount(t, 'gone-co-member');
    const groupId = await seedGroup(t, 'gone-group', source.userId, true);
    await seedMembership(t, groupId, coMember.userId, 'active');
    await expect(
      t
        .withIdentity({ subject: source.subject })
        .mutation(api.accountDeletion.confirm, { replacementUserId: coMember.userId })
    ).rejects.toThrow('must be a member of a group you are also a member of');
  });

  test('the picker lists co-members alone, each once, searchable and paged', async () => {
    const { t, asSource, coMember, ownGroupId, source } = await coMemberFixture();
    const second = await seedAccount(t, 'second', 'Stilgar');
    await seedMembership(t, ownGroupId, second.userId, 'active');

    const all = await asSource.query(api.accountDeletion.listReplacementProfiles, {
      paginationOpts: { cursor: null, numItems: 20 },
      search: '',
    });
    /* By name: Chani, who shares two Groups, is listed once; the invited, pending, removed and stranger accounts not at all. */
    expect(all.page.map((profile) => profile.userId)).toEqual([coMember.userId, second.userId]);
    expect(all.page.map((profile) => profile.username)).toEqual(['Chani', 'Stilgar']);
    expect(all.isDone).toBe(true);
    expect(all.page.some((profile) => profile.userId === source.userId)).toBe(false);

    const firstPage = await asSource.query(api.accountDeletion.listReplacementProfiles, {
      paginationOpts: { cursor: null, numItems: 1 },
      search: '',
    });
    expect(firstPage.page.map((profile) => profile.slug)).toEqual(['co-member']);
    expect(firstPage.isDone).toBe(false);
    const secondPage = await asSource.query(api.accountDeletion.listReplacementProfiles, {
      paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 },
      search: '',
    });
    expect(secondPage.page.map((profile) => profile.slug)).toEqual(['second']);
    expect(secondPage.isDone).toBe(true);

    const searched = await asSource.query(api.accountDeletion.listReplacementProfiles, {
      paginationOpts: { cursor: null, numItems: 20 },
      search: 'sec',
    });
    expect(searched.page.map((profile) => profile.slug)).toEqual(['second']);
    const missing = await asSource.query(api.accountDeletion.listReplacementProfiles, {
      paginationOpts: { cursor: null, numItems: 20 },
      search: 'stranger',
    });
    expect(missing.page).toEqual([]);

    /* A database cursor from before the list paged by offset is refused with the reset signal `usePaginatedQuery` restarts on. */
    await expect(
      asSource.query(api.accountDeletion.listReplacementProfiles, {
        paginationOpts: { cursor: 'eyJsZWdhY3kiOnRydWV9', numItems: 20 },
        search: '',
      })
    ).rejects.toMatchObject({ data: { paginationError: 'InvalidCursor' } });
  });
});
