import { useElementSize } from '@mantine/hooks';
import type { ReactNode } from 'react';

import styles from './CalloutSurface.module.css';
import { PaintedSurfaceBoundary } from './Surface';

type RoundedPoint = readonly [x: number, y: number, radius: number];

function pointToward(from: RoundedPoint, to: RoundedPoint, distance: number): [number, number] {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (length === 0) {
    return [from[0], from[1]];
  }
  const ratio = Math.min(distance, length / 2) / length;
  return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio];
}

function roundedOutline(points: readonly RoundedPoint[]): string {
  const corner = (index: number) => {
    const previous = points.at(index - 1) ?? points.at(-1)!;
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    return {
      entry: pointToward(current, previous, current[2]),
      point: current,
      exit: pointToward(current, next, current[2]),
    };
  };
  const first = corner(0);
  return [
    `M ${first.exit[0]} ${first.exit[1]}`,
    ...points.slice(1).flatMap((_, index) => {
      const next = corner(index + 1);
      return [
        `L ${next.entry[0]} ${next.entry[1]}`,
        `Q ${next.point[0]} ${next.point[1]} ${next.exit[0]} ${next.exit[1]}`,
      ];
    }),
    `L ${first.entry[0]} ${first.entry[1]}`,
    `Q ${first.point[0]} ${first.point[1]} ${first.exit[0]} ${first.exit[1]}`,
    'Z',
  ].join(' ');
}

function calloutPath(
  width: number,
  height: number,
  contentHeight: number,
  actionsWidth: number,
  actionsHeight: number,
  pointer: [number, number]
): string {
  if (width === 0 || height === 0 || contentHeight === 0 || actionsWidth === 0 || actionsHeight === 0) {
    return '';
  }
  const capsuleRadius = Math.min(width / 2, contentHeight / 2);
  const actionsLeft = (width - actionsWidth) / 2;
  const actionsRadius = Math.min(24, actionsWidth / 2, actionsHeight);
  const shoulderRadius = Math.min(12, (width - actionsWidth) / 4, actionsHeight / 2);
  const tipX = width / 2 + pointer[0];
  const tipY = height / 2 + pointer[1];
  const pointerAbove = pointer[1] < 0;
  const pointerBaseY = pointerAbove ? 0 : height;
  const pointerBaseHalfWidth = Math.min(64, actionsWidth / 2 - actionsRadius);
  const pointerBaseRadius = Math.min(10, pointerBaseHalfWidth / 4);
  const pointerTipRadius = 4;
  const capsule: RoundedPoint[] = [
    [0, 0, capsuleRadius],
    [width, 0, capsuleRadius],
    [width, contentHeight, capsuleRadius],
  ];
  const action: RoundedPoint[] = [
    [actionsLeft + actionsWidth, contentHeight, shoulderRadius],
    [actionsLeft + actionsWidth, height, actionsRadius],
  ];
  const pointerPoints: RoundedPoint[] = [
    [width / 2 + pointerBaseHalfWidth, pointerBaseY, pointerBaseRadius],
    [tipX, tipY, pointerTipRadius],
    [width / 2 - pointerBaseHalfWidth, pointerBaseY, pointerBaseRadius],
  ];
  const remainder: RoundedPoint[] = [
    [actionsLeft, height, actionsRadius],
    [actionsLeft, contentHeight, shoulderRadius],
    [0, contentHeight, capsuleRadius],
  ];
  return roundedOutline(
    pointerAbove
      ? [capsule[0]!, ...[...pointerPoints].reverse(), capsule[1]!, capsule[2]!, ...action, ...remainder]
      : [...capsule, ...action, ...pointerPoints, ...remainder]
  );
}

/** Callers supply content and actions; this pane owns the capsule and attached lower tab. */
export function CalloutSurface({
  children,
  actions,
  pointer,
}: {
  children: ReactNode;
  actions: ReactNode;
  pointer?: [number, number];
}) {
  const { ref, width, height } = useElementSize();
  const { ref: contentRef, height: contentHeight } = useElementSize();
  const { ref: actionsRef, width: actionsWidth, height: actionsHeight } = useElementSize();
  const tip = pointer ?? [0, height / 2 + 26];
  return (
    <PaintedSurfaceBoundary>
      <div className={styles.root} ref={ref}>
        <svg className={styles.shape} width={width} height={height} aria-hidden="true">
          <path d={calloutPath(width, height, contentHeight, actionsWidth, actionsHeight, tip)} />
        </svg>
        <div className={styles.content} ref={contentRef}>
          {children}
        </div>
        <div className={styles.actions} ref={actionsRef}>
          {actions}
        </div>
      </div>
    </PaintedSurfaceBoundary>
  );
}
