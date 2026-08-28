import { profileUserEditFormSchema } from '@shared/profiles/validation';
import type { ProfileUserEditInput } from '@shared/profiles/validation';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useEffect, useRef } from 'react';

import { db } from '@db/core';
import { factionCatalogueRowsToEntries } from '@db/factions';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';

type ProfileRow = Doc<'profiles'>;
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
export type ProfileListEntry = FunctionReturnType<typeof api.profiles.list>[number];

/** Server-owned profile detail contract; the read model lives in `convex/lib/profileDetail.ts`. */
export type ProfileDetailResult = FunctionReturnType<typeof api.profiles.getBySlug>;

export type ProfilePageData = ReturnType<typeof normalizeProfilePage>;

/** Canonical browser page model, shared by the route loader and the live subscription. */
function normalizeProfilePage(result: ProfileDetailResult) {
  return {
    profile: result.profile,
    groupSummaries: result.groupSummaries,
    faqAsked: result.faqAsked,
    faqAnswers: result.faqAnswers,
    factions: factionCatalogueRowsToEntries(result.factions),
    acceptedAnswerCount: result.faqAnswers.filter((answer) => answer.faq_item.accepted_answer_id === answer._id).length,
  };
}

export async function loadProfileBySlug(slug: string): Promise<ProfilePageData> {
  const result = await db.query(api.profiles.getBySlug, { slug });
  return normalizeProfilePage(result);
}

export async function loadProfilesAll(): Promise<ProfileListEntry[]> {
  const entries = await db.query(api.profiles.list, {});
  return entries;
}

export function useProfileBySlug(
  slug: string,
  options?: {
    initialData?: ProfilePageData;
  }
) {
  const liveData = useQuery(api.profiles.getBySlug, { slug });
  const normalized = liveData ? normalizeProfilePage(liveData) : undefined;
  const result = toLiveQueryResult(normalized, () => options?.initialData);
  return result;
}

export function useProfilesAll(options?: { initialData?: ProfileListEntry[] }) {
  const liveData = useQuery(api.profiles.list, {});
  const result = toLiveQueryResult(liveData, () => options?.initialData ?? undefined);
  return {
    ...result,
  };
}

export function useCurrentProfile() {
  const session = useQuery(api.profiles.session, {});
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
  };
}

export type SessionViewer =
  | { kind: 'pending' }
  | { kind: 'signed-out' }
  | { kind: 'profile'; profile: CurrentProfileEntry };

/**
 * The session tri-state a login gate switches over: the answer is still on its way, the viewer is settled signed-out, or a profile is present.
 * Pending must never render as either settled state; a gate that conflates them shows the wrong page for the length of the resolve.
 * Derived here, the `profileAvatarUrl` precedent, so no page probes profile fields to ask "is there a viewer"; three sites once probed three different fields for the same question.
 */
export function useSessionViewer(): SessionViewer {
  const current = useCurrentProfile();
  switch (current.data) {
    case undefined:
      return { kind: 'pending' };
    case null:
      return { kind: 'signed-out' };
    default:
      return { kind: 'profile', profile: current.data };
  }
}

/** The viewer's Groups, held by the page that offers them rather than by the shell. */
export function useDefaultGroupPreference() {
  const liveData = useQuery(api.profiles.defaultGroupPreference, {});
  return toLiveQueryResult(liveData);
}

export function useUpdateCurrentProfile() {
  const mutate = useLiveMutation<
    { username: string; avatar_url: string; default_group_id?: string | null },
    ProfileUpdateResult
  >(api.profiles.updateCurrent);
  const parseProfileInput = (input: ProfileUserEditInput) => {
    const parsed = profileUserEditFormSchema.safeParse(input);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(' ');
      throw new Error(msg || 'Invalid profile input');
    }
    return parsed.data;
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
        mutate.mutate(
          {
            username: parsed.username,
            avatar_url: parsed.avatar_url,
            ...(parsed.default_group_id === undefined ? {} : { default_group_id: parsed.default_group_id }),
          },
          {
            onSuccess: (result) => {
              options?.onSuccess?.(result.profile, variables, result.default_group_unavailable);
            },
            onError: (error) => options?.onError?.(error, variables),
          }
        );
      } catch (error) {
        options?.onError?.(error instanceof Error ? error : new Error('Invalid profile input'), variables);
      }
    },
    mutateAsync: async (variables: { input: ProfileUserEditInput }) => {
      const parsed = parseProfileInput(variables.input);
      const entry = await mutate.mutateAsync({
        username: parsed.username,
        avatar_url: parsed.avatar_url,
        ...(parsed.default_group_id === undefined ? {} : { default_group_id: parsed.default_group_id }),
      });
      return entry.profile;
    },
  };
}

export type { ProfileUserEditInput };
