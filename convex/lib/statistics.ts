import { DirectAggregate } from '@convex-dev/aggregate';
import type { Triggers } from 'convex-helpers/server/triggers';

import { components } from '../_generated/api';
import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

export const STATISTICS_METRICS = [
  'users',
  'factions',
  'rulesets',
  'questions',
  'answers',
] as const;

export type StatisticsMetric = (typeof STATISTICS_METRICS)[number];

type StatisticsItem = {
  namespace: StatisticsMetric;
  key: [string];
  id: string;
};

const GLOBAL_KEY = '__global__';

const statistics = new DirectAggregate<{
  Namespace: StatisticsMetric;
  Key: [string];
  Id: string;
}>(components.statistics);

function globalItem(namespace: 'users' | 'factions' | 'rulesets', id: string): StatisticsItem {
  return { namespace, key: [GLOBAL_KEY], id };
}

function profileItem(profile: Doc<'profiles'>): StatisticsItem {
  return globalItem('users', profile._id);
}

function factionItem(faction: Doc<'factions'>): StatisticsItem | null {
  return faction.is_deleted ? null : globalItem('factions', faction._id);
}

function rulesetItem(ruleset: Doc<'rulesets'>): StatisticsItem | null {
  return ruleset.is_deleted ? null : globalItem('rulesets', ruleset._id);
}

function questionItem(question: Doc<'faq_items'>): StatisticsItem {
  return {
    namespace: 'questions',
    key: [question.ruleset_id],
    id: question._id,
  };
}

async function answerItem(ctx: MutationCtx, answer: Doc<'faq_answers'>): Promise<StatisticsItem> {
  const question = await ctx.db.get(answer.faq_item_id);
  if (!question) {
    throw new Error(
      `Cannot index FAQ answer ${answer._id}: question ${answer.faq_item_id} does not exist`
    );
  }
  return {
    namespace: 'answers',
    key: [question.ruleset_id],
    id: answer._id,
  };
}

function sameItem(left: StatisticsItem | null, right: StatisticsItem | null): boolean {
  return (
    left?.namespace === right?.namespace && left?.key[0] === right?.key[0] && left?.id === right?.id
  );
}

async function applyTransition(
  ctx: MutationCtx,
  oldItem: StatisticsItem | null,
  newItem: StatisticsItem | null
) {
  if (sameItem(oldItem, newItem)) {
    if (newItem) {
      await statistics.insertIfDoesNotExist(ctx, newItem);
    }
    return;
  }
  if (oldItem && newItem) {
    await statistics.replaceOrInsert(ctx, oldItem, newItem);
    return;
  }
  if (oldItem) {
    await statistics.deleteIfExists(ctx, oldItem);
    return;
  }
  if (newItem) {
    await statistics.insertIfDoesNotExist(ctx, newItem);
  }
}

export function registerStatisticsTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  triggers.register('profiles', async (ctx, change) => {
    await applyTransition(
      ctx,
      change.oldDoc ? profileItem(change.oldDoc) : null,
      change.newDoc ? profileItem(change.newDoc) : null
    );
  });

  triggers.register('factions', async (ctx, change) => {
    await applyTransition(
      ctx,
      change.oldDoc ? factionItem(change.oldDoc) : null,
      change.newDoc ? factionItem(change.newDoc) : null
    );
  });

  triggers.register('rulesets', async (ctx, change) => {
    await applyTransition(
      ctx,
      change.oldDoc ? rulesetItem(change.oldDoc) : null,
      change.newDoc ? rulesetItem(change.newDoc) : null
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
      change.oldDoc ? await answerItem(ctx, change.oldDoc) : null,
      change.newDoc ? await answerItem(ctx, change.newDoc) : null
    );
  });
}

export async function loadGlobalStatisticsTotals(ctx: QueryCtx) {
  const [users, factions, rulesets, questions, answers] = await statistics.countBatch(ctx, [
    { namespace: 'users' },
    { namespace: 'factions' },
    { namespace: 'rulesets' },
    { namespace: 'questions' },
    { namespace: 'answers' },
  ]);
  return { users, factions, rulesets, questions, answers };
}

export async function loadRulesetStatisticsTotals(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  const bounds = { prefix: [rulesetId] as [string] };
  const [questions, answers] = await statistics.countBatch(ctx, [
    { namespace: 'questions', bounds },
    { namespace: 'answers', bounds },
  ]);
  return { questions, answers };
}

export async function clearStatistics(ctx: MutationCtx) {
  await statistics.clearAll(ctx);
}

export async function reconcileProfileStatistics(ctx: MutationCtx, profile: Doc<'profiles'>) {
  await statistics.insertIfDoesNotExist(ctx, profileItem(profile));
}

export async function reconcileFactionStatistics(ctx: MutationCtx, faction: Doc<'factions'>) {
  const item = globalItem('factions', faction._id);
  if (faction.is_deleted) {
    await statistics.deleteIfExists(ctx, item);
  } else {
    await statistics.insertIfDoesNotExist(ctx, item);
  }
}

export async function reconcileRulesetStatistics(ctx: MutationCtx, ruleset: Doc<'rulesets'>) {
  const item = globalItem('rulesets', ruleset._id);
  if (ruleset.is_deleted) {
    await statistics.deleteIfExists(ctx, item);
  } else {
    await statistics.insertIfDoesNotExist(ctx, item);
  }
}

export async function reconcileQuestionStatistics(ctx: MutationCtx, question: Doc<'faq_items'>) {
  await statistics.insertIfDoesNotExist(ctx, questionItem(question));
}

export async function reconcileAnswerStatistics(ctx: MutationCtx, answer: Doc<'faq_answers'>) {
  await statistics.insertIfDoesNotExist(ctx, await answerItem(ctx, answer));
}
