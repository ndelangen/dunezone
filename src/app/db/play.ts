import type { playCreateGameRequestSchema } from '@shared/play/admission';
import { CatalogueCapture, playReadiness } from '@shared/play/catalogueCapture';
import type { PlayReadinessEntry } from '@shared/play/catalogueCapture';
import type { playGeneratedGameRequestSchema } from '@shared/play/gameCreation';
import { peekSeatPass, PLAY_SEAT_PASS_RENEW_MS } from '@shared/play/seatPass';
import { useQueries, useQuery } from 'convex/react';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';
import { convexToJson } from 'convex/values';
import type { Value } from 'convex/values';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { z } from 'zod';

import { db } from '@db/core';
import { toLiveQueryResult, useHeldLiveQuery, useLiveOperation, useLiveQuery } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

export type CreatableRuleset = Extract<
  FunctionReturnType<typeof api.playGames.creatable>,
  { access: 'allowed' }
>['rulesets'][number];

/**
 * What a game page learns before it opens a socket: whether the viewer may enter and whether the table is ready.
 * Every directory summary the game Worker publishes re-runs it, so one failed re-run keeps the last answer instead of throwing the open table, and its socket, off the page.
 */
export function useGameAccess(address: string) {
  return toLiveQueryResult(useHeldLiveQuery(api.playGameDirectory.getGameByAddress, { address }));
}

/** The lobby's ongoing and past games, as the directory may show them to this viewer. */
export function useLobbyGames() {
  return toLiveQueryResult(useLiveQuery(api.playDirectory.listGames, {}));
}

/** What the in-play spawn picker asks the catalogue for: a search's words, if any, and how many rows. */
export type SpawnableAssetsArgs = FunctionArgs<typeof api.playCatalogue.spawnableAssets>;

/**
 * The decks, bundles and tokens the catalogue offers a game, the newest or a search's best matches, up to `limit`.
 * Plain `useQuery`, not held warm: the arguments change as the player types, and each would otherwise stay subscribed.
 */
export function useSpawnableAssets(args: SpawnableAssetsArgs) {
  return toLiveQueryResult(useQuery(api.playCatalogue.spawnableAssets, args));
}

/** One asset's faces and members as a game captures it; a tutorial table captures through this, since it has no game Worker. */
export async function readAssetSupply(selection: FunctionArgs<typeof api.playCatalogue.assetSupply>) {
  return await db.query(api.playCatalogue.assetSupply, selection, {
    hold: false,
  });
}

/** The Play readiness check as a page holds it: running, the game's verdict per ruleset and faction, or why the check itself failed. */
export type PlayReadinessCheck =
  | { status: 'checking' }
  | { status: 'checked'; entries: PlayReadinessEntry[] }
  | { status: 'failed'; reason: string };

/* The game Worker's captures, over the browser's own client: the same public reads, so the same verdict. */
/* One read the capture made, kept so the page can watch the same query for a change. */
type CatalogueRead = {
  query: FunctionReference<'query'>;
  args: Record<string, Value>;
  answer: string;
};

/* The capture over the browser's client, recording each read and its answer under a key of its query and arguments. */
function browserCatalogue(reads: Record<string, CatalogueRead>) {
  const read = async <Query extends FunctionReference<'query'>>(query: Query, args: FunctionArgs<Query>) => {
    const answer = await db.query(query, args, { hold: false });
    reads[JSON.stringify([getFunctionName(query), convexToJson(args)])] = {
      query,
      args,
      answer: JSON.stringify(convexToJson(answer as never)),
    };
    return answer;
  };
  return new CatalogueCapture(
    {
      rulesetSupply: async (rulesetId) => await read(api.playCatalogue.rulesetSupply, { rulesetId }),
      factionDefinition: async (factionId) => await read(api.playCatalogue.factionDefinition, { factionId }),
      assetSupply: async (selection) => await read(api.playCatalogue.assetSupply, selection),
    },
    window.location.origin
  );
}

/* Whether any watched read now answers differently from what the capture saw: a member face published, a slot filled, a faction fixed. */
function changedSince(reads: Record<string, CatalogueRead>, live: Record<string, unknown>) {
  return Object.entries(reads).some(([key, read]) => {
    const now = live[key];
    return now !== undefined && !(now instanceof Error) && JSON.stringify(convexToJson(now as never)) !== read.answer;
  });
}

/**
 * Whether a real game could start with this ruleset and deal these factions, judged by the game's own capture code.
 * The capture runs once, then the page watches every query it read: when one answers differently, it runs again, so a fix made anywhere is seen.
 * `recheck` runs it again on demand.
 * Factions still `undefined` are loading, and the check waits for them.
 */
