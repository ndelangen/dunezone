/* @jsxImportSource ./three-jsx */
/* MOCKUP ONLY: renders territory tints from window.__tints for design screenshots. Not for merge. */
import { arrakisBoard, CENTER, RADIUS } from '@shared/boards/geometry';
import type { Board } from '@shared/boards/schema';
import { boardTerritories } from '@shared/boards/territories';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, ShapeGeometry, ShapeUtils, Vector2 } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

import atomicsSvg from '../../../../media/vector/decal/atomics.svg?raw';

type Tint = { color: string; names: string[]; icon?: 'atomics'; outline?: boolean };
declare global {
  interface Window {
    __tints?: Tint[];
  }
}


function toTable([x, y]: [number, number] | number[]) {
  return [((x - CENTER[0]) / RADIUS) * BOARD_RADIUS, ((y - CENTER[1]) / RADIUS) * BOARD_RADIUS] as const;
}

function faceGeometry(rings: number[][][]) {
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

function outlineGeometry(rings: number[][][]) {
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

const stampShapes = new SVGLoader().parse(atomicsSvg).paths.flatMap((path) => SVGLoader.createShapes(path));
function Stamp({ at }: { at: [number, number] }) {
  const geometry = useMemo(() => new ShapeGeometry(stampShapes), []);
  const [x, z] = toTable(at);
  const size = 0.6 / 100;
  return (
    <mesh
      geometry={geometry}
      position={[x - 0.3, 0.004, z - 0.3]}
      rotation={[Math.PI / 2, 0, 0]}
      scale={[size, size, size]}
      raycast={() => {}}
      renderOrder={4}
    >
      <meshBasicMaterial color="#1d120b" transparent opacity={0.9} depthWrite={false} side={DoubleSide} />
    </mesh>
  );
}

export function TerritoryTintsMock({ board }: { board?: Board }) {
  const definition = useMemo(() => board ?? arrakisBoard(), [board]);
  const tints = typeof window === 'undefined' ? [] : (window.__tints ?? []);
  const faces = useMemo(() => boardTerritories(definition), [definition]);
  const layers = useMemo(
    () =>
      tints.flatMap((tint, layer) =>
        faces
          .filter((face) => tint.names.includes(definition.properties[face.key].name.toLowerCase()))
          .map((face) => ({
            key: `${layer}:${face.key}`,
            layer,
            tint,
            center: face.center as [number, number],
            fill: faceGeometry(face.rings as number[][][]),
            line: outlineGeometry(face.rings as number[][][]),
          }))
      ),
    [faces, definition, tints]
  );
  return (
    <group position={[0, 0.003, 0]}>
      {layers.map(({ key, layer, tint, fill, line, center }) => (
        <group key={key} position={[0, layer * 0.0005, 0]}>
          <mesh geometry={fill} raycast={() => {}} renderOrder={2}>
            <meshBasicMaterial color={tint.color} transparent opacity={0.5} depthWrite={false} side={DoubleSide} />
          </mesh>
          <lineSegments geometry={line} renderOrder={3} raycast={() => {}}>
            <lineBasicMaterial color={tint.color} transparent opacity={0.95} depthWrite={false} />
          </lineSegments>
          {tint.icon && <Stamp at={center} />}
        </group>
      ))}
    </group>
  );
}
