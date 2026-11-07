import type { Board } from '../boards/geometry';
import type { RulebookResolvedAssetsById } from './sources';

/** The board a scene's tints and tokens are placed on, in the frame its image fills: its resolved data, null while loading or when it does not read. */
export function rulebookSceneBoard(boardId: string, assetsById: RulebookResolvedAssetsById): Board | null {
  const board = assetsById[boardId]?.board;
  return board && typeof board === 'object' ? (board as Board) : null;
}
