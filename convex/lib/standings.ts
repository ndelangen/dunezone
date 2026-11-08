import type { Triggers } from 'convex-helpers/server/triggers';

import { GROUP_STANDINGS_STEP } from '../../src/shared/profiles/catalogueSearch';
import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { isPublicProfile } from './accountLifecycle';
import { loadProfileActivityCounts } from './profileActivity';
import { profileListName } from './profileCatalogue';

/*
 * Standings: the ranked read models behind the profile directory's leaderboards and its Groups list.
 * A row per public person with something to rank (`profile_standings`) and a row per live Group (`group_standings`),
 * each holding only the counts its list orders by, so a board is one index read in count order.
 * Derived, never authored: triggers recompute a row inside the write that moved its count, and the
 * `standings_*` migrations rebuild every row from the canonical tables.
 */

export { GROUP_STANDINGS_STEP };

/** How many rows a leaderboard shows; the boards never load more. */
export const LEADERBOARD_SIZE = 5;

/** The most Groups one Load more answer may hold. */
export const GROUP_STANDINGS_LIMIT = 100;

/** A Group row shows at most this many member avatars. */
const GROUP_MEMBER_PREVIEW = 4;

/** How many Groups a person's directory row shows as discs; the rest are counted beside them. */
const DIRECTORY_GROUP_LIMIT = 6;

/*
 * Counts above these bounds stop counting. A Group with more members, or more factions and rulesets,
 * still ranks above every smaller one; it only ties with others that are also past the bound.
 */
const GROUP_MEMBER_COUNT_BOUND = 1000;
const GROUP_MAINTAINED_COUNT_BOUND = 1000;

/**
 * How many people tied with the fifth a board reads, so a tie across the cutoff is ordered A-Z over everyone in it.
 * Past this many at one count the board shows the first it read.
 */
const LEADERBOARD_TIE_READ = 100;

type ProfileStandingCounts = { factions: number; faq: number };

/** What one person ranks on, or null when they rank on nothing or their profile is hidden. */
async function profileStandingCounts(ctx: MutationCtx, userId: Id<'users'>): Promise<ProfileStandingCounts | null> {
  const profile = await publicProfileOf(ctx, userId);
  if (!profile) {
    return null;
  }
  const [counts] = await loadProfileActivityCounts(ctx, [userId]);
  if (!counts) {
    return null;
  }
  const row = { factions: counts.factionCount, faq: counts.questionCount + counts.answerCount };
  return row.factions === 0 && row.faq === 0 ? null : row;
}

function sameCounts<T extends object>(existing: T, row: T) {
  return (Object.keys(row) as (keyof T)[]).every((key) => existing[key] === row[key]);
}

/** Writes a derived row: inserted when new, patched when a count moved, deleted when there is nothing to rank. */
async function writeStanding<Table extends 'profile_standings' | 'group_standings'>(
  ctx: MutationCtx,
  existing: Doc<Table> | null,
  row: Partial<Doc<Table>> | null,
  insert: () => Promise<unknown>
) {
  if (!row) {
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return;
  }
  if (!existing) {
    await insert();
  } else if (!sameCounts(existing, row)) {
    await ctx.db.patch(existing._id, row as never);
  }
}

/** Brings one person's row in line with their activity counts: written when they rank on anything, removed when they don't or their profile is hidden. */
export async function syncProfileStanding(ctx: MutationCtx, userId: Id<'users'>) {
  const row = await profileStandingCounts(ctx, userId);
  const existing = await ctx.db
    .query('profile_standings')
    .withIndex('by_user_id', (q) => q.eq('user_id', userId))
    .unique();
  await writeStanding(ctx, existing, row, () => ctx.db.insert('profile_standings', { user_id: userId, ...row! }));
}

async function countBounded<T>(query: { take: (n: number) => Promise<T[]> }, bound: number) {
  return (await query.take(bound)).length;
}

async function groupStandingCounts(ctx: MutationCtx, groupId: Id<'groups'>) {
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
  return { members, factions, maintained: factions + rulesets };
}

