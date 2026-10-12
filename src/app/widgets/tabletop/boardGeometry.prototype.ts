/* Throwaway experiment: saved board linework into table triangles and territory picking. */
import {
  arrakisBoard,
  blankBoard,
  CENTER,
  defaults,
  derive,
  movePoint,
  RADIUS,
  reconcile,
} from '@shared/boards/geometry';
import type { Board, Face, Point } from '@shared/boards/geometry';
import { BoardDefinition } from '@shared/boards/schema';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  ShapeUtils,
  Vector2,
  Vector3,
} from 'three';

export const cases = ['Arrakis', 'Curves and island', 'Edited Arrakis', 'Blank'] as const;
export type Case = (typeof cases)[number];
const colors = { sand: '#F6D979', rock: '#A67A3E', stronghold: '#F7BA7A', polar: '#ffffff' };
export const worldPoint = ([x, y]: Point): Point => [
  ((x - CENTER[0]) * BOARD_RADIUS) / RADIUS,
  ((y - CENTER[1]) * BOARD_RADIUS) / RADIUS,
];

export function savedBoard(which: Case): Board {
  let board = which.includes('Arrakis') ? arrakisBoard() : blankBoard();
  if (which === 'Edited Arrakis') {
    const moved = movePoint(board, 'n335', [216, 84]);
    board = reconcile(moved, board, derive(board).faces, derive(moved).faces);
  }
  if (which === 'Curves and island') {
    board.nodes.il = [207.53, 323.53];
    board.nodes.ir = [303.53, 323.53];
    board.nodes.openA = [90, 290];
    board.nodes.openB = [110, 350];
    board.edges.push(
      { id: 'curve', a: 'w', b: 'e', kind: 'cubic', c1: [150, 30], c2: [350, 320] },
      { id: 'island-a', a: 'il', b: 'ir', kind: 'arc', arc: [48, 48, 0, 0, 1] },
      { id: 'island-b', a: 'ir', b: 'il', kind: 'arc', arc: [48, 48, 0, 0, 1] },
      { id: 'open-cut', a: 'openA', b: 'openB', kind: 'line' }
    );
    board.properties = Object.fromEntries(
      derive(board).faces.map((face, index) => [
        face.key,
        defaults(
          `Custom territory ${index + 1}`,
          face.area < 8000 ? 'stronghold' : face.center[1] < CENTER[1] ? 'rock' : 'sand'
        ),
      ])
    );
    const island = Object.values(board.properties).find((p) => p.type === 'stronghold')!;
    island.decals = [
      {
        id: 'oversized',
        artwork: '/vector/icon/arrakis-city.svg',
        x: 290,
        y: 323,
        scale: 180,
        rotation: 35,
        outline: true,
      },
    ];
  }
  /* A JSON round trip represents the persisted input, rather than passing editor objects directly. */
  return BoardDefinition.parse(JSON.parse(JSON.stringify(board)));
}

export function convertBoard(board: Board) {
  const started = performance.now();
  const result = derive(board);
  const derivedAt = performance.now();
  const positions: number[] = [],
    painted: number[] = [],
    triangleTerritories: number[] = [];
  let largestAreaError = 0;
  result.faces.forEach((face, territory) => {
    const rings = face.rings.map((ring) => ring.slice(0, -1).map(([x, y]) => new Vector2(x, y)));
    const flat = rings.flat();
    const triangles = ShapeUtils.triangulateShape(rings[0], rings.slice(1));
    const color = new Color(colors[board.properties[face.key]?.type ?? 'sand']);
    let area = 0;
    for (const indices of triangles) {
      const points = indices.map((index) => flat[index]);
      const [a, b, c] = points;
      const signed = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      area += Math.abs(signed) / 2;
      if (signed > 0) {
        points.reverse();
      }
      for (const point of points) {
        const [x, z] = worldPoint([point.x, point.y]);
        positions.push(x, 0, z);
        painted.push(color.r, color.g, color.b, 1);
      }
      triangleTerritories.push(territory);
    }
    largestAreaError = Math.max(largestAreaError, Math.abs(area - face.area));
  });
  const geometry = new BufferGeometry();
  const uv = positions.flatMap((_, index) =>
    index % 3 === 0
      ? [positions[index] / (2 * BOARD_RADIUS) + 0.5, 0.5 - positions[index + 2] / (2 * BOARD_RADIUS)]
      : []
  );
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(painted), 4));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return {
    board,
    geometry,
    faces: result.faces,
    triangleTerritories,
    metrics: {
      territories: result.faces.length,
      holes: result.faces.reduce((n, f) => n + f.rings.length - 1, 0),
      triangles: triangleTerritories.length,
      bytes: positions.length * 4 + painted.length * 4 + positions.length * 4 + uv.length * 4,
      deriveMs: derivedAt - started,
      triangulateMs: performance.now() - derivedAt,
      largestAreaError,
      dangles: result.dangles,
      unrecoveredSegments: result.unrecoveredSegments,
    },
  };
}
export type Converted = ReturnType<typeof convertBoard>;

