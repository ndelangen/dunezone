import type { playCreateGameRequestSchema } from '@shared/play/admission';
import { CatalogueCapture, playReadiness } from '@shared/play/catalogueCapture';
import type { PlayReadinessEntry } from '@shared/play/catalogueCapture';
import type { playGeneratedGameRequestSchema } from '@shared/play/gameCreation';
import { peekSeatPass, PLAY_SEAT_PASS_RENEW_MS } from '@shared/play/seatPass';
import { useQuery } from 'convex/react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { useCallback, useEffect, useState } from 'react';
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
  return await db.query(api.playCatalogue.assetSupply, selection, { hold: false });
}

/** The Play readiness check as a page holds it: running, the game's verdict per ruleset and faction, or why the check itself failed. */
export type PlayReadinessCheck =
  | { status: 'checking' }
  | { status: 'checked'; entries: PlayReadinessEntry[] }
  | { status: 'failed'; reason: string };

/* The game Worker's captures, over the browser's own client: the same public reads, so the same verdict. */
function browserCatalogue() {
  return new CatalogueCapture(
    {
      rulesetSupply: async (rulesetId) =>
        await db.query(api.playCatalogue.rulesetSupply, { rulesetId }, { hold: false }),
      factionDefinition: async (factionId) =>
        await db.query(api.playCatalogue.factionDefinition, { factionId }, { hold: false }),
      assetSupply: readAssetSupply,
    },
    window.location.origin
  );
}

/**
 * Whether a real game could start with this ruleset and deal these factions, judged by the game's own capture code.
 * It is a one-off read rather than a live query: it runs again when `revision` changes, as the page's slots or factions do, and on `recheck`, for an edit made on another page.
 * Factions still `undefined` are loading, and the check waits for them.
 */
export function usePlayReadiness(
  ruleset: { id: string; name: string } | null,
  factions: readonly { id: string; name: string }[] | undefined,
  revision: string
) {
  const [round, setRound] = useState(0);
  /* One string for the whole request, so a new array holding the same factions asks nothing new. */
  const request =
    ruleset && factions
      ? JSON.stringify({
          ruleset: { id: ruleset.id, name: ruleset.name },
          factions: factions.map(({ id, name }) => ({ id, name })),
          revision,
          round,
        })
      : null;
  const [answered, setAnswered] = useState<{ request: string; check: PlayReadinessCheck } | null>(null);
  useEffect(() => {
    if (request === null) {
      return;
    }
    let current = true;
    const asked: { ruleset: { id: string; name: string }; factions: { id: string; name: string }[] } =
      JSON.parse(request);
    const answer = (check: PlayReadinessCheck) => current && setAnswered({ request, check });
    playReadiness(browserCatalogue(), asked.ruleset, asked.factions).then(
      (entries) => answer({ status: 'checked', entries }),
      (error: unknown) =>
        answer({ status: 'failed', reason: error instanceof Error ? error.message : 'The check could not finish.' })
    );
    return () => {
      current = false;
    };
  }, [request]);
  /* An answer to an earlier request is no answer to this one. */
  const check: PlayReadinessCheck =
    answered !== null && answered.request === request ? answered.check : { status: 'checking' };
  return { check, recheck: useCallback(() => setRound((value) => value + 1), []) };
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
