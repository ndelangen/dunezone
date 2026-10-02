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
export const TRACKER_DISC_HEIGHT = 0.025;
export const TRACKER_DISC_TOP_Y = TABLE_SURFACE_Y + TRACKER_DISC_HEIGHT;
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

/* The standard turn's nine phases fix the arc: the Spice Bank and turn discs never move, whatever a game adds (#1138). */
const STANDARD_PHASE_COUNT = 9;

/**
 * The tracker arc: the Spice Bank, the turn disc, then one disc per phase of the turn.
 * The layout of the standard nine is fixed.
 * A composed turn keeps the Spice Bank and turn discs where they are, and refits its phase discs evenly into the span the standard nine cover, shrinking them only when they would otherwise touch.
 */
export function trackerArcSlots(phaseCount: number): TrackerArcSlot[] {
  if (!Number.isInteger(phaseCount) || phaseCount < 0) {
    throw new RangeError('Phase count must be a non-negative integer.');
  }
  const standard = standardArcSlots(STANDARD_PHASE_COUNT);
  if (phaseCount === STANDARD_PHASE_COUNT) {
    return standard;
  }
  const pinned = standard.slice(0, 2);
  const phaseSlots = standard.slice(2);
  const { arcRadius } = pinned[0]!;
  const first = phaseSlots[0]!;
  const last = phaseSlots[phaseSlots.length - 1]!;
  const direction = Math.sign(last.angle - first.angle) || 1;
  const halfExtent = angularHalfExtent(PHASE_TRACKER_RADIUS, arcRadius);
  const start = first.angle - direction * halfExtent;
  const span = Math.abs(last.angle - first.angle) + 2 * halfExtent;
  const pitch = phaseCount > 0 ? span / phaseCount : 0;
  const halfChord = arcRadius * Math.sin(pitch / 2);
  /* A very long turn gives up the edge gap before a disc could shrink to nothing. */
  const radius = Math.min(PHASE_TRACKER_RADIUS, Math.max(halfChord - TRACKER_EDGE_GAP / 2, halfChord * 0.8));
  return [
    ...pinned,
    ...Array.from({ length: phaseCount }, (_, phaseIndex): TrackerArcSlot => {
      const angle = start + direction * pitch * (phaseIndex + 0.5);
      return {
        kind: 'phase',
        phaseIndex,
        arcRadius,
        radius,
        angle,
        position: [Math.cos(angle) * arcRadius, TABLE_SURFACE_Y, Math.sin(angle) * arcRadius],
      };
    }),
  ];
}

function standardArcSlots(phaseCount: number): TrackerArcSlot[] {
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