/* Independent browser SVG containment is compared with actual Three ray hits, including holes. */
export function inspectGeometry(converted: Converted) {
  const context = document.createElement('canvas').getContext('2d')!;
  const paths = converted.faces.map((face) => new Path2D(face.path));
  const mesh = new Mesh(converted.geometry, new MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  const ray = new Raycaster();
  const mismatches: { point: Point; svg: string | null; triangles: string | null }[] = [];
  let probes = 0,
    overlappingHits = 0;
  const name = (index: number | undefined) =>
    index === undefined ? null : converted.board.properties[converted.faces[index].key].name;
  const probe = (point: Point) => {
    const [x, z] = worldPoint(point);
    ray.set(new Vector3(x, 1, z), new Vector3(0, -1, 0));
    const hits = ray.intersectObject(mesh);
    const territories = new Set(hits.map((hit) => converted.triangleTerritories[hit.faceIndex!]));
    if (territories.size > 1) {
      overlappingHits++;
    }
    const expected = paths.findIndex((path) => context.isPointInPath(path, ...point, 'evenodd'));
    const actual = hits[0] && converted.triangleTerritories[hits[0].faceIndex!];
    if ((expected < 0 ? undefined : expected) !== actual) {
      mismatches.push({ point, svg: name(expected < 0 ? undefined : expected), triangles: name(actual) });
    }
    probes++;
  };
  const start = performance.now();
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      probe([((x + 0.371) * 487.06) / 64, ((y + 0.619) * 487.06) / 64]);
    }
  }
  converted.faces.forEach((face) => probe(face.center));
  const interiorProbes = probes;
  const interiorMismatches = mismatches.length;
  /* Probe both sides near curved boundaries, separately from the broad grid. */
  for (const face of converted.faces) {
    for (const ring of face.rings) {
      for (let i = 0; i + 1 < ring.length; i += 9) {
        const a = ring[i],
          b = ring[i + 1];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length === 0) {
          continue;
        }
        for (const direction of [-1, 1]) {
          probe([
            (a[0] + b[0]) / 2 - (direction * 0.05 * (b[1] - a[1])) / length,
            (a[1] + b[1]) / 2 + (direction * 0.05 * (b[0] - a[0])) / length,
          ]);
        }
      }
    }
  }
  mesh.material.dispose();
  const positions = converted.geometry.getAttribute('position');
  const normals = converted.geometry.getAttribute('normal');
  let downwardVertices = 0,
    nonFinite = 0;
  for (let i = 0; i < positions.count; i++) {
    if (normals.getY(i) < 0.99) {
      downwardVertices++;
    }
    if (![positions.getX(i), positions.getY(i), positions.getZ(i)].every(Number.isFinite)) {
      nonFinite++;
    }
  }
  return {
    ...converted.metrics,
    probes,
    interiorProbes,
    interiorMismatches,
    boundaryProbes: probes - interiorProbes,
    boundaryMismatches: mismatches.length - interiorMismatches,
    mismatches,
    overlappingHits,
    downwardVertices,
    nonFinite,
    probeMs: performance.now() - start,
  };
}

export function territoryName(board: Board, face: Face | undefined) {
  return face
    ? (board.properties[face.key]?.name ?? 'Unnamed territory')
    : 'Move over the table to inspect a territory';
}
