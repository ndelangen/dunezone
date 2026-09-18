import { useQuery } from 'convex/react';

import { db } from '@db/core';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

export function useHostedFixture() {
  return toLiveQueryResult(useQuery(api.playAdmission.getFixture, {}));
}

/** What a game page learns before it opens a socket: whether the viewer may enter and whether the table is ready. */
export function useGameAccess(gameId: string) {
  return toLiveQueryResult(useQuery(api.playGames.getGame, { gameId }));
}

/** The rulesets an Administrator may start a game with, or why the viewer may not create one. */
export function useCreatableRulesets() {
  return toLiveQueryResult(useQuery(api.playGames.creatable, {}));
}

export function useCreateGame() {
  return useLiveMutation<
    { rulesetId: string; minimumPlayers: number },
    { ok: true; gameId: string } | { ok: false; reason: 'not_authorized' | 'unavailable' }
  >(api.playGames.createGame);
}

/** Tickets stay in memory and are sent only in the first game socket message. */
export async function requestPlayTicket(gameId: string) {
  return await db.mutation(api.playAdmission.issueTicket, { gameId });
}