/** Brings one Group's row in line with its live state: its active members, and the factions and rulesets it maintains. */
export async function syncGroupStanding(ctx: MutationCtx, groupId: Id<'groups'>) {
  const group = await ctx.db.get(groupId);
  const row = group?.is_deleted === false ? await groupStandingCounts(ctx, groupId) : null;
  const existing = await ctx.db
    .query('group_standings')
    .withIndex('by_group_id', (q) => q.eq('group_id', groupId))
    .unique();
  await writeStanding(ctx, existing, row, () => ctx.db.insert('group_standings', { group_id: groupId, ...row! }));
}

type Change<D> = { oldDoc: D | null; newDoc: D | null };

/**
 * The subjects whose count a change moved: `subject` names what a document counts toward, or null when it counts toward nothing.
 * A save that leaves that unchanged moves nothing, so an edit to a faction's content costs no recount.
 */
function moved<D, K>(change: Change<D>, subject: (doc: D) => K | null) {
  const before = change.oldDoc ? subject(change.oldDoc) : null;
  const after = change.newDoc ? subject(change.newDoc) : null;
  if (before === after) {
    return [];
  }
  return [before, after].filter((value): value is K => value !== null);
}

/**
 * Registered after the profile activity triggers: a person's standing reads the activity counts those triggers keep, so they have to have moved first.
 */
