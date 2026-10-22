import { v } from 'convex/values';

import {
  PROFILE_CATALOGUE_PAGE_SIZE,
  PROFILE_CATALOGUE_QUERY_LIMIT,
  PROFILE_CATALOGUE_SORTS,
} from '../src/shared/profiles/catalogueSearch';
import type { ProfileCatalogueSort } from '../src/shared/profiles/catalogueSearch';
import { profileUserEditFormSchema } from '../src/shared/profiles/validation';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, publicQuery, viewerQuery } from './functions';
import { isActiveProfile, isPublicProfile, optionalActiveUserId } from './lib/accountLifecycle';
import { accountMethods, authMethodValidator } from './lib/accountMethods';
import {
  ALL_PARTITION,
  catalogueSearchLimit,
  catalogueSearchReach,
  countCataloguePartitions,
  selectCataloguePage,
  selectCatalogueSearch,
} from './lib/catalogueOrder';
import {
  assignedGroupSummaryValidator,
  profilePageValidator,
  profileValidator,
} from './lib/collaborativeAccessValidators';
import { canSetDefaultGroup, loadDefaultGroupPreferenceProjection } from './lib/defaultGroupPreference';
import { recordFormerSlug } from './lib/formerSlugs';
import { requireAuthUserId } from './lib/policy';
import { loadProfileActivityCounts } from './lib/profileActivity';
import { scheduleAvatarRehostIfPending } from './lib/profileAvatar';
import { ensureProfileForUser } from './lib/profileBootstrap';
import { profileCatalogueOrderOf, profileListName } from './lib/profileCatalogue';
import { loadProfilePageBySlug } from './lib/profileDetail';
import { discoverableProfileValidator, loadNewestDiscoverableProfiles } from './lib/profileDiscovery';
import { allocateProfileSlug } from './lib/profileSlugs';
import { nowIso, slugify } from './lib/utils';

async function createProfileIfMissing(ctx: MutationCtx, userId: Id<'users'>) {
  const identity = await ctx.auth.getUserIdentity();
  const authUser = await ctx.db.get(userId);
  const identityName =
    typeof identity?.name === 'string' && identity.name.trim().length > 0 ? identity.name.trim() : null;
  const identityPictureUrl =
    typeof (identity as { pictureUrl?: unknown } | null)?.pictureUrl === 'string' &&
    ((identity as { pictureUrl?: string } | null)?.pictureUrl?.length ?? 0) > 0
      ? ((identity as { pictureUrl?: string } | null)?.pictureUrl ?? null)
      : null;
  const authUserName =
    authUser && typeof (authUser as { name?: unknown }).name === 'string'
      ? ((authUser as { name?: string }).name?.trim().length ?? 0) > 0
        ? (authUser as { name: string }).name.trim()
        : null
      : null;
  const authUserImage =
    authUser && typeof (authUser as { image?: unknown }).image === 'string'
      ? ((authUser as { image?: string }).image ?? null)
      : null;

  const displayName = identityName ?? authUserName ?? null;
  const imageUrl = identityPictureUrl ?? (authUserImage && authUserImage.length > 0 ? authUserImage : null);

  return await ensureProfileForUser(ctx, userId, {
    displayName,
    imageUrl,
  });
}

/**
 * The viewer's session in one read: who they are, and their profile row if they have one.
 * One query rather than two because every `_app` page holds this through the shell, and the pair cost two subscriptions to answer one question.
 * The envelope is never null: a signed-out viewer and a signed-in viewer with no profile row yet must stay distinguishable, or the client's bootstrap never fires for a new account.
 */
export const session = viewerQuery({
  args: {},
  returns: v.object({
    userId: v.union(v.id('users'), v.null()),
    isAdmin: v.boolean(),
    profile: v.union(profileValidator, v.null()),
  }),
  handler: async (ctx) => {
    const userId = await optionalActiveUserId(ctx);
    if (!userId) {
      return { userId: null, profile: null, isAdmin: false };
    }
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', userId))
      .unique();
    return {
      userId,
      profile: profile && isActiveProfile(profile) ? profile : null,
      isAdmin: Boolean((await ctx.db.get('users', userId))?.isAdmin),
    };
  },
});

