import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { db } from '@db/core';
import { toLiveQueryResult } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

export type HomepageData = FunctionReturnType<typeof api.homepage.get>;

export async function loadHomepage(): Promise<HomepageData> {
  return await db.query(api.homepage.get, {});
}

export function useHomepage(options?: { initialData?: HomepageData }) {
  const liveData = useQuery(api.homepage.get, {});
  return toLiveQueryResult(liveData, true, () => options?.initialData);
}
