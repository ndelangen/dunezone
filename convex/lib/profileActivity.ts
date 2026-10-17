import { DirectAggregate } from '@convex-dev/aggregate';
import type { Triggers } from 'convex-helpers/server/triggers';

import { components } from '../_generated/api';
import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

export const PROFILE_ACTIVITY_METRICS = ['groups', 'factions', 'questions', 'answers'] as const;

export type ProfileActivityMetric = (typeof PROFILE_ACTIVITY_METRICS)[number];

/* Large enough that today's metrics each come back in one page. */
const ACTIVITY_PAGE_SIZE = 1000;

type ActivityItem = {
  namespace: ProfileActivityMetric;
  key: [string];
  id: string;
};

const profileActivity = new DirectAggregate<{
  Namespace: ProfileActivityMetric;
  Key: [string];
  Id: string;
}>(components.profileActivity);

function membershipItem(membership: Doc<'group_members'>): ActivityItem | null {
  return membership.status === 'active' ? { namespace: 'groups', key: [membership.user_id], id: membership._id } : null;
}

function factionItem(faction: Doc<'factions'>): ActivityItem | null {
  return faction.is_deleted ? null : { namespace: 'factions', key: [faction.owner_id], id: faction._id };
}

function questionItem(question: Doc<'faq_items'>): ActivityItem {
  return { namespace: 'questions', key: [question.asked_by], id: question._id };
}

function answerItem(answer: Doc<'faq_answers'>): ActivityItem {
  return { namespace: 'answers', key: [answer.answered_by], id: answer._id };
}

function sameItem(left: ActivityItem | null, right: ActivityItem | null): boolean {
  return left?.namespace === right?.namespace && left?.key[0] === right?.key[0] && left?.id === right?.id;
}

async function applyTransition(ctx: MutationCtx, oldItem: ActivityItem | null, newItem: ActivityItem | null) {
  if (sameItem(oldItem, newItem)) {
    if (newItem) {
      await profileActivity.insertIfDoesNotExist(ctx, newItem);
    }
    return;
  }
  if (oldItem && newItem) {
    await profileActivity.replaceOrInsert(ctx, oldItem, newItem);
    return;
  }
  if (oldItem) {
    await profileActivity.deleteIfExists(ctx, oldItem);
    return;
  }
  if (newItem) {
    await profileActivity.insertIfDoesNotExist(ctx, newItem);
  }
}

export function registerProfileActivityTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  triggers.register('group_members', async (ctx, change) => {
    await applyTransition(
      ctx,
      change.oldDoc ? membershipItem(change.oldDoc) : null,
      change.newDoc ? membershipItem(change.newDoc) : null
    );
  });

  triggers.register('factions', async (ctx, change) => {
    await applyTransition(
      ctx,
      change.oldDoc ? factionItem(change.oldDoc) : null,
      change.newDoc ? factionItem(change.newDoc) : null
    );
  });

  triggers.register('faq_items', async (ctx, change) => {
    await applyTransition(
      ctx,
      change.oldDoc ? questionItem(change.oldDoc) : null,
      change.newDoc ? questionItem(change.newDoc) : null
    );
  });

  triggers.register('faq_answers', async (ctx, change) => {
    await applyTransition(
      ctx,
      change.oldDoc ? answerItem(change.oldDoc) : null,
      change.newDoc ? answerItem(change.newDoc) : null
    );
  });
}

export type ProfileActivityCounts = {
  groupCount: number;
  factionCount: number;
  questionCount: number;
  answerCount: number;
};

/**
 * Per-user activity counts, from one pass over each metric's items.
 * A per-user `countBatch` walks the tree from its root once per user and metric, so a full directory re-read the same nodes thousands of times;
 * one ordered pass reads each node once and grows with the activity recorded, not with the profiles listed.
 */
export async function loadProfileActivityCounts(
  ctx: QueryCtx,
  userIds: Id<'users'>[]
): Promise<ProfileActivityCounts[]> {
  const counts = new Map<string, Record<ProfileActivityMetric, number>>(
    userIds.map((userId) => [userId, { groups: 0, factions: 0, questions: 0, answers: 0 }])
  );
  for (const namespace of PROFILE_ACTIVITY_METRICS) {
    for await (const item of profileActivity.iter(ctx, { namespace, pageSize: ACTIVITY_PAGE_SIZE })) {
      const entry = counts.get(item.key[0]);
      if (entry) {
        entry[namespace] += 1;
      }
    }
  }
  return userIds.map((userId) => {
    const entry = counts.get(userId)!;
    return {
      groupCount: entry.groups,
      factionCount: entry.factions,
      questionCount: entry.questions,
      answerCount: entry.answers,
    };
  });
}

export async function clearProfileActivity(ctx: MutationCtx) {
  await profileActivity.clearAll(ctx);
}

export async function reconcileMembershipActivity(ctx: MutationCtx, membership: Doc<'group_members'>) {
  const item = { namespace: 'groups' as const, key: [membership.user_id] as [string] };
  if (membership.status === 'active') {
    await profileActivity.insertIfDoesNotExist(ctx, { ...item, id: membership._id });
  } else {
    await profileActivity.deleteIfExists(ctx, { ...item, id: membership._id });
  }
}

export async function reconcileFactionActivity(ctx: MutationCtx, faction: Doc<'factions'>) {
  const item = { namespace: 'factions' as const, key: [faction.owner_id] as [string] };
  if (faction.is_deleted) {
    await profileActivity.deleteIfExists(ctx, { ...item, id: faction._id });
  } else {
    await profileActivity.insertIfDoesNotExist(ctx, { ...item, id: faction._id });
  }
}

export async function reconcileQuestionActivity(ctx: MutationCtx, question: Doc<'faq_items'>) {
  await profileActivity.insertIfDoesNotExist(ctx, questionItem(question));
}

export async function reconcileAnswerActivity(ctx: MutationCtx, answer: Doc<'faq_answers'>) {
  await profileActivity.insertIfDoesNotExist(ctx, answerItem(answer));
}
