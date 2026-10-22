import type { ProfileFaqPages } from '@shared/profiles/faqActivity';
import type { ProfileUserEditInput } from '@shared/profiles/validation';
import { profileUserEditFormSchema } from '@shared/profiles/validation';
import { useMutation } from 'convex/react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { useEffect, useRef } from 'react';

import { db } from '@db/core';
import { factionCatalogueRowsToEntries } from '@db/factions';
import { toLiveQueryResult, useLiveMutation, useLiveQuery } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';

type ProfileRow = Doc<'profiles'>;
/** A profile row. The alias exists so call sites read `ProfileEntry` like every other entry in this layer; nothing is parsed or added. */
export type ProfileEntry = ProfileRow;

/**
 * The one URL a page renders for an avatar: the stored rendition when it exists, the external URL until its rehost callback lands.
 * Derived here so the legacy fallback lives in one place and the retirement release deletes it here alone.
 */
export function profileAvatarUrl(profile: Pick<ProfileRow, 'avatar' | 'avatar_url'>): string | null {
  return profile.avatar?.url ?? profile.avatar_url;
}
export type CurrentProfileEntry = NonNullable<FunctionReturnType<typeof api.profiles.session>['profile']>;
export type ProfileUpdateResult = FunctionReturnType<typeof api.profiles.updateCurrent>;
export type ProfileDirectoryPageData = FunctionReturnType<typeof api.profiles.catalogue>;
export type ProfileDirectoryEntry = ProfileDirectoryPageData['entries'][number];
/** What one `/profiles` page asks for: the route's search parameters, as `profiles.catalogue` takes them. */
export type ProfileDirectoryArgs = FunctionArgs<typeof api.profiles.catalogue>;

/** Server-owned profile page contract, the same for every viewer; the read model lives in `convex/lib/profileDetail.ts`. */
export type ProfileDetailResult = FunctionReturnType<typeof api.profiles.pageBySlug>;

/** The profile page's model: the server's detail result with its FAQ activity, factions and Groups normalized for rendering. */
export type ProfilePageData = ReturnType<typeof normalizeProfilePage>;

/** Canonical browser page model, shared by the route loader and the live subscription. */
function normalizeProfilePage(result: ProfileDetailResult) {
  return {
    profile: result.profile,
    groupSummaries: result.groupSummaries,
    faqAsked: result.faqAsked,
    faqAnswers: result.faqAnswers,
    faqLists: result.faqLists,
    factions: factionCatalogueRowsToEntries(result.factionPreview),
    factionCount: result.factionCount,
    acceptedAnswerCount: result.faqAnswers.filter((answer) => answer.faq_item.accepted_answer_id === answer._id).length,
  };
}

/** The profile page's loader, paired with `useProfileBySlug`. */
export async function loadProfileBySlug(slug: string, pages: ProfileFaqPages = {}): Promise<ProfilePageData> {
  const result = await db.query(api.profiles.pageBySlug, { slug, ...pages });
  return normalizeProfilePage(result);
}

/** A profile as `ProfileLink` cites it, or null when no public profile holds the slug. */
export type ProfileLinkEntry = FunctionReturnType<typeof api.profiles.linkBySlug>;

/**
 * One profile's link fields, live, for a page that cites a person without loading their page.
 * It is a hook rather than a loader so a record-less page (the blog) keeps rendering on the server without a query.
 */
export function useProfileLink(slug: string): ProfileLinkEntry | undefined {
  return useLiveQuery(api.profiles.linkBySlug, { slug });
}

/** The directory route's loader, paired with `useProfileDirectoryPage`; a searched page is not held, for the same reason. */
export async function loadProfileDirectoryPage(args: ProfileDirectoryArgs): Promise<ProfileDirectoryPageData> {
  return await db.query(api.profiles.catalogue, args, { hold: !args.q });
}

/** One profile's page, live, taking `loadProfileBySlug`'s result as `initialData`. */
export function useProfileBySlug(
  slug: string,
  options?: {
    initialData?: ProfilePageData;
    pages?: ProfileFaqPages;
  }
) {
  const liveData = useLiveQuery(api.profiles.pageBySlug, { slug, ...options?.pages });
  const normalized = liveData ? normalizeProfilePage(liveData) : undefined;
  const result = toLiveQueryResult(normalized, () => options?.initialData);
  return result;
}

/**
 * One live directory page, taking `loadProfileDirectoryPage`'s result for the same arguments as `initialData`.
 * A searched page is not held warm after it is left: every committed search is its own subscription, and holding each would keep re-running them on every profile write.
 */
