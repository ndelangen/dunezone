import { BOARD_RADIUS } from '../play/tableGeometry';
import { CENTER, RADIUS } from './geometry';
import type { Board, Point } from './schema';
import { propertyId } from './schema';
import { boardTerritories, boardTerritoryAt } from './territories';

/*
 * Board drawing units run across the board's circle; the table's board disc is BOARD_RADIUS wide.
 * These carry a point between the two, so table logic can ask which territory a spot on the table is in.
 */

/** A board drawing point as a table point, as [x, z]. */
export function boardPointToTable([x, y]: Readonly<Point>): [number, number] {
  return [((x - CENTER[0]) / RADIUS) * BOARD_RADIUS, ((y - CENTER[1]) / RADIUS) * BOARD_RADIUS];
}

/** A table point, as x and z, in board drawing units. */
export function tablePointToBoard(x: number, z: number): Point {
  return [CENTER[0] + (x * RADIUS) / BOARD_RADIUS, CENTER[1] + (z * RADIUS) / BOARD_RADIUS];
}

/** The territory under a table point, by the ID tints keep, or undefined off the map. */
export function tableTerritoryAt(board: Board, x: number, z: number) {
  const property = boardTerritoryAt(board, tablePointToBoard(x, z));
  return property && { id: propertyId(property), name: property.name };
}

/** A territory's name and a point well inside it, in board drawing units; undefined when the board has no such territory. */
export function boardTerritory(board: Board, territoryId: string) {
  const face = boardTerritories(board).find((entry) => propertyId(board.properties[entry.key]) === territoryId);
  return face && { id: territoryId, name: board.properties[face.key].name, centre: face.center };
}
