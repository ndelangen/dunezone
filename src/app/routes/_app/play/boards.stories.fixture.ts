import { extraBoardPlacements } from '@shared/play/boardLayout';
import type { GameSnapshot } from '@shared/play/protocol';
import { rosterFactionNames } from '@shared/play/protocol';
import { restingPositionAt } from '@shared/play/tableGeometry';
import { labelForCount } from '@shared/play/tableState';
import { isTroopStack } from '@shared/play/troop';

import { playingSnapshot } from './product.stories.fixture';

/* Where on an extra board its troops stand, against its centre: a little off it, so the map's middle still shows. */
const ON_BOARD_OFFSET = [0.55, 0, 0.35] as const;

/**
 * A game in play with `extras` extra boards round the main board, in Norbert's slot order (2026-10-29).
 * Each extra board holds a few troops taken from a seat's reserve, so it reads as part of the game.
 */
export function boardSystemSnapshot(extras: number, viewerSeat = 'seat-2'): GameSnapshot {
  const snapshot = playingSnapshot(viewerSeat);
  const table = snapshot.table;
  const names = rosterFactionNames(snapshot.roster);
  table.extraBoardCount = extras;
  const stacks = table.pieces.filter((piece) => isTroopStack(piece) && piece.items.length > 3);
  const moved = extraBoardPlacements(extras).flatMap((placement, index) => {
    const source = stacks[index % Math.max(1, stacks.length)];
    if (!source || source.items.length <= 3) {
      return [];
    }
    const items = source.items.splice(-3);
    source.label = labelForCount(source, source.items.length, names);
    const piece = {
      ...source,
      id: `extra-board-${index + 2}-troops`,
      items,
      label: labelForCount(source, items.length, names),
      zoneId: null,
    };
    piece.position = restingPositionAt(
      [placement.x + ON_BOARD_OFFSET[0], 0, placement.z + ON_BOARD_OFFSET[2]],
      piece,
      extras
    );
    return [piece];
  });
  table.pieces.push(...moved);
  snapshot.versions = { ...snapshot.versions, ...Object.fromEntries(moved.map((piece) => [piece.id, 0])) };
  return snapshot;
}