export function useProfileDirectoryPage(
  args: ProfileDirectoryArgs,
  options?: { initialData?: ProfileDirectoryPageData }
) {
  const liveData = useLiveQuery(api.profiles.catalogue, args, { hold: !args.q });
  return toLiveQueryResult(liveData, () => options?.initialData);
}

/**
 * The signed-in viewer's profile, live.
 * It also writes: a signed-in user with no profile row gets one bootstrapped, once per session, so a caller never has to create it.
 * `data` is `undefined` while the answer is on its way and `null` for a settled signed-out viewer, and those are different states;
 * reach for `useSessionViewer` rather than testing them by hand.
 */
export function useCurrentProfile() {
  const session = useLiveQuery(api.profiles.session, {});
  const bootstrap = useMutation(api.profiles.bootstrapCurrent);
  const bootstrapAttemptedRef = useRef(false);

  useEffect(() => {
    if (session === undefined) {
      return;
    }
    if (session.userId === null) {
      bootstrapAttemptedRef.current = false;
      return;
    }
    if (session.profile !== null) {
      return;
    }
    if (bootstrapAttemptedRef.current) {
      return;
    }
    bootstrapAttemptedRef.current = true;
    void bootstrap({}).catch(() => {
      bootstrapAttemptedRef.current = false;
    });
  }, [session, bootstrap]);

  /* Unresolved and signed-out are different states and must stay so: `session.profile` is null for
     a signed-out viewer. `toLiveQueryResult` preserves that null rather than collapsing it, and
     `useSessionViewer` below is where the two states become distinct render paths. */
  const current = toLiveQueryResult(session === undefined ? undefined : session.profile);

  return {
    ...current,
    isAdmin: session?.isAdmin ?? false,
  };
}

export type SessionViewer =
  | { kind: 'pending' }
  | { kind: 'signed-out' }
  | { kind: 'profile'; profile: CurrentProfileEntry; isAdmin: boolean };

/**
 * The session tri-state a login gate switches over: the answer is still on its way, the viewer is settled signed-out, or a profile is present.
 * Pending must never render as either settled state;
 * a gate that conflates them shows the wrong page for the length of the resolve.
 * Derived here, the `profileAvatarUrl` precedent, so no page probes profile fields to ask "is there a viewer";
 * three sites once probed three different fields for the same question.
 */
export function useSessionViewer(): SessionViewer {
  const current = useCurrentProfile();
  switch (current.data) {
    case undefined:
      return { kind: 'pending' };
    case null:
      return { kind: 'signed-out' };
    default:
      return { kind: 'profile', profile: current.data, isAdmin: current.isAdmin };
  }
}

export type ProfileSettingsData = FunctionReturnType<typeof api.profiles.settings>;

/** Settings data stays with the edit page rather than the shell or public profile. */
export function useProfileSettings() {
  const liveData = useLiveQuery(api.profiles.settings, {});
  return toLiveQueryResult(liveData);
}

/** Saves the viewer's own profile details and the default Group used when creating things. */
export function useUpdateCurrentProfile() {
  const mutate = useLiveMutation<ProfileUserEditInput, ProfileUpdateResult>(api.profiles.updateCurrent);
  const parseProfileInput = (input: ProfileUserEditInput) => {
    const parsed = profileUserEditFormSchema.safeParse(input);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(' ');
      throw new Error(msg || 'Invalid profile input');
    }
    return {
      username: parsed.data.username,
      avatar_url: parsed.data.avatar_url,
      ...(parsed.data.default_group_id === undefined ? {} : { default_group_id: parsed.data.default_group_id }),
      ...(parsed.data.bgg_profile_url === undefined ? {} : { bgg_profile_url: parsed.data.bgg_profile_url }),
    };
  };

  return {
    ...mutate,
    mutate: (
      variables: { input: ProfileUserEditInput },
      options?: {
        onSuccess?: (
          entry: ProfileEntry,
          vars: { input: ProfileUserEditInput },
          defaultGroupUnavailable: boolean
        ) => void;
        onError?: (error: Error, vars: { input: ProfileUserEditInput }) => void;
      }
    ) => {
      try {
        const parsed = parseProfileInput(variables.input);
        mutate.mutate(parsed, {
          onSuccess: (result) => {
            options?.onSuccess?.(result.profile, variables, result.default_group_unavailable);
          },
          onError: (error) => options?.onError?.(error, variables),
        });
      } catch (error) {
        options?.onError?.(error instanceof Error ? error : new Error('Invalid profile input'), variables);
      }
    },
    mutateAsync: async (variables: { input: ProfileUserEditInput }) => {
      const parsed = parseProfileInput(variables.input);
      const entry = await mutate.mutateAsync(parsed);
      return entry.profile;
    },
  };
}

export type { ProfileUserEditInput };
