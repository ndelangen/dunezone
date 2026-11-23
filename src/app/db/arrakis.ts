import { ARRAKIS_BOARD_SLUG } from '@shared/boards/arrakisOfficial';
import type { Board } from '@shared/boards/schema';
import type { BoardCapture } from '@shared/play/capture';
import type { FunctionReturnType } from 'convex/server';
import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { db } from '@db/core';
import { useFallbackQuery, useLiveQuery } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

/** The saved Arrakis board as the server answers it, before it is checked. */
export type ArrakisBoardSeed = FunctionReturnType<typeof api.arrakis.board>;

/**
 * The saved Arrakis board as pages use it: the query's answer (its id, name, published face and territories in that image's frame), with its board data as a board definition and as a table captures it.
 */
export type ArrakisBoard = Readonly<
  NonNullable<ArrakisBoardSeed> & {
    /** The board's own territories, for drawing tints and placing pieces on it. */
    definition: Board;
    /** The board as a table captures it, for a practice table without a game behind it. */
    capture: BoardCapture;
  }
>;

/**
 * The saved Arrakis board for a server-rendered page's loader, so the page's HTML carries it and draws it before the live query answers.
 * Only the server waits for it: a navigation in the browser opens the page at once and the live query brings the board.
 * `undefined` there, or when the server cannot answer: the page then loads it live, as a page without a loader does.
 */
export async function loadArrakisBoard(): Promise<ArrakisBoardSeed | undefined> {
  if (!import.meta.env.SSR) {
    return undefined;
  }
  /* A slow answer holds up the whole page's HTML, so after a short wait the page loads it live instead. */
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(resolve, ARRAKIS_SSR_WAIT_MS, undefined);
  });
  try {
    return await Promise.race([db.query(api.arrakis.board, {}), timeout]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** How long a server-rendered page waits for the saved Arrakis before it leaves the board to the live query. */
export const ARRAKIS_SSR_WAIT_MS = 1500;

/** The saved Arrakis board's id and published face only, for pages that do not draw its territories. */
export function useArrakisFace() {
  return useLiveQuery(api.arrakis.face, {});
}

const SeedContext = createContext<ArrakisBoardSeed | undefined>(undefined);

/** Hands a loader's saved Arrakis board to every `useArrakisBoard` below it, until the live query answers. */
export function ArrakisBoardSeedProvider({
  seed,
  children,
}: Readonly<{ seed: ArrakisBoardSeed | undefined; children: ReactNode }>) {
  return createElement(SeedContext.Provider, { value: seed }, children);
}

/** Fetches in flight, by revision, so pages mounting together share one; a finished answer is left to the browser's HTTP cache. */
const boardFetches = new Map<string, Promise<ArrakisBoardSeed | undefined>>();

/** How long a page waits for the edge before it subscribes to the whole board instead. */
const ARRAKIS_EDGE_WAIT_MS = 5000;

/** The edge's copy of `arrakis.board` for one revision, or `undefined` where the edge has none (Storybook, local dev, a revision it no longer serves) or does not answer in time. */
function fetchBoardRevision(revision: string): Promise<ArrakisBoardSeed | undefined> {
  let found = boardFetches.get(revision);
  if (!found) {
    found = fetch(arrakisBoardDataHref(revision), { signal: AbortSignal.timeout(ARRAKIS_EDGE_WAIT_MS) })
      .then(async (response) => {
        const value = response.ok ? ((await response.json()) as ArrakisBoardSeed) : undefined;
        return value?.revision === revision ? value : undefined;
      })
      .catch(() => undefined)
      .finally(() => boardFetches.delete(revision));
    boardFetches.set(revision, found);
  }
  return found;
}

/** Where the publisher Worker serves the saved Arrakis board's data for one revision. */
function arrakisBoardDataHref(revision: string) {
  return `/data/arrakis-board/${encodeURIComponent(revision)}.json`;
}

/**
 * The saved Arrakis board, for pages that show Arrakis without a game board of their own: the homepage, the glossary and the tutorial.
 * The page subscribes only to the board's small reference row, and fetches the board's data for that revision from the edge, so a visit reads a few small rows from Convex instead of the whole board.
 * Where the edge has no copy, the page subscribes to the whole board instead.
 * A page whose loader embedded it (`ArrakisBoardSeedProvider`) draws that copy until a newer one arrives;
 * `undefined` while it loads;
 * `null` when the site has none, or it has not been published with its territories yet.
 */
export function useArrakisBoard(): ArrakisBoard | null | undefined {
  const reference = useLiveQuery(api.arrakis.reference, {});
  const seed = useContext(SeedContext);
  const revision = reference?.revision;
  const [fetched, setFetched] = useState<{ revision: string; board: ArrakisBoardSeed | undefined }>();
  useEffect(() => {
    if (!revision || seed?.revision === revision) {
      return;
    }
    let current = true;
    void fetchBoardRevision(revision).then((board) => {
      if (current) {
        setFetched({ revision, board });
      }
    });
    return () => {
      current = false;
    };
  }, [revision, seed?.revision]);
  const fetchedBoard = fetched && fetched.revision === revision ? fetched.board : undefined;
  /* While a new revision is on its way, the board already drawn stays, so a running tutorial table is not torn down. */
  const previousBoard = fetched && fetched.revision !== revision ? fetched.board : undefined;
  const edgeMissed = revision !== undefined && fetched?.revision === revision && fetchedBoard === undefined;
  const live = useFallbackQuery(api.arrakis.board, {}, edgeMissed);
  /* Strictly undefined: a null reference means the site has no saved Arrakis, which outranks the embedded copy. */
  const found: ArrakisBoardSeed | undefined =
    reference === null
      ? null
      : reference === undefined
        ? seed
        : seed?.revision === revision
          ? seed
          : fetchedBoard !== undefined
            ? fetchedBoard
            : /* Strictly undefined again: a live null (the board became unavailable) outranks an older copy. */
              live === undefined
              ? (previousBoard ?? seed)
              : live;
  return useMemo(() => {
    if (!found) {
      return found;
    }
    const definition = found.board as Board;
    return {
      ...found,
      definition,
      capture: { asset: { id: found.assetId, slug: ARRAKIS_BOARD_SLUG, name: found.name }, definition },
    };
  }, [found]);
}