export function registerStandingsTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  triggers.register('factions', async (ctx, change) => {
    for (const userId of moved(change, (faction) => (faction.is_deleted ? null : faction.owner_id))) {
      await syncProfileStanding(ctx, userId);
    }
    for (const groupId of moved(change, (faction) => (faction.is_deleted ? null : faction.group_id))) {
      await syncGroupStanding(ctx, groupId);
    }
  });
  triggers.register('faq_items', async (ctx, change) => {
    for (const userId of moved(change, (question) => question.asked_by)) {
      await syncProfileStanding(ctx, userId);
    }
  });
  triggers.register('faq_answers', async (ctx, change) => {
    for (const userId of moved(change, (answer) => answer.answered_by)) {
      await syncProfileStanding(ctx, userId);
    }
  });
  triggers.register('profiles', async (ctx, change) => {
    for (const userId of moved(change, (profile) => (isPublicProfile(profile) ? profile.user_id : null))) {
      await syncProfileStanding(ctx, userId);
    }
  });
  triggers.register('rulesets', async (ctx, change) => {
    for (const groupId of moved(change, (ruleset) => (ruleset.is_deleted ? null : ruleset.group_id))) {
      await syncGroupStanding(ctx, groupId);
    }
  });
  triggers.register('group_members', async (ctx, change) => {
    for (const groupId of moved(change, (member) => (member.status === 'active' ? member.group_id : null))) {
      await syncGroupStanding(ctx, groupId);
    }
  });
  triggers.register('groups', async (ctx, change) => {
    for (const groupId of moved(change, (group) => (group.is_deleted ? null : group._id))) {
      await syncGroupStanding(ctx, groupId);
    }
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
 * Ranks rows: higher counts first, equal counts share a rank and read A-Z, and the next count takes the rank after all of them (1, 1, 3), so a tie never hides how many are ahead.
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

/** The top rows of one board, plus everyone tied with the last of them. */
async function leaderboardStandings(ctx: QueryCtx, metric: StandingMetric) {
  const index = metric === 'factions' ? 'by_factions' : 'by_faq';
  const top = await ctx.db
    .query('profile_standings')
    .withIndex(index, (q) => q.gt(metric, 0))
    .order('desc')
    .take(LEADERBOARD_SIZE);
  const last = top.at(-1);
  if (top.length < LEADERBOARD_SIZE || !last) {
    return top;
  }
  const tied = await ctx.db
    .query('profile_standings')
    .withIndex(index, (q) => q.eq(metric, last[metric]))
    .take(LEADERBOARD_TIE_READ);
  const seen = new Set(top.map((row) => row._id));
  return [...top, ...tied.filter((row) => !seen.has(row._id))];
}

/** One leaderboard: the people with the most of one thing, public profiles only, never anyone at zero. */
export async function loadLeaderboard(ctx: QueryCtx, metric: StandingMetric): Promise<LeaderboardEntry[]> {
  const rows = [];
  for (const standing of await leaderboardStandings(ctx, metric)) {
    const profile = await publicProfileOf(ctx, standing.user_id);
    if (profile) {
      rows.push({
        count: standing[metric],
        slug: profile.slug,
        name: profileListName(profile),
        image: profile.avatar?.url ?? profile.avatar_url,
      });
    }
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

/** The first few public members of a Group, for the faces on its row. */
async function groupMemberPreview(ctx: QueryCtx, groupId: Id<'groups'>) {
  const memberships = await ctx.db
    .query('group_members')
    .withIndex('by_group_status', (q) => q.eq('group_id', groupId).eq('status', 'active'))
    .take(GROUP_MEMBER_PREVIEW * 2);
  const members = [];
  for (const membership of memberships) {
    const profile = await publicProfileOf(ctx, membership.user_id);
    if (profile) {
      members.push({
        slug: profile.slug,
        name: profileListName(profile),
        image: profile.avatar?.url ?? profile.avatar_url,
      });
    }
  }
  return members.slice(0, GROUP_MEMBER_PREVIEW);
}

/** Clamps a requested Groups limit to a whole number of rows between one step and the cap. */
function groupStandingsLimit(requested: number | undefined) {
  const whole = Number.isFinite(requested) ? Math.floor(requested!) : GROUP_STANDINGS_STEP;
  return Math.min(GROUP_STANDINGS_LIMIT, Math.max(GROUP_STANDINGS_STEP, whole));
}

/**
 * The Groups list: live Groups by active members, then by how many factions and rulesets they maintain.
 * Load more asks again with a larger limit, as the directory search does, so the list stays one live answer.
 * A rank is the row's place in that order;
 * Groups with the same counts share one.
 */
export async function loadGroupStandings(ctx: QueryCtx, requestedLimit: number | undefined) {
  const limit = groupStandingsLimit(requestedLimit);
  const standings = await ctx.db
    .query('group_standings')
    .withIndex('by_members_and_maintained')
    .order('desc')
    .take(limit + 1);
  const live = [];
  for (const standing of standings) {
    const group = await ctx.db.get(standing.group_id);
    if (group && !group.is_deleted) {
      live.push({ standing, group });
    }
  }
  const shown = live.slice(0, limit);
  const entries = [];
  for (const { standing, group } of shown) {
    const first = shown.findIndex(
      (other) => other.standing.members === standing.members && other.standing.maintained === standing.maintained
    );
    entries.push({
      rank: first + 1,
      slug: group.slug,
      name: group.name,
      memberCount: standing.members,
      factionCount: standing.factions,
      members: await groupMemberPreview(ctx, group._id),
    });
  }
  return { entries, hasMore: live.length > limit && limit < GROUP_STANDINGS_LIMIT };
}

/**
 * The live Groups one person is an active member of, for the small discs beside their name in the directory, and how many more there are than the discs show, counted as far as one more row of discs.
 */
export async function loadDirectoryGroups(ctx: QueryCtx, userId: Id<'users'>) {
  const memberships = await ctx.db
    .query('group_members')
    .withIndex('by_user_status', (q) => q.eq('user_id', userId).eq('status', 'active'))
    .take(DIRECTORY_GROUP_LIMIT * 2);
  const groups = [];
  for (const membership of memberships) {
    const group = await ctx.db.get(membership.group_id);
    if (group?.is_deleted === false) {
      groups.push({ slug: group.slug, name: group.name });
    }
  }
  return { shown: groups.slice(0, DIRECTORY_GROUP_LIMIT), more: Math.max(0, groups.length - DIRECTORY_GROUP_LIMIT) };
}
