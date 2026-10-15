/* @jsxImportSource ./three-jsx */
import { HMS_HEIGHT, HMS_OUTLINE } from '@shared/play/hms';
import type { TablePiece } from '@shared/play/model';
import { ExtrudeGeometry, Shape } from 'three';

/* A thin band of brass runs round the plate's edge, under the faction's colour, so a plate reads as one piece on any territory. */
const BRASS = '#c9a35f';
const RIM_HEIGHT = HMS_HEIGHT * 0.45;
const INSET = 0.035;

/** The teardrop as an extruded slab, its point along the piece's -z and its base on the table. */
function plateGeometry(inset: number, depth: number): ExtrudeGeometry {
  const shape = new Shape();
  HMS_OUTLINE.forEach(([x, z], index) => {
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
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/* Every plate shares the two slabs: they never change shape. */
const RIM = plateGeometry(0, RIM_HEIGHT);
const TOP = plateGeometry(INSET, HMS_HEIGHT);

/** The HMS: a flat teardrop in its faction's colour, standing on a brass rim. */
export function HmsPlate({ piece, renderOrder }: { piece: TablePiece; renderOrder: number }) {
  return (
    <group rotation={[0, piece.orientation, 0]}>
      <mesh geometry={RIM} renderOrder={renderOrder} castShadow receiveShadow>
        <meshStandardMaterial color={BRASS} roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh geometry={TOP} renderOrder={renderOrder} castShadow receiveShadow>
        <meshStandardMaterial color={piece.color} roughness={0.55} metalness={0.15} />
      </mesh>
    </group>
  );
}
