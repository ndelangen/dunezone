import { useQuery } from 'convex/react';

import { db } from '@db/core';
import { toLiveQueryResult } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

export function useHostedFixture() {
  return toLiveQueryResult(useQuery(api.playAdmission.getFixture, {}));
}

/** Tickets stay in memory and are sent only in the first game socket message. */
export async function requestPlayTicket(gameId: string) {
  return await db.mutation(api.playAdmission.issueTicket, { gameId });
}