/**
 * The viewer's Groups, for the one Select on the profile edit form that offers them.
 * Its own query because it is a memberships join plus a group read per membership, and it used to ride on `session` to every page in the app.
 * `default_group_id` comes back sanitized against that same list, so a default pointing at a group the viewer left reads as none.
 */
export const defaultGroupPreference = viewerQuery({
  args: {},
  returns: v.object({
    default_group_id: v.union(v.id('groups'), v.null()),
    default_group_options: v.array(assignedGroupSummaryValidator),
  }),
  handler: async (ctx) => {
    const userId = await optionalActiveUserId(ctx);
    const profile = userId
      ? await ctx.db
          .query('profiles')
          .withIndex('by_user_id', (q) => q.eq('user_id', userId))
          .unique()
      : null;
    if (!profile || !isActiveProfile(profile)) {
      return { default_group_id: null, default_group_options: [] };
    }
    return await loadDefaultGroupPreferenceProjection(ctx, profile);
  },
});

/** The signed-in owner's settings, with one page subscription for Groups and sign-in methods. */
export const settings = viewerQuery({
  args: {},
  returns: v.object({
    default_group_id: v.union(v.id('groups'), v.null()),
    default_group_options: v.array(assignedGroupSummaryValidator),
    account: v.union(v.null(), v.object({ methods: v.array(authMethodValidator), merging: v.boolean() })),
  }),
  handler: async (ctx) => {
    const userId = await optionalActiveUserId(ctx);
    const profile = userId
      ? await ctx.db
          .query('profiles')
          .withIndex('by_user_id', (q) => q.eq('user_id', userId))
          .unique()
      : null;
    if (!userId || !profile || !isActiveProfile(profile)) {
      return { default_group_id: null, default_group_options: [], account: null };
    }
    const [preferences, methods, user] = await Promise.all([
      loadDefaultGroupPreferenceProjection(ctx, profile),
      accountMethods(ctx, userId),
      ctx.db.get(userId),
    ]);
    return { ...preferences, account: { methods, merging: !!user?.account_merge_operation_id } };
  },
});

export const bootstrapCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const profile = await createProfileIfMissing(ctx, userId);
    if (!profile || !isActiveProfile(profile)) {
      throw new Error('Failed to bootstrap profile');
    }
    return profile;
  },
});

export const getById = publicQuery({
  args: { id: v.id('profiles') },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.id);
    /* A deleted or merged-away profile is gone from every other page, so it is not served by id either. */
    if (!profile || !isActiveProfile(profile)) {
      throw new Error(`Profile with id ${args.id} not found`);
    }
    return profile;
  },
});

/** A profile page, one cached answer for every viewer. */
export const pageBySlug = publicQuery({
  args: { slug: v.string(), askedPage: v.optional(v.number()), answeredPage: v.optional(v.number()) },
  returns: profilePageValidator,
  handler: async (ctx, args) => await loadProfilePageBySlug(ctx, args.slug, args),
});

/**
 * A person as `ProfileLink` cites them: slug, name and avatar, for pages that name a profile without showing its page.
 * Null when no public profile holds the slug, so a citing page can fall back to plain text instead of failing.
 */
export const linkBySlug = publicQuery({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({ slug: v.string(), username: v.union(v.string(), v.null()), image: v.union(v.string(), v.null()) })
  ),
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique();
    if (!profile || !isPublicProfile(profile)) {
      return null;
    }
    return { slug: profile.slug, username: profile.username, image: profile.avatar?.url ?? profile.avatar_url };
  },
});

const profileListEntryValidator = profileValidator.extend({
  activity: v.object({
    groupCount: v.number(),
    factionCount: v.number(),
    questionCount: v.number(),
    answerCount: v.number(),
  }),
});

/** The directory before `catalogue`; kept one release for bundles that still ask for it. */
export const list = publicQuery({
  args: {},
  returns: v.array(profileListEntryValidator),
  handler: async (ctx) => {
    /* Read through the active range, so deleted and merged rows cannot use up the window and hide live profiles. */
    const profiles = await ctx.db
      .query('profiles')
      .withIndex('by_account_state_username', (q) => q.eq('account_state', 'active'))
      .take(500);
    const activity = await loadProfileActivityCounts(
      ctx,
      profiles.map((profile) => profile.user_id)
    );
    return profiles.map((profile, index) => ({
      ...profile,
      activity: activity[index] ?? {
        groupCount: 0,
        factionCount: 0,
        questionCount: 0,
        answerCount: 0,
      },
    }));
  },
});

