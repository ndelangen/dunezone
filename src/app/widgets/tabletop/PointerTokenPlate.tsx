/* @jsxImportSource ./three-jsx */

import type { TablePiece } from '@shared/play/model';
import { POINTER_BODY_RADIUS, POINTER_HEIGHT, POINTER_OUTLINE, POINTER_TIP } from '@shared/play/pointerToken';
import { ExtrudeGeometry, Shape, ShapeGeometry } from 'three';
import type { Texture } from 'three';

/* A thin band of brass runs round the plate's edge, under the faction's colour, so a plate reads as one piece on any territory. */
const BRASS = '#c9a35f';
const RIM_HEIGHT = POINTER_HEIGHT * 0.45;
const INSET = 0.035;

/** The teardrop drawn in the extrusion's plane, shrunk by `inset` towards the round end's centre. */
function plateShape(inset: number): Shape {
  const shape = new Shape();
  POINTER_OUTLINE.forEach(([x, z], index) => {
    const length = Math.hypot(x, z) || 1;
    const scale = Math.max(0, length - inset) / length;
    /* The extrusion is laid flat by turning it about x, which carries the shape's y to the table's -z. */
    if (index === 0) {
      shape.moveTo(x * scale, -z * scale);
    } else {
      shape.lineTo(x * scale, -z * scale);
    }
  });
  shape.closePath();
  return shape;
}

/** The teardrop as an extruded slab, its point along the piece's -z and its base on the table. */
function plateGeometry(inset: number, depth: number): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(plateShape(inset), { depth, bevelEnabled: false, curveSegments: 1 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/* Every plate shares the two slabs: they never change shape. */
const RIM = plateGeometry(0, RIM_HEIGHT);
const TOP = plateGeometry(INSET, POINTER_HEIGHT);

/*
 * The catalogue face is a square image with the teardrop clipped out of it, its point at the top edge and its round end on the bottom edge.
 * The top's own outline carries it, so the square spans the point to the round end's far side and any art outside the teardrop is cut away.
 */
const FACE_SIDE = POINTER_BODY_RADIUS + POINTER_TIP;
const FACE = (() => {
  const geometry = new ShapeGeometry(plateShape(INSET), 1);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < position.count; index += 1) {
    uv.setXY(
      index,
      (position.getX(index) + FACE_SIDE / 2) / FACE_SIDE,
      (position.getY(index) + POINTER_BODY_RADIUS) / FACE_SIDE
    );
  }
  geometry.rotateX(-Math.PI / 2);
  return geometry;
})();

/** A pointer token such as the HMS: a flat teardrop in its owner's colour on a brass rim, its face art printed on top once it has loaded. */
export function PointerTokenPlate({
  piece,
  face,
  renderOrder,
}: {
  piece: TablePiece;
  face: Texture | undefined;
  renderOrder: number;
}) {
  return (
    <group rotation={[0, piece.orientation, 0]}>
      <mesh geometry={RIM} renderOrder={renderOrder} castShadow receiveShadow>
        <meshStandardMaterial color={BRASS} roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh geometry={TOP} renderOrder={renderOrder} castShadow receiveShadow>
        <meshStandardMaterial color={piece.color} roughness={0.55} metalness={0.15} />
      </mesh>
      {face ? (
        <mesh geometry={FACE} position={[0, POINTER_HEIGHT + 0.002, 0]} renderOrder={renderOrder}>
          {/* Unlit like every other printed face on the table (#1756). */}
          <meshBasicMaterial map={face} transparent />
        </mesh>
      ) : null}
    </group>
  );
}
