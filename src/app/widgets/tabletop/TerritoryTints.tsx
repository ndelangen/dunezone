/* @jsxImportSource ./three-jsx */
import { CENTER, RADIUS } from '@shared/boards/geometry';
import type { Board, Point } from '@shared/boards/schema';
import { territoryId } from '@shared/boards/schema';
import { boardTerritories, boardTerritoryAt } from '@shared/boards/territories';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import type { TerritoryTint } from '@shared/play/territoryTints';
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, ShapeGeometry, ShapeUtils, Vector2 } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

import atomicsSvg from '../../../../media/vector/decal/atomics.svg?raw';
import { ignoreRaycast } from './ignoreRaycast';

/* Board drawing units run across the board's circle; the table's board disc is BOARD_RADIUS wide. */
function toTable([x, y]: Point): [number, number] {
  return [((x - CENTER[0]) / RADIUS) * BOARD_RADIUS, ((y - CENTER[1]) / RADIUS) * BOARD_RADIUS];
}

/** The territory under a table point, by the ID tints keep, or undefined off the map. */
export function territoryAtTablePoint(board: Board, x: number, z: number) {
  const property = boardTerritoryAt(board, [
    CENTER[0] + (x * RADIUS) / BOARD_RADIUS,
    CENTER[1] + (z * RADIUS) / BOARD_RADIUS,
  ]);
  return property && { id: territoryId(property.name), name: property.name };
}

function fillGeometry(rings: Point[][]) {
  const shapes = rings.map((ring) => ring.slice(0, -1).map(([x, y]) => new Vector2(x, y)));
  const flat = shapes.flat();
  const positions: number[] = [];
  for (const triangle of ShapeUtils.triangulateShape(shapes[0], shapes.slice(1))) {
    for (const index of triangle) {
      const [x, z] = toTable([flat[index].x, flat[index].y]);
      positions.push(x, 0, z);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

function outlineGeometry(rings: Point[][]) {
  const positions: number[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, az] = toTable(ring[i]);
      const [bx, bz] = toTable(ring[i + 1]);
      positions.push(ax, 0, az, bx, 0, bz);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

const STAMP_SIZE = 0.6;
let atomicsGeometry: ShapeGeometry | undefined;
/* The stamp artwork is drawn on a 100-unit square; the shape is made once and shared by every stamp. */
function stampGeometry() {
  atomicsGeometry ??= new ShapeGeometry(
    new SVGLoader().parse(atomicsSvg).paths.flatMap((path) => path.toShapes())
  ).translate(-50, -50, 0);
  return atomicsGeometry;
}

/** Tints laid over territories, oldest first so a later tint paints over an earlier one; each territory keeps the colour's outline. */
export function TerritoryTints({ board, tints }: Readonly<{ board: Board; tints: readonly TerritoryTint[] }>) {
  const faces = useMemo(
    () =>
      boardTerritories(board).map((face) => ({
        id: territoryId(board.properties[face.key].name),
        center: face.center,
        rings: face.rings,
      })),
    [board]
  );
  const geometries = useMemo(
    () =>
      new Map(faces.map((face) => [face.id, { fill: fillGeometry(face.rings), line: outlineGeometry(face.rings) }])),
    [faces]
  );
  useEffect(
    () => () => {
      for (const { fill, line } of geometries.values()) {
        fill.dispose();
        line.dispose();
      }
    },
    [geometries]
  );
  return (
    <group position={[0, 0.003, 0]}>
      {tints.map((tint, layer) =>
        faces
          .filter((face) => tint.territories.includes(face.id))
          .map((face) => {
            const shapes = geometries.get(face.id)!;
            const [x, z] = toTable(face.center);
            return (
              <group key={`${tint.id}:${face.id}`} position={[0, layer * 0.0005, 0]}>
                <mesh geometry={shapes.fill} raycast={ignoreRaycast} renderOrder={2}>
                  <meshBasicMaterial
                    color={tint.color}
                    transparent
                    opacity={0.5}
                    depthWrite={false}
                    side={DoubleSide}
                  />
                </mesh>
                <lineSegments geometry={shapes.line} raycast={ignoreRaycast} renderOrder={3}>
                  <lineBasicMaterial color={tint.color} transparent opacity={0.95} depthWrite={false} />
                </lineSegments>
                {tint.stamp === 'atomics' && (
                  <mesh
                    geometry={stampGeometry()}
                    position={[x, 0.004, z]}
                    rotation={[Math.PI / 2, 0, 0]}
                    scale={STAMP_SIZE / 100}
                    raycast={ignoreRaycast}
                    renderOrder={4}
                  >
                    <meshBasicMaterial color="#1d120b" transparent opacity={0.9} depthWrite={false} side={DoubleSide} />
                  </mesh>
                )}
              </group>
            );
          })
      )}
    </group>
  );
}
