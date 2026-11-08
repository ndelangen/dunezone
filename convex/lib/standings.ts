import type { Triggers } from 'convex-helpers/server/triggers';

import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { isPublicProfile } from './accountLifecycle';
import { loadProfileActivityCounts } from './profileActivity';
import { profileListName } from './profileCatalogue';

/*
 * Standings: the ranked read models behind the profile directory's leaderboards and its Groups list.
 * A row per person with something to rank (`profile_standings`) and a row per live Group (`group_standings`),
 * each holding only the counts its list orders by, so a board is one index read in count order.
 * Derived, never authored: triggers recompute a row inside the write that moved its count, and the
 * `standings_*` migrations rebuild every row from the canonical tables.
 */

/** How many rows a leaderboard shows; the boards never load more. */
export const LEADERBOARD_SIZE = 5;

/** How many Groups the list shows at first, and how many more each Load more adds. */
export const GROUP_STANDINGS_STEP = 5;

/** The most Groups one Load more answer may hold. */
export const GROUP_STANDINGS_LIMIT = 100;

/** A Group row shows at most this many member avatars. */
const GROUP_MEMBER_PREVIEW = 4;

/** How many people a Group row shows as members of one Group in the directory. */
const DIRECTORY_GROUP_LIMIT = 6;

/*
 * Counts above these bounds stop counting. A Group with more members, or more factions and rulesets,
 * still ranks above every smaller one; it only ties with others that are also past the bound.
 */
const GROUP_MEMBER_COUNT_BOUND = 1000;
const GROUP_MAINTAINED_COUNT_BOUND = 1000;

/**
 * A board reads this many rows past its size before it filters out hidden profiles and orders ties by name, so a few deleted or merged accounts near the top never leave it short.
 */
const LEADERBOARD_READ = 25;

/** Brings one person's row in line with their activity counts: written when they rank on anything, removed when they don't. */
export async function syncProfileStanding(ctx: MutationCtx, userId: Id<'users'>) {
  const [counts] = await loadProfileActivityCounts(ctx, [userId]);
  const factions = counts?.factionCount ?? 0;
  const faq = (counts?.questionCount ?? 0) + (counts?.answerCount ?? 0);
  const existing = await ctx.db
    .query('profile_standings')
    .withIndex('by_user_id', (q) => q.eq('user_id', userId))
    .unique();
  if (factions === 0 && faq === 0) {
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return;
  }
  if (!existing) {
    await ctx.db.insert('profile_standings', { user_id: userId, factions, faq });
  } else if (existing.factions !== factions || existing.faq !== faq) {
    await ctx.db.patch(existing._id, { factions, faq });
  }
}

async function countBounded<T>(query: { take: (n: number) => Promise<T[]> }, bound: number) {
  return (await query.take(bound)).length;
}

/** Brings one Group's row in line with its live state: its active members, and the factions and rulesets it maintains. */
export async function syncGroupStanding(ctx: MutationCtx, groupId: Id<'groups'>) {
  const group = await ctx.db.get(groupId);
  const existing = await ctx.db
    .query('group_standings')
    .withIndex('by_group_id', (q) => q.eq('group_id', groupId))
    .unique();
  if (!group || group.is_deleted) {
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return;
  }
  const [members, factions, rulesets] = await Promise.all([
    countBounded(
      ctx.db
        .query('group_members')
        .withIndex('by_group_status', (q) => q.eq('group_id', groupId).eq('status', 'active')),
      GROUP_MEMBER_COUNT_BOUND
    ),
    countBounded(
      ctx.db.query('factions').withIndex('by_group_deleted', (q) => q.eq('group_id', groupId).eq('is_deleted', false)),
      GROUP_MAINTAINED_COUNT_BOUND
    ),
    countBounded(
      ctx.db.query('rulesets').withIndex('by_group_deleted', (q) => q.eq('group_id', groupId).eq('is_deleted', false)),
      GROUP_MAINTAINED_COUNT_BOUND
    ),
  ]);
  const row = { members, factions, maintained: factions + rulesets };
  if (!existing) {
    await ctx.db.insert('group_standings', { group_id: groupId, ...row });
  } else if (
    existing.members !== row.members ||
    existing.factions !== row.factions ||
    existing.maintained !== row.maintained
  ) {
    await ctx.db.patch(existing._id, row);
  }
}

/** The distinct non-null values among a change's old and new document, so a move resyncs both sides. */
function touched<T>(values: (T | null | undefined)[]): T[] {
  return [...new Set(values.filter((value): value is T => value != null))];
}

/**
 * Registered after the profile activity triggers: a person's standing reads the activity counts those triggers keep, so they have to have moved first.
 */
export function registerStandingsTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  triggers.register('factions', async (ctx, change) => {
    for (const userId of touched([change.oldDoc?.owner_id, change.newDoc?.owner_id])) {
      await syncProfileStanding(ctx, userId);
    }
    for (const groupId of touched([change.oldDoc?.group_id, change.newDoc?.group_id])) {
      await syncGroupStanding(ctx, groupId);
    }
  });
  triggers.register('faq_items', async (ctx, change) => {
    for (const userId of touched([change.oldDoc?.asked_by, change.newDoc?.asked_by])) {
      await syncProfileStanding(ctx, userId);
    }
  });
  triggers.register('faq_answers', async (ctx, change) => {
    for (const userId of touched([change.oldDoc?.answered_by, change.newDoc?.answered_by])) {
      await syncProfileStanding(ctx, userId);
    }
  });
  triggers.register('rulesets', async (ctx, change) => {
    for (const groupId of touched([change.oldDoc?.group_id, change.newDoc?.group_id])) {
      await syncGroupStanding(ctx, groupId);
    }
  });
  triggers.register('group_members', async (ctx, change) => {
    for (const groupId of touched([change.oldDoc?.group_id, change.newDoc?.group_id])) {
      await syncGroupStanding(ctx, groupId);
    }
  });
  triggers.register('groups', async (ctx, change) => {
    await syncGroupStanding(ctx, change.id);
  });
}