const profileDirectoryEntryValidator = v.object({
  id: v.id('profiles'),
  slug: v.string(),
  name: v.string(),
  image: v.union(v.string(), v.null()),
  activity: v.object({
    groupCount: v.number(),
    factionCount: v.number(),
    questionCount: v.number(),
    answerCount: v.number(),
  }),
});

/** The rows of the selected entries, each profile read once with its activity counts. */
async function directoryEntries(ctx: QueryCtx, selected: { source_id: string }[]) {
  const profiles = [];
  for (const entry of selected) {
    const profileId = ctx.db.normalizeId('profiles', entry.source_id);
    const profile = profileId ? await ctx.db.get('profiles', profileId) : null;
    if (!profile || !isPublicProfile(profile)) {
      /* Drift: the page comes up one row short until the backfill or the profile's next save. */
      console.warn(`Catalogue entry for profile ${entry.source_id} has no public profile.`);
      continue;
    }
    profiles.push(profile);
  }
  const activity = await loadProfileActivityCounts(
    ctx,
    profiles.map((profile) => profile.user_id)
  );
  return profiles.map((profile, index) => ({
    id: profile._id,
    slug: profile.slug,
    name: profileListName(profile),
    image: profile.avatar?.url ?? profile.avatar_url,
    activity: activity[index] ?? { groupCount: 0, factionCount: 0, questionCount: 0, answerCount: 0 },
  }));
}

/** A browsed page: aggregate counts, numbered pages, a chosen order. */
const catalogueBrowseValidator = v.object({
  entries: v.array(profileDirectoryEntryValidator),
  /** Listed profiles, across every page. */
  total: v.number(),
  /** Listed profiles, before any search. */
  directoryTotal: v.number(),
  /** Always true now that a search is never paged; kept so the browse shape stays the one the page reads. */
  complete: v.boolean(),
  /** The page these rows are, which may lie past `pageCount`, with no rows. */
  page: v.number(),
  pageCount: v.number(),
  pageSize: v.number(),
});

/** A searched directory: the best matches first, no count and no pages, and more by asking for a larger limit. */
const catalogueSearchValidator = v.object({
  mode: v.literal('search'),
  entries: v.array(profileDirectoryEntryValidator),
  /** Whether a larger limit would show more profiles. */
  hasMore: v.boolean(),
  /** Whether more profiles may match than one search shows, so the reader should add a word rather than load more. */
  capped: v.boolean(),
  /** The limit these rows answer, after clamping. */
  limit: v.number(),
  /** Listed profiles, before any search. */
  directoryTotal: v.number(),
});

type CatalogueArgs = { q?: string; sort?: ProfileCatalogueSort; page?: number; limit?: number };

async function loadDirectoryPage(ctx: QueryCtx, args: CatalogueArgs) {
  const page = Number.isSafeInteger(args.page) && args.page! > 1 ? args.page! : 1;
  const selection = await selectCataloguePage(ctx, {
    kind: 'profile',
    partition: ALL_PARTITION,
    ...profileCatalogueOrderOf(args.sort),
    page,
    pageSize: PROFILE_CATALOGUE_PAGE_SIZE,
  });
  return {
    entries: await directoryEntries(ctx, selection.entries),
    total: selection.total,
    directoryTotal: selection.total,
    complete: selection.exact,
    page,
    pageCount: Math.max(1, Math.ceil(selection.total / PROFILE_CATALOGUE_PAGE_SIZE)),
    pageSize: PROFILE_CATALOGUE_PAGE_SIZE,
  };
}

async function loadDirectorySearch(ctx: QueryCtx, args: CatalogueArgs, text: string) {
  const limit = catalogueSearchLimit(args.limit, PROFILE_CATALOGUE_PAGE_SIZE);
  const [selection, [directoryTotal = 0]] = await Promise.all([
    selectCatalogueSearch(ctx, { kind: 'profile', partition: ALL_PARTITION, text, limit }),
    countCataloguePartitions(ctx, 'profile', [ALL_PARTITION], 'name'),
  ]);
  return {
    mode: 'search' as const,
    entries: await directoryEntries(ctx, selection.entries),
    ...catalogueSearchReach(selection, limit, PROFILE_CATALOGUE_PAGE_SIZE),
    limit,
    directoryTotal,
  };
}

