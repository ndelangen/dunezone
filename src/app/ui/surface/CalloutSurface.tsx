import { useElementSize } from '@mantine/hooks';
import type { ReactNode } from 'react';

import styles from './CalloutSurface.module.css';
import { PaintedSurfaceBoundary } from './Surface';

function roundedRectPath(x: number, y: number, width: number, height: number, radius: number): string {
  const right = x + width;
  const bottom = y + height;
  return [
    `M ${x + radius} ${y}`,
    `H ${right - radius}`,
    `A ${radius} ${radius} 0 0 1 ${right} ${y + radius}`,
    `V ${bottom - radius}`,
    `A ${radius} ${radius} 0 0 1 ${right - radius} ${bottom}`,
    `H ${x + radius}`,
    `A ${radius} ${radius} 0 0 1 ${x} ${bottom - radius}`,
    `V ${y + radius}`,
    `A ${radius} ${radius} 0 0 1 ${x + radius} ${y}`,
    'Z',
  ].join(' ');
}

function bottomRoundedRectPath(x: number, y: number, width: number, height: number, radius: number): string {
  const right = x + width;
  const bottom = y + height;
  return [
    `M ${x} ${y}`,
    `H ${right}`,
    `V ${bottom - radius}`,
    `A ${radius} ${radius} 0 0 1 ${right - radius} ${bottom}`,
    `H ${x + radius}`,
    `A ${radius} ${radius} 0 0 1 ${x} ${bottom - radius}`,
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
  const actionsTop = height - actionsHeight;
  const actionsRadius = Math.min(24, actionsWidth / 2, actionsHeight);
  const tipX = width / 2 + pointer[0];
  const tipY = height / 2 + pointer[1];
  const pointerAbove = pointer[1] < 0;
  const pointerBaseY = pointerAbove ? 1 : height - 1;
  const pointerBaseHalfWidth = Math.min(16, actionsWidth / 2);
  return [
    roundedRectPath(0, 0, width, contentHeight, capsuleRadius),
    bottomRoundedRectPath(actionsLeft, actionsTop, actionsWidth, actionsHeight, actionsRadius),
    `M ${width / 2 - pointerBaseHalfWidth} ${pointerBaseY}`,
    `L ${tipX} ${tipY}`,
    `L ${width / 2 + pointerBaseHalfWidth} ${pointerBaseY}`,
    'Z',
  ].join(' ');
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
