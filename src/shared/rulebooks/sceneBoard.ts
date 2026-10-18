import { retainedArrakisBoard } from '../boards/geometry';
import type { Board } from '../boards/geometry';
import { resolveRulebookBoardDefinition } from './boardDefinitions';
import type { RulebookResolvedAssetsById } from './sources';

/**
 * The board a scene's tints and tokens are placed on, in the frame its image fills.
 * The maintained map is the Arrakis board drawn in that same frame, so a scene keeps its markup when it moves between the maintained map and a saved board.
 * A saved board is its resolved data: null while loading, or when it does not read.
 */
export function rulebookSceneBoard(boardId: string, assetsById: RulebookResolvedAssetsById): Board | null {
  if (resolveRulebookBoardDefinition(boardId)) {
    return retainedArrakisBoard();
  }
  const board = assetsById[boardId]?.board;
  return board && typeof board === 'object' ? (board as Board) : null;
}
