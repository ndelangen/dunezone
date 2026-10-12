import type { playCreateGameRequestSchema } from '@shared/play/admission';
import type { playGeneratedGameRequestSchema } from '@shared/play/gameCreation';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useCallback } from 'react';
import type { z } from 'zod';

import { db } from '@db/core';
import { toLiveQueryResult, useLiveOperation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

export type CreatableRuleset = Extract<
  FunctionReturnType<typeof api.playGames.creatable>,
  { access: 'allowed' }
>['rulesets'][number];

/** What a game page learns before it opens a socket: whether the viewer may enter and whether the table is ready. */
export function useGameAccess(address: string) {
  return toLiveQueryResult(useQuery(api.playGames.getGameByAddress, { address }));
}

/** The lobby's ongoing and past games, as the directory may show them to this viewer. */
export function useLobbyGames() {
  return toLiveQueryResult(useQuery(api.playDirectory.listGames, {}));
}

/** The rulesets a signed-in player may start a game with, or that the viewer must sign in first. */
export function useCreatableRulesets() {
  return toLiveQueryResult(useQuery(api.playGames.creatable, {}));
}

export function useGameNameAvailability(name: string) {
  return useQuery(api.playGames.nameAvailability, { name });
}

export function useCreateGame() {
  /* A custom name goes through the provider check; the generated one the page showed is the server's own phrase. */
  const create = useCallback(
    async (
      request:
        | (z.infer<typeof playCreateGameRequestSchema> & { name: string })
        | z.infer<typeof playGeneratedGameRequestSchema>
    ) => {
      if ('name' in request) {
        return await db.action(api.playGames.createGameWithName, request);
      }
      const result = await db.mutation(api.playGames.createGame, request);
      return result.ok ? { ...result, slug: null } : result;
    },
    []
  );
  return useLiveOperation(create);
}

/** Tickets stay in memory and are sent only in the first game socket message. */
export async function requestPlayTicket(gameId: string) {
  return await db.mutation(api.playAdmission.issueTicket, { gameId });
}
