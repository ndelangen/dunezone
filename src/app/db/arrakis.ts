import type { ComponentGeometry } from '@shared/asset-publishing/componentGeometry';
import { ARRAKIS_BOARD_SLUG } from '@shared/boards/arrakisOfficial';
import { BoardDefinition } from '@shared/boards/schema';
import type { Board } from '@shared/boards/schema';
import type { BoardCapture } from '@shared/play/capture';
import { useMemo } from 'react';

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

/**
 * The saved Arrakis board, live, for pages that show Arrakis without a game board of their own: the glossary and the tutorial.
 * `undefined` while it loads;
 * `null` when the site has none, or it has not been published with its territories yet.
 */
export function useArrakisBoard(): ArrakisBoard | null | undefined {
  const found = useLiveQuery(api.arrakis.board, {});
  return useMemo(() => {
    if (found === undefined) {
      return undefined;
    }
    const definition = BoardDefinition.safeParse(found?.board);
    if (!found?.imageUrl || !found.geometry || !definition.success) {
      return null;
    }
    const board = definition.data as Board;
    return {
      assetId: found.assetId,
      name: found.name,
      imageUrl: found.imageUrl,
      geometry: found.geometry,
      definition: board,
      capture: { asset: { id: found.assetId, slug: ARRAKIS_BOARD_SLUG, name: found.name }, definition: board },
    };
  }, [found]);
}
