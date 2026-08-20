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
export type CurrentProfileEntry = NonNullable<FunctionReturnType<typeof api.profiles.current>>;
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
  const result = toLiveQueryResult(normalized, true, () => options?.initialData);
  return result;
}

export function useProfilesAll(options?: { initialData?: ProfileListEntry[] }) {
  const liveData = useQuery(api.profiles.list, {});
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
  };
}

export function useCurrentProfile() {
  const userId = useQuery(api.profiles.currentUserId, {});
  const liveData = useQuery(api.profiles.current, {});
  const bootstrap = useMutation(api.profiles.bootstrapCurrent);
  const bootstrapAttemptedRef = useRef(false);

  useEffect(() => {
    if (userId === undefined || liveData === undefined) {
      return;
    }
    if (userId === null) {
      bootstrapAttemptedRef.current = false;
      return;
    }
    if (liveData !== null) {
      return;
    }
    if (bootstrapAttemptedRef.current) {
      return;
    }
    bootstrapAttemptedRef.current = true;
    void bootstrap({}).catch(() => {
      bootstrapAttemptedRef.current = false;
    });
  }, [userId, liveData, bootstrap]);

  const current = toLiveQueryResult(liveData, true);

  return {
    ...current,
  };
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
