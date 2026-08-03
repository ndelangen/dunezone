import { useQuery } from 'convex/react';

import { db } from '@db/core';
import type { FactionCatalogueEntry, FactionCatalogueRow } from '@db/factions';
import { toLiveQueryResult } from '@app/db/core/live';
import { CanonicalFactionStoredSchema } from '@game/schema/faction';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';

export type HomepageData = {
  spotlights: {
    newArrival: FactionCatalogueEntry | null;
    freshlyUpdated: FactionCatalogueEntry | null;
  };
  community: {
    counts: {
      factions: number;
      rulesets: number;
      members: number;
      questions: number;
      answers: number;
    } | null;
    newestMembers: Array<{
      id: Doc<'profiles'>['_id'];
      slug: string;
      username: string | null;
      avatarUrl: string;
    }>;
  };
};

type HomepageRawData = Omit<HomepageData, 'spotlights'> & {
  spotlights: {
    newArrival: FactionCatalogueRow | null;
    freshlyUpdated: FactionCatalogueRow | null;
  };
};

function normalizeHomepageData(raw: HomepageRawData): HomepageData {
  const normalizeSpotlight = (entry: FactionCatalogueRow | null) =>
    entry
      ? {
          ...entry,
          data: CanonicalFactionStoredSchema.parse(entry.data),
        }
      : null;

  return {
    ...raw,
    spotlights: {
      newArrival: normalizeSpotlight(raw.spotlights.newArrival),
      freshlyUpdated: normalizeSpotlight(raw.spotlights.freshlyUpdated),
    },
  };
}

export async function loadHomepage(): Promise<HomepageData> {
  const raw = await db.query<HomepageRawData>(api.homepage.page, {});
  return normalizeHomepageData(raw);
}

export function useHomepage(options?: { initialData?: HomepageData }) {
  const liveData = useQuery(api.homepage.page, {});
  const normalized = liveData ? normalizeHomepageData(liveData) : undefined;
  return toLiveQueryResult(normalized, true, () => options?.initialData);
}
