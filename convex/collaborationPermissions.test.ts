/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function collaborationFixture() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileDiscovery');
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Group asset owner' });
    const memberId = await ctx.db.insert('users', { name: 'Group collaborator' });
    const contributorId = await ctx.db.insert('users', { name: 'FAQ contributor' });
    const groupId = await ctx.db.insert('groups', {
      name: 'Dune Designers',
      slug: 'dune-designers',
      created_at: '2026-08-04T00:00:00.000Z',
      created_by: ownerId,
    });
    await ctx.db.insert('group_members', {
      group_id: groupId,
      user_id: ownerId,
      status: 'active',
      requested_at: '2026-08-04T00:00:00.000Z',
      approved_at: '2026-08-04T00:00:00.000Z',
      approved_by: ownerId,
    });
    await ctx.db.insert('group_members', {
      group_id: groupId,
      user_id: memberId,
      status: 'active',
      requested_at: '2026-08-04T00:00:00.000Z',
      approved_at: '2026-08-04T00:00:00.000Z',
      approved_by: ownerId,
    });
    return { ownerId, memberId, contributorId, groupId };
  });
  const owner = t.withIdentity({ subject: ids.ownerId });
  const member = t.withIdentity({ subject: ids.memberId });
  const contributor = t.withIdentity({ subject: ids.contributorId });
  const ruleset = await owner.mutation(api.rulesets.create, {
    name: 'CollaborativeRuleset',
    group_id: ids.groupId,
    image_cover: null,
  });
  return { t, ids, owner, member, contributor, ruleset };
}

describe('group collaboration permissions', () => {
  test('members edit ordinary ruleset fields but cannot rename, reassign, or delete it', async () => {
    const { member, ruleset } = await collaborationFixture();

    await expect(
      member.mutation(api.rulesets.update, {
        id: ruleset._id,
        name: ruleset.name,
        image_cover: 'https://example.com/collaborative-cover.jpg',
      })
    ).resolves.toMatchObject({
      name: ruleset.name,
      image_cover: 'https://example.com/collaborative-cover.jpg',
    });
    await expect(
      member.mutation(api.rulesets.update, {
        id: ruleset._id,
        name: 'MemberRename',
      })
    ).rejects.toThrow('Only the ruleset owner can rename this ruleset');
    await expect(
      member.mutation(api.rulesets.update, {
        id: ruleset._id,
        name: ruleset.name,
        group_id: null,
      })
    ).rejects.toThrow('Only the ruleset owner can change its group');
    await expect(member.mutation(api.rulesets.softDelete, { id: ruleset._id })).rejects.toThrow(
      'Not authorized'
    );
  });

  test('question ownership and moderation do not depend on ruleset group membership', async () => {
    const { contributor, member, ruleset } = await collaborationFixture();
    const question = await contributor.mutation(api.faq.createItem, {
      ruleset_id: ruleset._id,
      question: 'Can an author maintain this question?',
      tags: ['rules'],
    });
    const answer = await member.mutation(api.faq.createAnswer, {
      faq_item_id: question._id,
      answer: 'The answer remains owned by its author.',
    });

    await expect(
      contributor.mutation(api.faq.updateItem, {
        id: question._id,
        question: 'Can the author maintain this question outside the group?',
      })
    ).resolves.toMatchObject({
      question: 'Can the author maintain this question outside the group?',
    });
    await expect(
      contributor.mutation(api.faq.setAcceptedAnswer, {
        faq_item_id: question._id,
        accepted_answer_id: answer._id,
      })
    ).resolves.toMatchObject({ accepted_answer_id: answer._id });
    await expect(
      contributor.mutation(api.faq.updateAnswer, {
        id: answer._id,
        answer: "A question owner cannot rewrite another author's answer.",
      })
    ).rejects.toThrow('Not authorized');
    await expect(
      contributor.mutation(api.faq.deleteAnswer, { id: answer._id })
    ).resolves.toMatchObject({ id: answer._id });
    await expect(
      contributor.mutation(api.faq.deleteItem, { id: question._id })
    ).resolves.toMatchObject({ id: question._id });
  });
});
