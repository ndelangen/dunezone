/* @jsxImportSource ./three-jsx */

import { CENTER, RADIUS, retainedArrakisBoard } from '@shared/boards/geometry';
import type { Board, Point } from '@shared/boards/schema';
import { propertyId } from '@shared/boards/schema';
import { placeStickers } from '@shared/boards/stickerPlacement';
import { boardTerritories, boardTerritoryAt } from '@shared/boards/territories';
import type { OutlinePath } from '@shared/boards/tintOutline';
import { offRim, offsetPath, outerSegments, outlinePaths } from '@shared/boards/tintOutline';
import { tintOutlineOpacity } from '@shared/boards/tints';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import type { TerritoryTint, TintStamp } from '@shared/play/territoryTints';
import { tintPaint } from '@shared/play/territoryTints';
import { playUiColors } from '@shared/uiPalette';
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, ShapeGeometry, ShapeUtils, Vector2 } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { ignoreRaycast } from './ignoreRaycast';
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
  return property && { id: propertyId(property), name: property.name };
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

/* A filled territory's own outline, without the stretch along the board's rim. */
function outlineGeometry(rings: Point[][]) {
  const edges = rings.flatMap((ring) => ring.slice(1).map((to, i) => [ring[i], to] as const));
  const positions: number[] = [];
  for (const [from, to] of offRim(edges, CENTER, RADIUS)) {
    const [ax, az] = toTable(from);
    const [bx, bz] = toTable(to);
    positions.push(ax, 0, az, bx, 0, bz);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

/* Between the map (-3) and the storm's sector (-2), so the storm lies over the tints. */
const TINT_ORDER = { fill: -2.8, line: -2.6, stickerOutline: -2.4, stickerInk: -2.2 };
/*
 * The Polar Sink's paint is drawn again above the storm (-1), which would hide a tint there.
 * The storm never reaches the Polar Sink, so its tints draw above that paint, still before contact shadows (1).
 */
const POLAR_TINT_ORDER = { fill: -0.8, line: -0.6, stickerOutline: -0.4, stickerInk: -0.2 };
type TintOrder = typeof TINT_ORDER;

/* An outline-only tint's double line, in table units: each line's width, and the gap between the two. */
const DOUBLE_LINE_WIDTH = 0.012;
const DOUBLE_LINE_GAP = 0.012;

type Segment = readonly [Readonly<Point>, Readonly<Point>];
const edgeKey = ([a, b]: Segment) => [a.join(), b.join()].sort((x, y) => x.localeCompare(y)).join(' ');

/** Where each stretch of a double line goes: drawn at its own render order, or raised with the Polar Sink. */
type Bands = { rest: number[]; raised: number[] };

/**
 * A flat band between two sideways distances from a line, in quads from one corner to the next.
 * The offsets are worked out along the whole line, so its corners stay mitred where a raised stretch meets the rest.
 */
function bandAlong(bands: Bands, path: OutlinePath, raised: readonly boolean[], near: number, far: number) {
  const [inner, outer] = [offsetPath(path, near), offsetPath(path, far)];
  const corners = path.closed ? inner.length : inner.length - 1;
  for (let i = 0; i < corners; i++) {
    const j = (i + 1) % inner.length;
    const quad = [inner[i], outer[i], outer[j], inner[j]];
    const positions = raised[i] ? bands.raised : bands.rest;
    for (const index of [0, 1, 2, 0, 2, 3]) {
      positions.push(quad[index][0], 0, quad[index][1]);
    }
  }
}

function positionsGeometry(positions: number[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

/** Two bands along each line, one either side of it, so the outline reads as a double line; the stretches along `raisedEdges` come apart, to draw above the Polar Sink's paint. */
function doubleLineGeometries(segments: readonly Segment[], raisedEdges: ReadonlySet<string>) {
  const [inner, outer] = [DOUBLE_LINE_GAP / 2, DOUBLE_LINE_GAP / 2 + DOUBLE_LINE_WIDTH];
  const bands: Bands = { rest: [], raised: [] };
  for (const { points, closed } of outlinePaths(segments)) {
    const raised = points.map((point, i) => raisedEdges.has(edgeKey([point, points[(i + 1) % points.length]])));
    const path = { points: points.map(toTable), closed };
    bandAlong(bands, path, raised, inner, outer);
    bandAlong(bands, path, raised, -inner, -outer);
  }
  return { rest: positionsGeometry(bands.rest), raised: positionsGeometry(bands.raised) };
}

type Face = { id: string; center: Point; rings: Point[][]; polar: boolean };

/* The Polar Sink's own border, edge by edge, so an outline's stretches along it draw above the sink's paint. */
function polarEdges(faces: readonly Face[]) {
  return new Set(
    faces
      .filter((face) => face.polar)
      .flatMap((face) => face.rings.flatMap((ring) => ring.slice(1).map((to, i) => edgeKey([ring[i], to]))))
  );
}

/** An outline-only tint: one double line round its territories taken together, the borders between them and the board's rim left out. */
function TintOutline({ tint, faces }: Readonly<{ tint: TerritoryTint; faces: readonly Face[] }>) {
  const key = tint.territories.join(' ');
  const geometries = useMemo(() => {
    const ids = new Set(key.split(' '));
    const tinted = faces.filter((face) => ids.has(face.id));
    const { rest, raised } = doubleLineGeometries(
      offRim(outerSegments(tinted.map((face) => face.rings)), CENTER, RADIUS),
      polarEdges(tinted)
    );
    return [
      { geometry: rest, order: TINT_ORDER.line },
      { geometry: raised, order: POLAR_TINT_ORDER.line },
    ];
  }, [faces, key]);
  useEffect(
    () => () => {
      for (const { geometry } of geometries) {
        geometry.dispose();
      }
    },
    [geometries]
  );
  const color = tintPaint(tint.color).color;
  const opacity = tintOutlineOpacity(tint.color);
  return geometries.map(({ geometry, order }) => (
    <mesh key={order} geometry={geometry} raycast={ignoreRaycast} renderOrder={order}>
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={DoubleSide} />
    </mesh>
  ));
}

/* The largest a sticker gets, in table units, and the smallest it shrinks to in a cramped territory. */
const STICKER_LARGEST = 0.3;
const STICKER_SMALLEST = 0.14;
/* The board's glyph colours: near-black ink inside a pale outline. */
const STICKER_INK = playUiColors.annotationInk;
const STICKER_OUTLINE = playUiColors.annotationOutline;
/* The outline's width per unit of sticker size, drawn as copies of the shape nudged round a circle. */
const OUTLINE_WIDTH = 0.035;
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
function Stickers({
  tint,
  rings,
  center,
  order,
}: Readonly<{ tint: TerritoryTint; rings: Point[][]; center: Point; order: TintOrder }>) {
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
        <mesh geometry={outline} raycast={ignoreRaycast} renderOrder={order.stickerOutline}>
          <meshBasicMaterial color={STICKER_OUTLINE} transparent depthWrite={false} side={DoubleSide} />
        </mesh>
        <mesh geometry={ink} raycast={ignoreRaycast} renderOrder={order.stickerInk}>
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
  const paint = tintPaint(tint.color);
  const order = face.polar ? POLAR_TINT_ORDER : TINT_ORDER;
  return (
    <>
      {!tint.outline && (
        <>
          <mesh geometry={shapes.fill} raycast={ignoreRaycast} renderOrder={order.fill}>
            <meshBasicMaterial
              color={paint.color}
              transparent
              opacity={paint.opacity}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
          <lineSegments geometry={shapes.line} raycast={ignoreRaycast} renderOrder={order.line}>
            <lineBasicMaterial color={paint.color} transparent opacity={0.95} depthWrite={false} />
          </lineSegments>
        </>
      )}
      <Stickers tint={tint} rings={face.rings} center={face.center} order={order} />
    </>
  );
}

/** Tints laid over territories, oldest first so a later tint paints over an earlier one; each territory keeps the colour's outline, or the tint is one outline round them all. */
export function TerritoryTints({
  board = retainedArrakisBoard(),
  tints,
}: Readonly<{ board?: Board; tints: readonly TerritoryTint[] }>) {
  const faces = useMemo<Face[]>(
    () =>
      boardTerritories(board).map((face) => ({
        id: propertyId(board.properties[face.key]),
        center: face.center,
        rings: face.rings,
        polar: board.properties[face.key].type === 'polar',
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