/**
 * The profile directory: the aggregate counts it and finds a page's first profile;
 * a search uses Convex's search index over username and slug.
 * Only the page's own profiles and their activity counts are read, so a page costs the same however many profiles there are.
 * A search is the load-more search, best matches first up to `limit`;
 * without one the directory is browsed, in pages.
 * Replaces `list`, which stays for one release so a bundle still asking for it keeps working while this one deploys.
 */
export const catalogue = publicQuery({
  args: {
    q: v.optional(v.string()),
    sort: v.optional(v.union(...PROFILE_CATALOGUE_SORTS.map((sort) => v.literal(sort)))),
    page: v.optional(v.number()),
    /** How many of the best matches to return; Load more asks again with a larger one. */
    limit: v.optional(v.number()),
  },
  returns: v.union(catalogueBrowseValidator, catalogueSearchValidator),
  handler: async (ctx, args) => {
    const text = args.q?.slice(0, PROFILE_CATALOGUE_QUERY_LIMIT).trim() ?? '';
    return text ? await loadDirectorySearch(ctx, args, text) : await loadDirectoryPage(ctx, args);
  },
});

export const newestDiscoverable = publicQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(discoverableProfileValidator),
  handler: async (ctx, args) => await loadNewestDiscoverableProfiles(ctx, args.limit ?? 4),
});

export const updateCurrent = mutation({
  args: {
    username: v.string(),
    avatar_url: v.union(v.string(), v.null()),
    default_group_id: v.optional(v.union(v.id('groups'), v.null())),
    bgg_profile_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const profile = await createProfileIfMissing(ctx, userId);
    if (!profile) {
      throw new Error('Profile not found');
    }

    const parsed = profileUserEditFormSchema.safeParse({
      username: args.username,
      avatar_url: args.avatar_url ?? '',
      default_group_id: args.default_group_id,
      bgg_profile_url: args.bgg_profile_url,
    });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(' ');
      throw new Error(msg || 'Invalid profile input');
    }
    const normalizedUsername = parsed.data.username;
    const normalizedAvatarUrl = parsed.data.avatar_url;
    /*
     * The echo guard: the edit form round-trips `avatar_url`, which after a rehost is our own delivery URL.
     * A submission equal to the stored avatar's delivery URL, or to the current `avatar_url`, is not a new source and must not mint a token or disturb the stored avatar.
     * A genuinely new external URL clears `avatar` so the page renders the submitted URL until the rehost callback flips it.
     */
    const avatarChanged = normalizedAvatarUrl !== profile.avatar?.url && normalizedAvatarUrl !== profile.avatar_url;
    const requestedDefaultGroupId = args.default_group_id;
    const defaultGroupId =
      requestedDefaultGroupId === undefined
        ? undefined
        : requestedDefaultGroupId && (await canSetDefaultGroup(ctx, userId, requestedDefaultGroupId))
          ? requestedDefaultGroupId
          : null;

    const nextSlugBase = slugify(normalizedUsername);
    if (nextSlugBase.length === 0) {
      throw new Error('Failed to generate slug from display name');
    }
    const nextSlug = await allocateProfileSlug(ctx, nextSlugBase, profile);
    if (nextSlug !== profile.slug) {
      await recordFormerSlug(ctx, { kind: 'profile', scope: '', slug: profile.slug, record_id: profile._id });
    }

    await ctx.db.patch(profile._id, {
      username: normalizedUsername,
      ...(avatarChanged ? { avatar_url: normalizedAvatarUrl, avatar: null } : {}),
      ...(defaultGroupId === undefined ? {} : { default_group_id: defaultGroupId }),
      ...(args.bgg_profile_url === undefined ? {} : { bgg_profile_url: parsed.data.bgg_profile_url || undefined }),
      slug: nextSlug,
      updated_at: nowIso(),
    });

    const updated = await ctx.db.get(profile._id);
    if (!updated) {
      throw new Error('Failed to update profile');
    }
    if (avatarChanged) {
      await scheduleAvatarRehostIfPending(ctx, updated);
    }
    return {
      profile: updated,
      default_group_unavailable:
        requestedDefaultGroupId !== undefined && requestedDefaultGroupId !== null && defaultGroupId === null,
    };
  },
});
