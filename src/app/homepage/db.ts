import { useQuery } from 'convex/react';

import { db } from '@db/core';
import type { FactionCatalogueSpotlightData } from '@db/factions';
import { toLiveQueryResult } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';

export type HomepageData = {
  spotlights: {
    newArrival: HomepageFactionSpotlight | null;
    freshlyUpdated: HomepageFactionSpotlight | null;
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
      username: string;
      avatarUrl: string;
      createdAt: string;
    }>;
  };
};

type HomepageFactionSpotlight = FactionCatalogueSpotlightData & {
  created_at: string;
  updated_at: string;
};

export async function loadHomepage(): Promise<HomepageData> {
  return await db.query<HomepageData>(api.homepage.page, {});
}

export function useHomepage(options?: { initialData?: HomepageData }) {
  const liveData = useQuery(api.homepage.page, {});
  return toLiveQueryResult(liveData, true, () => options?.initialData);
}
