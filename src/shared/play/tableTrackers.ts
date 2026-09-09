import type { Vector3Tuple } from './model';
import { TABLE_SURFACE_Y } from './tableGeometry';

export type TrackerArcSlot = Readonly<{
  kind: 'spice' | 'turn' | 'phase';
  phaseIndex: number | null;
  arcRadius: number;
  radius: number;
  angle: number;
  position: Vector3Tuple;
}>;

export const TRACKER_ARC_CENTER_ANGLE = -Math.PI / 2;
export const TURN_TRACKER_SCALE = 4;
export const PHASE_TRACKER_SCALE = 2;
export const TRACKER_ARC_RADIUS = 5.85;
export const TRACKER_ARC_MAX_SPAN = Math.PI * 0.68;
export const TURN_TRACKER_RADIUS = 0.19 * TURN_TRACKER_SCALE;
export const PHASE_TRACKER_RADIUS = 0.13 * PHASE_TRACKER_SCALE;
export const TRACKER_EDGE_GAP = 0.045;
export const TRACKER_DISC_HEIGHT = 0.1;
export const TRACKER_DISC_CENTER_Y = TABLE_SURFACE_Y + TRACKER_DISC_HEIGHT / 2;
export const TRACKER_DISC_TOP_Y = TABLE_SURFACE_Y + TRACKER_DISC_HEIGHT;
export const TRACKER_DISC_FACE_Y = TRACKER_DISC_TOP_Y + 0.001;
export const TRACKER_DISC_CONTENT_Y = TRACKER_DISC_TOP_Y + 0.003;

function separationAngle(leftRadius: number, rightRadius: number, arcRadius: number): number {
  const centerDistance = leftRadius + TRACKER_EDGE_GAP + rightRadius;
  return 2 * Math.asin(centerDistance / (2 * arcRadius));
}

function angularHalfExtent(radius: number, arcRadius: number): number {
  return Math.asin(radius / arcRadius);
}

function provisionalAnglesFor(radii: readonly number[], arcRadius: number): number[] {
  const angles = radii.map((radius, index) => {
    if (index === 0) {
      return 0;
    }
    return separationAngle(radii[index - 1], radius, arcRadius);
  });

  for (let index = 1; index < angles.length; index += 1) {
    angles[index] += angles[index - 1];
  }
  return angles;
}

function angularBounds(
  radii: readonly number[],
  provisionalAngles: readonly number[],
  arcRadius: number
): [lower: number, upper: number] {
  return [
    Math.min(...provisionalAngles.map((angle, index) => angle - angularHalfExtent(radii[index], arcRadius))),
    Math.max(...provisionalAngles.map((angle, index) => angle + angularHalfExtent(radii[index], arcRadius))),
  ];
}

function arcRadiusFor(radii: readonly number[]): number {
  const spanAt = (arcRadius: number) => {
    const angles = provisionalAnglesFor(radii, arcRadius);
    const [lower, upper] = angularBounds(radii, angles, arcRadius);
    return upper - lower;
  };

  if (spanAt(TRACKER_ARC_RADIUS) <= TRACKER_ARC_MAX_SPAN) {
    return TRACKER_ARC_RADIUS;
  }

  let lower = TRACKER_ARC_RADIUS;
  let upper = lower * 2;
  while (spanAt(upper) > TRACKER_ARC_MAX_SPAN) {
    upper *= 2;
  }
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (spanAt(middle) > TRACKER_ARC_MAX_SPAN) {
      lower = middle;
    } else {
      upper = middle;
    }
  }
  return upper;
}

export function trackerArcSlots(phaseCount: number): TrackerArcSlot[] {
  if (!Number.isInteger(phaseCount) || phaseCount < 0) {
    throw new RangeError('Phase count must be a non-negative integer.');
  }

  const radii = [
    PHASE_TRACKER_RADIUS,
    TURN_TRACKER_RADIUS,
    ...Array.from({ length: phaseCount }, () => PHASE_TRACKER_RADIUS),
  ];
  const arcRadius = arcRadiusFor(radii);
  const provisionalAngles = provisionalAnglesFor(radii, arcRadius);
  const [lowerBound, upperBound] = angularBounds(radii, provisionalAngles, arcRadius);
  const centerOffset = TRACKER_ARC_CENTER_ANGLE - (lowerBound + upperBound) / 2;

  return provisionalAngles.map((provisionalAngle, index) => {
    const angle = provisionalAngle + centerOffset;
    return {
      kind: index === 0 ? 'spice' : index === 1 ? 'turn' : 'phase',
      phaseIndex: index < 2 ? null : index - 2,
      arcRadius,
      radius: radii[index],
      angle,
      position: [Math.cos(angle) * arcRadius, TABLE_SURFACE_Y, Math.sin(angle) * arcRadius],
    };
  });
}
