import type { ComponentGeometry } from '@shared/asset-publishing/componentGeometry';
import { ARRAKIS_BOARD_SLUG } from '@shared/boards/arrakisOfficial';
import type { Board } from '@shared/boards/schema';
import type { BoardCapture } from '@shared/play/capture';
import type { FunctionReturnType } from 'convex/server';
import { createContext, createElement, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import { db } from '@db/core';
import { useLiveQuery } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

export type ArrakisBoard = Readonly<{
  assetId: string;
  name: string;
  /** The published face, and its territories in that image's frame. */
  imageUrl: string;
  geometry: ComponentGeometry;
  /** The board's own territories, for drawing tints and placing pieces on it. */
  definition: Board;
  /** The board as a table captures it, for a practice table without a game behind it. */
  capture: BoardCapture;
}>;

/** The saved Arrakis board as the server answers it, before it is checked. */
export type ArrakisBoardSeed = FunctionReturnType<typeof api.arrakis.board>;

/**
 * The saved Arrakis board for a server-rendered page's loader, so the page's HTML carries it and draws it before the live query answers.
 * Only the server waits for it: a navigation in the browser opens the page at once and the live query brings the board.
 * `undefined` there, or when the server cannot answer: the page then loads it live, as a page without a loader does.
 */
export async function loadArrakisBoard(): Promise<ArrakisBoardSeed | undefined> {
  if (!import.meta.env.SSR) {
    return undefined;
  }
  try {
    return await db.query(api.arrakis.board, {});
  } catch {
    return undefined;
  }
}

const SeedContext = createContext<ArrakisBoardSeed | undefined>(undefined);

/** Hands a loader's saved Arrakis board to every `useArrakisBoard` below it, until the live query answers. */
export function ArrakisBoardSeedProvider({
  seed,
  children,
}: Readonly<{ seed: ArrakisBoardSeed | undefined; children: ReactNode }>) {
  return createElement(SeedContext.Provider, { value: seed }, children);
}

/**
 * The saved Arrakis board, live, for pages that show Arrakis without a game board of their own: the homepage, the glossary and the tutorial.
 * A page whose loader embedded it (`ArrakisBoardSeedProvider`) draws that copy until the live query answers;
 * `undefined` while it loads;
 * `null` when the site has none, or it has not been published with its territories yet.
 */
export function useArrakisBoard(): ArrakisBoard | null | undefined {
  const live = useLiveQuery(api.arrakis.board, {});
  const seed = useContext(SeedContext);
  /* Strictly undefined: a live null means the site has no saved Arrakis, which outranks the embedded copy. */
  const found = live === undefined ? seed : live;
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
