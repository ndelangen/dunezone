import { profileUserEditFormSchema } from '../../src/shared/profiles/validation';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { accountStateOf } from './accountLifecycle';
import { accountMethods, requireUnlockedAccount } from './accountMethods';
import type { AuthProvider } from './accountMethods';
import { recordFormerSlug } from './formerSlugs';
import { scheduleAvatarRehostIfPending } from './profileAvatar';
import { allocateProfileSlug } from './profileSlugs';
import { nowIso, slugify } from './utils';

/** What a sign-in provider reported about its account: either may be missing. */
export type ProviderDetails = { name?: string | null; image?: string | null };

/**
 * What one connected sign-in method can offer a profile.
 * `name` is what the provider calls the account;
 * `displayName` is that name made to fit a display name's rules, or `null` when it cannot.
 * `syncedAt` is when the provider last reported it, or `null` when nothing was recorded for it yet.
 */
export type LinkedAccountOption = {
  provider: AuthProvider;
  name: string | null;
  displayName: string | null;
  image: string | null;
  syncedAt: number | null;
};

const displayNameSchema = profileUserEditFormSchema.shape.username;

/**
 * A provider's account name as a display name: letters and digits only, five to thirty of them, not shouted.
 * "Norbert de Langen" becomes "NorbertdeLangen";
 * "ALLCAPS" becomes "Allcaps";
 * "Bo" becomes nothing, so the name is left alone.
 */
export function displayNameFrom(name: string | null | undefined): string | null {
  if (!name) {
    return null;
  }
  let candidate = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .slice(0, 30);
  if (/[A-Z]/.test(candidate) && candidate === candidate.toUpperCase()) {
    candidate = candidate[0] + candidate.slice(1).toLowerCase();
  }
  return displayNameSchema.safeParse(candidate).success ? candidate : null;
}

function cleanName(name: string | null | undefined): string | null {
  const trimmed = typeof name === 'string' ? name.trim().slice(0, 64) : '';
  return trimmed || null;
}

function cleanImage(image: string | null | undefined): string | null {
  return typeof image === 'string' && image.startsWith('https://') ? image : null;
}

/** Keeps what a provider reported at a sign-in, replacing what it reported before. The record is the provider's, not the profile's: a later resync reads it. */
export async function recordLinkedAccountProfile(
  ctx: MutationCtx,
  userId: Id<'users'>,
  provider: AuthProvider,
  details: ProviderDetails
): Promise<void> {
  const row = {
    user_id: userId,
    provider,
    name: cleanName(details.name),
    image: cleanImage(details.image),
    synced_at: Date.now(),
  };
  const existing = await ctx.db
    .query('linked_account_profiles')
    .withIndex('by_user_id_and_provider', (q) => q.eq('user_id', userId).eq('provider', provider))
    .unique();
  await (existing ? ctx.db.replace(existing._id, row) : ctx.db.insert('linked_account_profiles', row));
}

/**
 * What each connected sign-in method can offer, in the order the methods are listed.
 * A method that signed in before these records were kept has no record;
 * when it is the account's only method, what the account itself holds is that method's report.
 */
export async function linkedAccountOptions(ctx: QueryCtx, userId: Id<'users'>): Promise<LinkedAccountOption[]> {
  const connected = (await accountMethods(ctx, userId)).filter((method) => method.connected);
  const user = connected.length === 1 ? await ctx.db.get(userId) : null;
  return await Promise.all(
    connected.map(async ({ provider }) => {
      const record = await ctx.db
        .query('linked_account_profiles')
        .withIndex('by_user_id_and_provider', (q) => q.eq('user_id', userId).eq('provider', provider))
        .unique();
      const name = record ? record.name : cleanName(user?.name);
      const image = record ? record.image : cleanImage(user?.image);
      return {
        provider,
        name,
        displayName: displayNameFrom(name),
        image,
        syncedAt: record?.synced_at ?? null,
      };
    })
  );
}

/** Whether an option carries anything a profile could take. */
export function offersSomething(option: LinkedAccountOption): boolean {
  return option.displayName !== null || option.image !== null;
}

export type AppliedLinkedAccount = {
  profile: Doc<'profiles'>;
  /** Which of the two the profile took; a name the rules refuse, or a picture it already shows, is not taken. */
  name: boolean;
  avatar: boolean;
};

/** The reader's active profile, once no merge is rewriting the account: a resync landing mid-merge would undo what the merge confirmed. */
async function activeProfileOf(ctx: MutationCtx, userId: Id<'users'>): Promise<Doc<'profiles'>> {
  await requireUnlockedAccount(ctx, userId, false);
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', userId))
    .unique();
  if (!profile || accountStateOf(profile) !== 'active') {
    throw new Error('Profile not found');
  }
  return profile;
}

/** The offer of one connected method, or why there is none. */
async function offerOf(ctx: MutationCtx, userId: Id<'users'>, provider: AuthProvider): Promise<LinkedAccountOption> {
  const option = (await linkedAccountOptions(ctx, userId)).find((candidate) => candidate.provider === provider);
  if (!option) {
    throw new Error('This sign-in method is not connected.');
  }
  if (!offersSomething(option)) {
    throw new Error(
      'This sign-in method has not reported a name or picture yet. Sign in with it once, then try again.'
    );
  }
  return option;
}

/** The name the profile would take from an option: none when the rules refuse it or the profile has it already. */
function nameToTake(option: LinkedAccountOption, profile: Doc<'profiles'>): string | null {
  const { displayName } = option;
  return displayName !== null && displayName !== profile.username ? displayName : null;
}

/** The picture the profile would take from an option: none when the profile already shows it in some form. */
function pictureToTake(option: LinkedAccountOption, profile: Doc<'profiles'>): string | null {
  const shown = [profile.avatar?.url, profile.avatar?.source_url, profile.avatar_url];
  return option.image !== null && !shown.includes(option.image) ? option.image : null;
}

/** The address a renamed profile takes; the old one keeps redirecting when it changes. */
async function slugAfterRename(ctx: MutationCtx, profile: Doc<'profiles'>, username: string): Promise<string> {
  const slug = await allocateProfileSlug(ctx, slugify(username), profile);
  if (slug !== profile.slug) {
    await recordFormerSlug(ctx, {
      kind: 'profile',
      scope: '',
      slug: profile.slug,
      record_id: profile._id,
    });
  }
  return slug;
}

/**
 * Gives the profile the name and picture one connected method reports.
 * The name follows the same rename path as the settings form, so the old address keeps redirecting;
 * the picture goes through the rehost pipeline unless the profile already shows it.
 */
export async function applyLinkedAccountProfile(
  ctx: MutationCtx,
  userId: Id<'users'>,
  provider: AuthProvider
): Promise<AppliedLinkedAccount> {
  const profile = await activeProfileOf(ctx, userId);
  const option = await offerOf(ctx, userId, provider);
  const username = nameToTake(option, profile);
  const image = pictureToTake(option, profile);
  if (username === null && image === null) {
    return { profile, name: false, avatar: false };
  }
  await ctx.db.patch(profile._id, {
    ...(username !== null ? { username, slug: await slugAfterRename(ctx, profile, username) } : {}),
    ...(image !== null ? { avatar_url: image, avatar: null } : {}),
    updated_at: nowIso(),
  });
  const updated = (await ctx.db.get(profile._id))!;
  if (image !== null) {
    await scheduleAvatarRehostIfPending(ctx, updated);
  }
  return { profile: updated, name: username !== null, avatar: image !== null };
}
