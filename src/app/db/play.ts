import type { playCreateGameRequestSchema, playCreateGameResultSchema } from '@shared/play/admission';
import { useQuery } from 'convex/react';
import type { z } from 'zod';

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

/** The lobby's ongoing and past games, as the directory may show them to this viewer. */
export function useLobbyGames() {
  return toLiveQueryResult(useQuery(api.playDirectory.listGames, {}));
}

/** Whether the viewer may create a game, for a page that only decides whether to offer the link. */
export function useCreateAccess() {
  return toLiveQueryResult(useQuery(api.playGames.access, {}));
}

/** The rulesets an Administrator may start a game with, or why the viewer may not create one. */
export function useCreatableRulesets() {
  return toLiveQueryResult(useQuery(api.playGames.creatable, {}));
}

export function useCreateGame() {
  return useLiveMutation<z.infer<typeof playCreateGameRequestSchema>, z.infer<typeof playCreateGameResultSchema>>(
    api.playGames.createGame
  );
}

/** Tickets stay in memory and are sent only in the first game socket message. */
export async function requestPlayTicket(gameId: string) {
  return await db.mutation(api.playAdmission.issueTicket, { gameId });
}
