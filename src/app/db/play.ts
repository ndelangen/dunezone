import type { playCreateGameRequestSchema } from '@shared/play/admission';
import type { playGeneratedGameRequestSchema } from '@shared/play/gameCreation';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useCallback, useState } from 'react';
import type { z } from 'zod';

import { db } from '@db/core';
import { toLiveQueryResult, useLiveOperation, useLiveQuery } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

export type CreatableRuleset = Extract<
  FunctionReturnType<typeof api.playGames.creatable>,
  { access: 'allowed' }
>['rulesets'][number];

/** What a game page learns before it opens a socket: whether the viewer may enter and whether the table is ready. */
export function useGameAccess(address: string) {
  return toLiveQueryResult(useLiveQuery(api.playGames.getGameByAddress, { address }));
}

/** The lobby's ongoing and past games, as the directory may show them to this viewer. */
export function useLobbyGames() {
  return toLiveQueryResult(useLiveQuery(api.playDirectory.listGames, {}));
}

/** What a chosen ruleset puts on the table, as the create page's manifest lists it. */
export type CreatableRulesetPreview = NonNullable<
  Extract<FunctionReturnType<typeof api.playGames.creatable>, { access: 'allowed' }>['preview']
>;

/**
 * The rulesets a signed-in player may start a game with, or that the viewer must sign in first, with the chosen one's manifest.
 * Choosing another ruleset changes the query's arguments, so the last answer stays in place until the new one lands rather than the page falling back to loading.
 */
export function useCreatableRulesets(rulesetId: string) {
  const live = useQuery(api.playGames.creatable, rulesetId ? { rulesetId: rulesetId as Id<'rulesets'> } : {});
  const [last, setLast] = useState(live);
  if (live !== undefined && live !== last) {
    setLast(live);
  }
  return toLiveQueryResult(live ?? last);
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
