import { blankBoard, derive, defaults, CENTER } from '@shared/boards/geometry';
import type { BoardCapture } from '@shared/play/capture';

/**
 * A blank board crossed by one cubic edge, with a round island cut from the territory it sits in.
 * The island runs between nodes `il` and `ir`, is the only face small enough to be a stronghold, and carries one decal.
 */
export function curvedBoard(): BoardCapture {
  const board = blankBoard();
  Object.assign(board.nodes, { il: [207.53, 323.53], ir: [303.53, 323.53] });
  board.edges.push(
    { id: 'curve', a: 'w', b: 'e', kind: 'cubic', c1: [150, 30], c2: [350, 320] },
    { id: 'island-a', a: 'il', b: 'ir', kind: 'arc', arc: [48, 48, 0, 0, 1] },
    { id: 'island-b', a: 'ir', b: 'il', kind: 'arc', arc: [48, 48, 0, 0, 1] }
  );
  board.properties = Object.fromEntries(
    derive(board).faces.map((face, index) => [
      face.key,
      defaults(
        `Territory ${index + 1}`,
        face.area < 8000 ? 'stronghold' : face.center[1] < CENTER[1] ? 'rock' : 'sand'
      ),
    ])
  );
  const island = Object.values(board.properties).find((p) => p.type === 'stronghold')!;
  island.decals = [
    { id: 'custom-art', artwork: '/vector/troop/atreides.svg', x: 255, y: 323, scale: 70, rotation: 35, outline: true },
  ];
  return { asset: { id: 'curves', slug: 'curves', name: 'Curves and island' }, definition: board };
}