export function usePlayReadiness(
  ruleset: { id: string; name: string } | null,
  factions: readonly { id: string; name: string }[] | undefined
) {
  const [round, setRound] = useState(0);
  /* One string for the whole request, so a new array holding the same factions asks nothing new. */
  const request =
    ruleset && factions
      ? JSON.stringify({
          ruleset: { id: ruleset.id, name: ruleset.name },
          factions: factions.map(({ id, name }) => ({ id, name })),
          round,
        })
      : null;
  const [answered, setAnswered] = useState<{
    request: string;
    check: PlayReadinessCheck;
    reads: Record<string, CatalogueRead>;
  } | null>(null);
  useEffect(() => {
    if (request === null) {
      return;
    }
    let current = true;
    const asked: {
      ruleset: { id: string; name: string };
      factions: { id: string; name: string }[];
    } = JSON.parse(request);
    const reads: Record<string, CatalogueRead> = {};
    const answer = (check: PlayReadinessCheck) => current && setAnswered({ request, check, reads });
    playReadiness(browserCatalogue(reads), asked.ruleset, asked.factions).then(
      (entries) => answer({ status: 'checked', entries }),
      (error: unknown) =>
        answer({
          status: 'failed',
          reason: error instanceof Error ? error.message : 'The check could not finish.',
        })
    );
    return () => {
      current = false;
    };
  }, [request]);
  const fresh = answered !== null && answered.request === request ? answered : null;
  /* Convex tracks the request object's identity, so the watched map changes only with a new answer. */
  const watched = useMemo(
    () =>
      Object.fromEntries(Object.entries(fresh?.reads ?? {}).map(([key, { query, args }]) => [key, { query, args }])),
    [fresh]
  );
  const live = useQueries(watched);
  /* A plain value rather than an updater, so a render that runs twice still asks for one more round only. */
  if (fresh && changedSince(fresh.reads, live)) {
    setRound(round + 1);
  }
  /* An answer to an earlier request is no answer to this one. */
  const check: PlayReadinessCheck = fresh ? fresh.check : { status: 'checking' };
  return {
    check,
    recheck: useCallback(() => setRound((value) => value + 1), []),
  };
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
  return useQuery(api.playGameNameAvailability.nameAvailability, { name });
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
      const result = await db.action(api.playGames.createGeneratedGame, request);
      return result.ok ? { ...result, slug: null } : result;
    },
    []
  );
  return useLiveOperation(create);
}

/*
 * Each open game's seat pass, as its game query last delivered it: a pass, or null while the account is not enrolled there yet.
 * Passes live in memory only and go out only over the game socket.
 */
type HeldPass = string | null;
type PassEntry = {
  held?: HeldPass;
  renewed?: { pass: string; at: number };
  listeners: Set<(pass: string) => void>;
  waiters: (() => void)[];
};
/* How long a pass Convex just signed is used as it is, whatever this browser's clock says, so a skewed clock cannot renew in a loop. */
const JUST_RENEWED_MS = 60_000;
const passes = new Map<string, PassEntry>();

function passEntry(gameId: string) {
  let entry = passes.get(gameId);
  if (!entry) {
    entry = { listeners: new Set(), waiters: [] };
    passes.set(gameId, entry);
  }
  return entry;
}

function identityOf(pass: string) {
  const payload = peekSeatPass(pass);
  return payload ? `${payload.principalId}/${payload.actorId}/${payload.sessionId}` : null;
}

/*
 * The game query and a renewal can each deliver a pass for the same identity; the one that lasts longer wins, so a query re-run never replaces a fresher renewal.
 * A pass for another account, actor or session always replaces the held one, as after a merge or a switch of account.
 */
function outlasts(next: HeldPass, held: HeldPass | undefined) {
  if (held === undefined || held === null || next === null) {
    return next !== held;
  }
  if (identityOf(next) !== identityOf(held)) {
    return true;
  }
  return next !== held && (peekSeatPass(next)?.exp ?? 0) > (peekSeatPass(held)?.exp ?? 0);
}

function holdPass(gameId: string, held: HeldPass) {
  const entry = passEntry(gameId);
  if (!outlasts(held, entry.held)) {
    return;
  }
  entry.held = held;
  for (const wake of entry.waiters.splice(0)) {
    wake();
  }
  if (held !== null) {
    for (const listener of entry.listeners) {
      listener(held);
    }
  }
}

/** Called by the game page with each answer of its game query. */
export function rememberSeatPass(gameId: string, pass: string | null) {
  holdPass(gameId, pass);
}

/** Every fresh pass for the game, so an open socket hands it to the room before the one it entered with ends. */
export function watchSeatPass(gameId: string, listener: (pass: string) => void) {
  const entry = passEntry(gameId);
  entry.listeners.add(listener);
  return () => entry.listeners.delete(listener);
}

function untilHeld(entry: PassEntry) {
  return entry.held === undefined ? new Promise<void>((resolve) => entry.waiters.push(resolve)) : Promise.resolve();
}

/** Whether the pass ends within the renewal margin; the browser's clock only decides when to ask, never whether the room accepts. */
function nearExpiry(pass: string) {
  const payload = peekSeatPass(pass);
  return !payload || payload.exp - Date.now() < PLAY_SEAT_PASS_RENEW_MS;
}

/**
 * What the game socket admits with: the held pass while it has time left, a fresh one from Convex when it nears its end or the account is not enrolled yet.
 * A pass Convex signed in the last minute is used as it is even if this browser's clock calls it near its end, so a skewed clock never renews in a loop.
 */
export async function requestPlayAdmission(gameId: string, { renew = false }: { renew?: boolean } = {}) {
  const entry = passEntry(gameId);
  let forceRenewal = renew;
  while (true) {
    await untilHeld(entry);
    const held = entry.held!;
    /* `renew` is the room saying the pass ran out, which outranks this browser's clock unless Convex only just signed it. */
    const justRenewed = held === entry.renewed?.pass && Date.now() - entry.renewed.at < JUST_RENEWED_MS;
    if (held !== null && (justRenewed || (!forceRenewal && !nearExpiry(held)))) {
      return { ok: true as const, pass: held };
    }
    const result = await db.mutation(held === null ? api.playAdmission.enrolPlayer : api.playAdmission.renewSeatPass, {
      gameId,
    });
    /* A query or another renewal replaced the credential while this request waited; only the held one may be published. */
    if (entry.held !== held) {
      forceRenewal = false;
      continue;
    }
    if (result.ok) {
      entry.renewed = { pass: result.pass, at: Date.now() };
      holdPass(gameId, result.pass);
    }
    return result;
  }
}
