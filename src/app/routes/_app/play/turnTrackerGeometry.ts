import { ExtrudeGeometry, Path, Shape } from 'three';

const TURN_TRACKER_SECTOR_COUNT = 10;
const SECTOR_ANGLE = (Math.PI * 2) / TURN_TRACKER_SECTOR_COUNT;
const HUB_RADIUS = 0.26;
const NUMBER_RADIUS = 0.69;

type TrackerState = Readonly<{ radius: number; turn: number }>;
type TrackerLayout = ReturnType<typeof turnTrackerLayout>;
type LocalPoint = Readonly<{ x: number; z: number }>;
type PolarPoint = Readonly<{ radius: number; angle: number }>;
type Annulus = Readonly<{ outerRadius: number; innerRadius: number }>;
type Relief = Readonly<{ depth: number; floor: number }>;

function assertRadius(radius: number) {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError('The turn tracker radius must be positive and finite.');
  }
}

function blockStart(turn: number): number {
  if (!Number.isSafeInteger(turn) || turn < 1) {
    throw new RangeError('The turn must be a positive safe integer.');
  }
  return Math.floor((turn - 1) / TURN_TRACKER_SECTOR_COUNT) * TURN_TRACKER_SECTOR_COUNT + 1;
}

function radialPoint({ radius, angle }: PolarPoint): [number, number] {
  return [Math.sin(angle) * radius, -Math.cos(angle) * radius];
}

export function turnTrackerLayout({ radius, turn }: TrackerState) {
  assertRadius(radius);
  const firstTurn = blockStart(turn);
  return {
    radius,
    firstTurn,
    selectedIndex: turn - firstTurn,
    pointerAngle: (turn - firstTurn + 0.5) * SECTOR_ANGLE,
    sectors: Array.from({ length: TURN_TRACKER_SECTOR_COUNT }, (_, index) => {
      const value = firstTurn + index;
      const angle = (index + 0.5) * SECTOR_ANGLE;
      const [x, z] = radialPoint({ radius: radius * NUMBER_RADIUS, angle });
      return {
        turn: Number.isSafeInteger(value) ? value : null,
        angle,
        position: [x, 0.019, z] as [number, number, number],
      };
    }),
  };
}

export function turnAtTrackerPoint({ radius, firstTurn }: TrackerLayout, { x, z }: LocalPoint): number | null {
  const distance = Math.hypot(x, z);
  if (!Number.isFinite(distance)) {
    return null;
  }
  if (distance < radius * HUB_RADIUS) {
    return null;
  }
  if (distance > radius) {
    return null;
  }
  const angle = (Math.atan2(x, -z) + Math.PI * 2) % (Math.PI * 2);
  const selected = firstTurn + Math.min(TURN_TRACKER_SECTOR_COUNT - 1, Math.floor(angle / SECTOR_ANGLE));
  return Number.isSafeInteger(selected) ? selected : null;
}

function ring({ outerRadius, innerRadius }: Annulus): Shape {
  const shape = new Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
  const hole = new Path();
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

function aboveDisc(shapes: Shape | Shape[], { depth, floor }: Relief): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 64, steps: 1 });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, floor + depth, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createTurnTrackerFrame({ radius }: TrackerLayout): ExtrudeGeometry {
  const shapes = [
    ring({ outerRadius: radius * 0.95, innerRadius: radius * 0.925 }),
    ring({ outerRadius: radius * HUB_RADIUS, innerRadius: radius * 0.238 }),
  ];
  for (let index = 0; index < TURN_TRACKER_SECTOR_COUNT; index++) {
    const angle = index * SECTOR_ANGLE;
    const [innerX, innerZ] = radialPoint({ radius: radius * HUB_RADIUS, angle });
    const [outerX, outerZ] = radialPoint({ radius: radius * 0.925, angle });
    const offsetX = Math.cos(angle) * radius * 0.007;
    const offsetZ = Math.sin(angle) * radius * 0.007;
    const spoke = new Shape();
    spoke.moveTo(innerX - offsetX, innerZ - offsetZ);
    spoke.lineTo(outerX - offsetX, outerZ - offsetZ);
    spoke.lineTo(outerX + offsetX, outerZ + offsetZ);
    spoke.lineTo(innerX + offsetX, innerZ + offsetZ);
    spoke.closePath();
    shapes.push(spoke);
  }
  return aboveDisc(shapes, { depth: 0.006, floor: 0.006 });
}

export function createTurnTrackerWedge({ radius, selectedIndex }: TrackerLayout): ExtrudeGeometry {
  const start = selectedIndex * SECTOR_ANGLE - Math.PI / 2;
  const end = start + SECTOR_ANGLE;
  const shape = new Shape();
  shape.absarc(0, 0, radius * 0.925, start, end, false);
  shape.absarc(0, 0, radius * HUB_RADIUS, end, start, true);
  shape.closePath();
  return aboveDisc(shape, { depth: 0.001, floor: 0.003 });
}

export function createTurnTrackerPointer({ radius }: TrackerLayout): ExtrudeGeometry {
  const shape = new Shape();
  shape.moveTo(-radius * 0.075, radius * 0.09);
  shape.lineTo(0, -radius * 0.49);
  shape.lineTo(radius * 0.075, radius * 0.09);
  shape.closePath();
  return aboveDisc(shape, { depth: 0.01, floor: 0.02 });
}
