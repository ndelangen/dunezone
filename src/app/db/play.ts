import type { playCreateGameRequestSchema } from '@shared/play/admission';
import type { playCreateGameOutcomeSchema } from '@shared/play/seatLimit';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import type { z } from 'zod';

import { db } from '@db/core';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

export type CreatableRuleset = Extract<
  FunctionReturnType<typeof api.playGames.creatable>,
  { access: 'allowed' }
>['rulesets'][number];

/** What a game page learns before it opens a socket: whether the viewer may enter and whether the table is ready. */
export function useGameAccess(gameId: string) {
  return toLiveQueryResult(useQuery(api.playGames.getGame, { gameId }));
}

/** The lobby's ongoing and past games, as the directory may show them to this viewer. */
export function useLobbyGames() {
  return toLiveQueryResult(useQuery(api.playDirectory.listGames, {}));
}

/** The rulesets a signed-in player may start a game with, or that the viewer must sign in first. */
export function useCreatableRulesets() {
  return toLiveQueryResult(useQuery(api.playGames.creatable, {}));
}

export function useCreateGame() {
  return useLiveMutation<z.infer<typeof playCreateGameRequestSchema>, z.infer<typeof playCreateGameOutcomeSchema>>(
    api.playGames.createGame
  );
}

/** Tickets stay in memory and are sent only in the first game socket message. */
export async function requestPlayTicket(gameId: string) {
  return await db.mutation(api.playAdmission.issueTicket, { gameId });
}