type StandingMetric = 'factions' | 'faq';

export type LeaderboardEntry = {
  rank: number;
  count: number;
  slug: string;
  name: string;
  image: string | null;
};

/**
 * Ranks rows already in count order: equal counts share a rank and read A–Z, and the next count takes the rank after all of them (1, 1, 3), so a tie never hides how many are ahead.
 */
export function rankByCount<T extends { count: number; name: string }>(rows: T[], size: number) {
  const ordered = [...rows].sort(
    (left, right) => right.count - left.count || left.name.localeCompare(right.name, 'en', { sensitivity: 'base' })
  );
  return ordered.slice(0, size).map((row) => ({
    ...row,
    rank: ordered.findIndex((other) => other.count === row.count) + 1,
  }));
}

/** One leaderboard: the people with the most of one thing, public profiles only, never anyone at zero. */
export async function loadLeaderboard(ctx: QueryCtx, metric: StandingMetric): Promise<LeaderboardEntry[]> {
  const index = metric === 'factions' ? 'by_factions' : 'by_faq';
  const standings = await ctx.db
    .query('profile_standings')
    .withIndex(index, (q) => q.gt(metric, 0))
    .order('desc')
    .take(LEADERBOARD_READ);
  const rows = [];
  for (const standing of standings) {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', standing.user_id))
      .unique();
    if (!profile || !isPublicProfile(profile)) {
      continue;
    }
    rows.push({
      count: standing[metric],
      slug: profile.slug,
      name: profileListName(profile),
      image: profile.avatar?.url ?? profile.avatar_url,
    });
  }
  return rankByCount(rows, LEADERBOARD_SIZE);
}

async function publicProfileOf(ctx: QueryCtx, userId: Id<'users'>) {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', userId))
    .unique();
  return profile && isPublicProfile(profile) ? profile : null;
}

/** A Group as the directory's Groups list shows it: its name, its counts and the first few members' faces. */
async function groupStandingEntry(ctx: QueryCtx, standing: Doc<'group_standings'>, rank: number) {
  const group = await ctx.db.get(standing.group_id);
  if (!group || group.is_deleted) {
    return null;
  }
  const memberships = await ctx.db
    .query('group_members')
    .withIndex('by_group_status', (q) => q.eq('group_id', group._id).eq('status', 'active'))
    .take(GROUP_MEMBER_PREVIEW * 2);
  const members = [];
  for (const membership of memberships) {
    const profile = await publicProfileOf(ctx, membership.user_id);
    if (profile && members.length < GROUP_MEMBER_PREVIEW) {
      members.push({
        slug: profile.slug,
        name: profileListName(profile),
        image: profile.avatar?.url ?? profile.avatar_url,
      });
    }
  }
  return {
    rank,
    slug: group.slug,
    name: group.name,
    memberCount: standing.members,
    factionCount: standing.factions,
    members,
  };
}

/**
 * The Groups list: live Groups by active members, then by how many factions and rulesets they maintain.
 * Load more asks again with a larger limit, as the directory search does, so the list stays one live answer.
 * A rank is the row's place in that order;
 * Groups with the same counts share one.
 */
export async function loadGroupStandings(ctx: QueryCtx, requestedLimit: number | undefined) {
  const limit = Math.min(
    GROUP_STANDINGS_LIMIT,
    Math.max(GROUP_STANDINGS_STEP, Math.floor(requestedLimit ?? GROUP_STANDINGS_STEP))
  );
  const standings = await ctx.db
    .query('group_standings')
    .withIndex('by_members_and_maintained')
    .order('desc')
    .take(limit + 1);
  const shown = standings.slice(0, limit);
  const entries = [];
  for (const [index, standing] of shown.entries()) {
    const first = shown.findIndex(
      (other) => other.members === standing.members && other.maintained === standing.maintained
    );
    const entry = await groupStandingEntry(ctx, standing, (first === -1 ? index : first) + 1);
    if (entry) {
      entries.push(entry);
    }
  }
  return { entries, hasMore: standings.length > limit, limit };
}

/** The live Groups one person is an active member of, for the small discs beside their name in the directory. */
export async function loadDirectoryGroups(ctx: QueryCtx, userId: Id<'users'>) {
  const memberships = await ctx.db
    .query('group_members')
    .withIndex('by_user_status', (q) => q.eq('user_id', userId).eq('status', 'active'))
    .take(DIRECTORY_GROUP_LIMIT * 2);
  const groups = [];
  for (const membership of memberships) {
    const group = await ctx.db.get(membership.group_id);
    if (group && !group.is_deleted && groups.length < DIRECTORY_GROUP_LIMIT) {
      groups.push({ slug: group.slug, name: group.name });
    }
  }
  return groups;
}
