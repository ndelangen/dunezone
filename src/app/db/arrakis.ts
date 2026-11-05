import type { ComponentGeometry } from '@shared/asset-publishing/componentGeometry';
import { BoardDefinition } from '@shared/boards/schema';
import type { Board } from '@shared/boards/schema';
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
}>;

/**
 * The saved Arrakis board, live, for pages that show Arrakis without a game board of their own: the homepage, the glossary and the tutorial.
 * `undefined` while it loads; `null` when the site has none, or it has not been published with its territories yet.
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
    return {
      assetId: found.assetId,
      name: found.name,
      imageUrl: found.imageUrl,
      geometry: found.geometry,
      definition: definition.data as Board,
    };
  }, [found]);
}
