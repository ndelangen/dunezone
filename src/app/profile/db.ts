import { useMutation, useQuery } from 'convex/react';
import { useEffect, useRef } from 'react';

import { db } from '@db/core';
import {
  type FactionCatalogueEntry,
  type FactionCatalogueRow,
  factionCatalogueRowsToEntries,
} from '@db/factions';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';
import { type ProfileUserEditInput, profileUserEditFormSchema } from '@app/profile/validation';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';

export type ProfileRow = Doc<'profiles'>;
export type ProfileEntry = ProfileRow;
export type ProfileListEntry = ProfileRow & {
  activity: {
    groupCount: number;
    factionCount: number;
    questionCount: number;
    answerCount: number;
  };
};

export type ProfilePageData = {
  profile: ProfileEntry;
  memberships: Doc<'group_members'>[];
  groups: Doc<'groups'>[];
  faqAsked: import('../faq/db').FaqItemAskedByWithRuleset[];
  faqAnswers: import('../faq/db').FaqAnswerWithParent[];
  factions: FactionCatalogueEntry[];
};

export async function loadProfileBySlug(slug: string): Promise<ProfilePageData> {
  const result = await db.query<{
    profile: ProfileRow;
    memberships: Doc<'group_members'>[];
    groups: Doc<'groups'>[];
    faqAsked: import('../faq/db').FaqItemAskedByWithRuleset[];
    faqAnswers: import('../faq/db').FaqAnswerWithParent[];
    factions: FactionCatalogueRow[];
  }>(api.profiles.getBySlug, { slug });

  return {
    ...result,
    factions: factionCatalogueRowsToEntries(result.factions),
  };
}

export async function loadProfilesAll(): Promise<ProfileListEntry[]> {
  const entries = await db.query<ProfileListEntry[]>(api.profiles.list, {});
  return entries;
}

export async function loadCurrentUserId(): Promise<string | null> {
  return await db.query<string | null>(api.profiles.currentUserId, {});
}

export async function loadCurrentProfile(): Promise<ProfileEntry | null> {
  const currentRaw = await db.query<ProfileRow | null>(api.profiles.current, {});
  const current = currentRaw ? currentRaw : null;
  if (current) {
    const needsBackfill = current.slug === 'user' || !current.username || !current.avatar_url;
    if (needsBackfill) {
      const entry = await db.mutation<ProfileRow>(api.profiles.bootstrapCurrent, {});
      return entry;
    }
    return current;
  }

  const userId = await loadCurrentUserId();
  if (!userId) {
    return null;
  }

  const entry = await db.mutation<ProfileRow>(api.profiles.bootstrapCurrent, {});
  return entry;
}

export function useProfile(id: string) {
  const liveData = useQuery(api.profiles.getById, { id } as never) as ProfileRow | null | undefined;
  const result = toLiveQueryResult(liveData, true);
  return {
    ...result,
    data: result.data ?? undefined,
  };
}

export function useProfileBySlug(
  slug: string,
  options?: {
    initialData?: ProfilePageData;
  }
) {
  const liveData = useQuery(api.profiles.getBySlug, { slug });
  const normalized: ProfilePageData | undefined = liveData
    ? {
        ...liveData,
        factions: factionCatalogueRowsToEntries(liveData.factions),
      }
    : undefined;
  const result = toLiveQueryResult(normalized, true, () => options?.initialData);
  return {
    ...result,
    profile: result.data ? result.data.profile : undefined,
    memberships: result.data?.memberships,
    groups: result.data?.groups,
    faqAsked: result.data?.faqAsked,
    faqAnswers: result.data?.faqAnswers,
    factions: result.data?.factions,
  };
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
    if (userId === undefined || liveData === undefined) return;
    if (userId === null) {
      bootstrapAttemptedRef.current = false;
      return;
    }
    if (liveData !== null) return;
    if (bootstrapAttemptedRef.current) return;
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
  const mutate = useLiveMutation<{ username: string; avatar_url: string }, ProfileRow>(
    api.profiles.updateCurrent
  );
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
        onSuccess?: (entry: ProfileEntry, vars: { input: ProfileUserEditInput }) => void;
        onError?: (error: Error, vars: { input: ProfileUserEditInput }) => void;
      }
    ) => {
      try {
        const parsed = parseProfileInput(variables.input);
        mutate.mutate(
          {
            username: parsed.username,
            avatar_url: parsed.avatar_url,
          },
          {
            onSuccess: (entry) => {
              options?.onSuccess?.(entry, variables);
            },
            onError: (error) => options?.onError?.(error, variables),
          }
        );
      } catch (error) {
        options?.onError?.(
          error instanceof Error ? error : new Error('Invalid profile input'),
          variables
        );
      }
    },
    mutateAsync: async (variables: { input: ProfileUserEditInput }) => {
      const parsed = parseProfileInput(variables.input);
      const entry = await mutate.mutateAsync({
        username: parsed.username,
        avatar_url: parsed.avatar_url,
      });
      return entry;
    },
  };
}

export type { ProfileUserEditInput };
