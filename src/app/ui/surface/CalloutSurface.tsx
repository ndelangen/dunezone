import { useElementSize } from '@mantine/hooks';
import type { ReactNode } from 'react';

import styles from './CalloutSurface.module.css';
import { PaintedSurfaceBoundary } from './Surface';

type RoundedPoint = readonly [x: number, y: number, tangentDistance: number];

function roundedOutline(points: readonly RoundedPoint[]): string {
  const corners = points.map((current, index) => {
    const previous = points.at(index - 1) ?? points.at(-1)!;
    const next = points[(index + 1) % points.length]!;
    const previousLength = Math.hypot(previous[0] - current[0], previous[1] - current[1]);
    const nextLength = Math.hypot(next[0] - current[0], next[1] - current[1]);
    if (previousLength === 0 || nextLength === 0 || current[2] === 0) {
      return {
        current,
        towardPrevious: [0, 0] as const,
        towardNext: [0, 0] as const,
        tangent: 0,
        tangentDistance: 0,
        sweep: 0,
      };
    }
    const towardPrevious = [
      (previous[0] - current[0]) / previousLength,
      (previous[1] - current[1]) / previousLength,
    ] as const;
    const towardNext = [(next[0] - current[0]) / nextLength, (next[1] - current[1]) / nextLength] as const;
    const dot = Math.max(-1, Math.min(1, towardPrevious[0] * towardNext[0] + towardPrevious[1] * towardNext[1]));
    const angle = Math.acos(dot);
    const tangent = Math.tan(angle / 2);
    const incoming = [-towardPrevious[0], -towardPrevious[1]] as const;
    const cross = incoming[0] * towardNext[1] - incoming[1] * towardNext[0];
    if (Math.abs(cross) < 1e-6 || !Number.isFinite(tangent) || tangent === 0) {
      return {
        current,
        towardPrevious,
        towardNext,
        tangent: 0,
        tangentDistance: 0,
        sweep: 0,
      };
    }
    return {
      current,
      towardPrevious,
      towardNext,
      tangent,
      tangentDistance: Math.min(current[2], previousLength, nextLength),
      sweep: cross > 0 ? 1 : 0,
    };
  });

  for (const [index, current] of corners.entries()) {
    const next = corners[(index + 1) % corners.length]!;
    const edgeLength = Math.hypot(next.current[0] - current.current[0], next.current[1] - current.current[1]);
    const usedLength = current.tangentDistance + next.tangentDistance;
    if (usedLength > edgeLength) {
      const scale = edgeLength / usedLength;
      current.tangentDistance *= scale;
      next.tangentDistance *= scale;
    }
  }

  const corner = (index: number) => {
    const { current, towardPrevious, towardNext, tangent, tangentDistance, sweep } = corners[index]!;
    return {
      entry: [
        current[0] + towardPrevious[0] * tangentDistance,
        current[1] + towardPrevious[1] * tangentDistance,
      ] as const,
      exit: [current[0] + towardNext[0] * tangentDistance, current[1] + towardNext[1] * tangentDistance] as const,
      radius: tangentDistance * tangent,
      sweep,
    };
  };
  const first = corner(0);
  return [
    `M ${first.exit[0]} ${first.exit[1]}`,
    ...points.slice(1).flatMap((_, index) => {
      const next = corner(index + 1);
      return [
        `L ${next.entry[0]} ${next.entry[1]}`,
        next.radius === 0
          ? `L ${next.exit[0]} ${next.exit[1]}`
          : `A ${next.radius} ${next.radius} 0 0 ${next.sweep} ${next.exit[0]} ${next.exit[1]}`,
      ];
    }),
    `L ${first.entry[0]} ${first.entry[1]}`,
    first.radius === 0
      ? `L ${first.exit[0]} ${first.exit[1]}`
      : `A ${first.radius} ${first.radius} 0 0 ${first.sweep} ${first.exit[0]} ${first.exit[1]}`,
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
  const pointerBaseHalfWidth = Math.min(40, actionsWidth / 2 - actionsRadius);
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
