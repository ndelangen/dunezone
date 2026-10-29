import { SECOND_BOARD_PLACEMENT, TAB_BOTTOM_Z, TWO_BOARD_TABS } from '@shared/play/boardLayout';
import type { Vector3Tuple } from '@shared/play/model';
import type { GameSnapshot } from '@shared/play/protocol';
import { rosterFactionNames } from '@shared/play/protocol';
import { isSpicePiece } from '@shared/play/spice';
import { isSpiceBankPosition, spiceBankSlot } from '@shared/play/spiceBank';
import { placementAnchorForPose, placementAnchors } from '@shared/play/tableFurnitureLayout';
import { restingPositionAt } from '@shared/play/tableGeometry';
import { TANKS_PLAY_AREA } from '@shared/play/tablePhysics';
import { labelForCount } from '@shared/play/tableState';
import { isTroopStack } from '@shared/play/troop';

import { playingSnapshot } from './product.stories.fixture';

/* Where on the second board its troops stand, against its centre: a little off it, so the map's middle still shows. */
const ON_BOARD_OFFSETS = [
  [0.55, 0.35],
  [-1.6, -0.9],
  [1.2, -1.8],
] as const;

/* The well of the same name on the two-board table: a deck in the standard left bay goes to the left tab's bay, and so on. */
function twoBoardWell(id: string) {
  /* The product fixture deals Treachery into the right bay, where games deal it into the left one, the Treachery tab's. */
  const dealt = id.startsWith('card-bay-')
    ? id.replace(/left|right/, (side) => (side === 'left' ? 'right' : 'left'))
    : id;
  return placementAnchors('two-boards').find((anchor) => anchor.id === dealt)?.position;
}

/* A piece in the standard Tanks, at the same place within the two-board table's Tanks tab. */
function intoTanksTab([x, y, z]: Vector3Tuple): Vector3Tuple {
  const [left, right] = TWO_BOARD_TABS.tanks;
  const across = (x - TANKS_PLAY_AREA.minX) / (TANKS_PLAY_AREA.maxX - TANKS_PLAY_AREA.minX);
  const down = (z - TANKS_PLAY_AREA.minZ) / (TANKS_PLAY_AREA.maxZ - TANKS_PLAY_AREA.minZ);
  return [left + 0.5 + across * (right - left - 1), y, 6.2 + down * (TAB_BOTTOM_Z - 6.9)];
}

/**
 * A game in play on the two-board table (Norbert, 2026-10-29): the standard game's table moved over, its decks, shared inventory, Tanks and Spice Bank in their two-board places, and a few troops from seats' reserves on the second board.
 */
export function twoBoardSnapshot(viewerSeat = 'seat-2'): GameSnapshot {
  const snapshot = playingSnapshot(viewerSeat);
  const table = snapshot.table;
  table.tableLayout = 'two-boards';
  const names = rosterFactionNames(snapshot.roster);
  for (const piece of table.pieces) {
    if (piece.inventory) {
      continue;
    }
    const anchor = placementAnchorForPose(piece, piece.position);
    if (anchor) {
      const well = twoBoardWell(anchor.id);
      if (well) {
        piece.position = restingPositionAt(well, piece, 'two-boards');
      }
      continue;
    }
    if (isSpicePiece(piece) && isSpiceBankPosition(piece.position)) {
      piece.position = restingPositionAt(spiceBankSlot('two-boards').position, piece, 'two-boards');
      continue;
    }
    if (piece.position[2] > TANKS_PLAY_AREA.minZ + 1) {
      piece.position = intoTanksTab(piece.position);
    }
  }
  const stacks = table.pieces.filter((piece) => isTroopStack(piece) && piece.items.length > 3);
  const moved = ON_BOARD_OFFSETS.flatMap(([x, z], index) => {
    const source = stacks[index % Math.max(1, stacks.length)];
    if (!source || source.items.length <= 3) {
      return [];
    }
    const items = source.items.splice(-3);
    source.label = labelForCount(source, source.items.length, names);
    const piece = {
      ...source,
      id: `second-board-troops-${index + 1}`,
      items,
      label: labelForCount(source, items.length, names),
      zoneId: null,
    };
    piece.position = restingPositionAt(
      [SECOND_BOARD_PLACEMENT.x + x, 0, SECOND_BOARD_PLACEMENT.z + z],
      piece,
      'two-boards'
    );
    return [piece];
  });
  table.pieces.push(...moved);
  snapshot.versions = { ...snapshot.versions, ...Object.fromEntries(moved.map((piece) => [piece.id, 0])) };
  return snapshot;
}
