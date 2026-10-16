/* @jsxImportSource ./three-jsx */
import { CENTER, RADIUS } from '@shared/boards/geometry';
import type { Board, Point } from '@shared/boards/schema';
import { territoryId } from '@shared/boards/schema';
import { boardTerritories, boardTerritoryAt } from '@shared/boards/territories';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import type { TerritoryTint, TintStamp } from '@shared/play/territoryTints';
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, ShapeGeometry, ShapeUtils, Vector2 } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { ignoreRaycast } from './ignoreRaycast';
import { placeStickers } from './stickerPlacement';
import { outerSegments } from './tintOutline';
import { TINT_STICKERS } from './tintStickers';

/* Board drawing units run across the board's circle; the table's board disc is BOARD_RADIUS wide. */
function toTable([x, y]: Readonly<Point>): [number, number] {
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

/* How wide an outline-only tint's line is, in table units. */
const RIBBON_WIDTH = 0.045;

/** A flat band along each segment, a little past both ends so the corners between them close. */
function ribbonGeometry(segments: readonly (readonly [Readonly<Point>, Readonly<Point>])[]) {
  const half = RIBBON_WIDTH / 2;
  const positions: number[] = [];
  for (const [from, to] of segments) {
    const [ax, az] = toTable(from);
    const [bx, bz] = toTable(to);
    const length = Math.hypot(bx - ax, bz - az) || 1;
    const [ux, uz] = [((bx - ax) / length) * half, ((bz - az) / length) * half];
    const [sx, sz, ex, ez] = [ax - ux, az - uz, bx + ux, bz + uz];
    const corners = [
      [sx - uz, sz + ux],
      [sx + uz, sz - ux],
      [ex + uz, ez - ux],
      [ex - uz, ez + ux],
    ];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      positions.push(corners[index][0], 0, corners[index][1]);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

type Face = { id: string; center: Point; rings: Point[][] };

/** An outline-only tint: one line round its territories taken together, the borders between them left out. */
function TintOutline({ tint, faces }: Readonly<{ tint: TerritoryTint; faces: readonly Face[] }>) {
  const key = tint.territories.join(' ');
  const geometry = useMemo(() => {
    const ids = new Set(key.split(' '));
    return ribbonGeometry(outerSegments(faces.filter((face) => ids.has(face.id)).map((face) => face.rings)));
  }, [faces, key]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} raycast={ignoreRaycast} renderOrder={3}>
      <meshBasicMaterial color={tint.color} transparent depthWrite={false} side={DoubleSide} />
    </mesh>
  );
}

/* The largest a sticker gets, in table units, and the smallest it shrinks to in a cramped territory. */
const STICKER_LARGEST = 0.4;
const STICKER_SMALLEST = 0.18;
/* The board's glyph colours: near-black ink inside a pale outline. */
const STICKER_INK = '#1a0b00';
const STICKER_OUTLINE = '#fffed8';
/* The outline's width per unit of sticker size, drawn as copies of the shape nudged round a circle. */
const OUTLINE_WIDTH = 0.07;
const OUTLINE_STEPS = 16;

type StickerShapes = { ink: BufferGeometry; outline: BufferGeometry };
const stickerShapes = new Map<TintStamp, StickerShapes>();

/* Each sticker's artwork, centred and scaled to one unit across its longer side; made once and shared by every territory. */
function stickerGeometry(stamp: TintStamp): StickerShapes {
  let shapes = stickerShapes.get(stamp);
  if (!shapes) {
    const ink = new ShapeGeometry(
      new SVGLoader().parse(TINT_STICKERS[stamp].svg).paths.flatMap((path) => path.toShapes())
    );
    ink.computeBoundingBox();
    const box = ink.boundingBox!;
    const scale = 1 / Math.max(box.max.x - box.min.x, box.max.y - box.min.y);
    ink.translate(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, 0).scale(scale, scale, 1);
    const outline = mergeGeometries(
      Array.from({ length: OUTLINE_STEPS }, (_, step) => {
        const angle = (step / OUTLINE_STEPS) * Math.PI * 2;
        return ink.clone().translate(Math.cos(angle) * OUTLINE_WIDTH, Math.sin(angle) * OUTLINE_WIDTH, 0);
      })
    );
    shapes = { ink, outline };
    stickerShapes.set(stamp, shapes);
  }
  return shapes;
}

type Placement = ReturnType<typeof placeStickers>;
const placements = new WeakMap<Point[][], Map<number, Placement>>();

/* Where a territory's stickers sit, in table units; worked out once per territory and sticker count. */
function stickerPlacement(rings: Point[][], count: number) {
  let byCount = placements.get(rings);
  if (!byCount) {
    byCount = new Map();
    placements.set(rings, byCount);
  }
  let placement = byCount.get(count);
  if (!placement) {
    placement = placeStickers(
      rings.map((ring) => ring.map(toTable)),
      count,
      STICKER_LARGEST
    );
    byCount.set(count, placement);
  }
  return placement;
}

/* Transparent like the tints beneath, so they draw after the board rather than under it. */
/** A tint's stickers on one territory, black on a pale outline, each where the territory has the most room for it. */
function Stickers({ tint, rings, center }: Readonly<{ tint: TerritoryTint; rings: Point[][]; center: Point }>) {
  const stamps = tint.stamps ?? [];
  if (!stamps.length) {
    return null;
  }
  const { at, size: fitted } = stickerPlacement(rings, stamps.length);
  const size = Math.max(STICKER_SMALLEST, fitted);
  return stamps.map((stamp, index) => {
    const [x, z] = at[index] ?? toTable(center);
    const { ink, outline } = stickerGeometry(stamp);
    return (
      <group key={stamp} position={[x, 0.004, z]} rotation={[Math.PI / 2, 0, 0]} scale={size}>
        <mesh geometry={outline} raycast={ignoreRaycast} renderOrder={4}>
          <meshBasicMaterial color={STICKER_OUTLINE} transparent depthWrite={false} side={DoubleSide} />
        </mesh>
        <mesh geometry={ink} raycast={ignoreRaycast} renderOrder={5}>
          <meshBasicMaterial color={STICKER_INK} transparent depthWrite={false} side={DoubleSide} />
        </mesh>
      </group>
    );
  });
}

/** One territory of a tint: filled with an outline of its own, or only its stickers when the tint is outline-only. */
function TintedTerritory({
  tint,
  face,
  shapes,
}: Readonly<{ tint: TerritoryTint; face: Face; shapes: { fill: BufferGeometry; line: BufferGeometry } }>) {
  return (
    <>
      {!tint.outline && (
        <>
          <mesh geometry={shapes.fill} raycast={ignoreRaycast} renderOrder={2}>
            <meshBasicMaterial color={tint.color} transparent opacity={0.5} depthWrite={false} side={DoubleSide} />
          </mesh>
          <lineSegments geometry={shapes.line} raycast={ignoreRaycast} renderOrder={3}>
            <lineBasicMaterial color={tint.color} transparent opacity={0.95} depthWrite={false} />
          </lineSegments>
        </>
      )}
      <Stickers tint={tint} rings={face.rings} center={face.center} />
    </>
  );
}

/** Tints laid over territories, oldest first so a later tint paints over an earlier one; each territory keeps the colour's outline, or the tint is one outline round them all. */
export function TerritoryTints({ board, tints }: Readonly<{ board: Board; tints: readonly TerritoryTint[] }>) {
  const faces = useMemo<Face[]>(
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
      {tints.map(
        (tint, layer) =>
          !tint.hidden && (
            <group key={tint.id} position={[0, layer * 0.0005, 0]}>
              {tint.outline && <TintOutline tint={tint} faces={faces} />}
              {faces
                .filter((face) => tint.territories.includes(face.id))
                .map((face) => (
                  <TintedTerritory key={face.id} tint={tint} face={face} shapes={geometries.get(face.id)!} />
                ))}
            </group>
          )
      )}
    </group>
  );
}
