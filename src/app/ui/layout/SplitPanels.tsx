import { Children, isValidElement, useId, useLayoutEffect, useReducer, useRef } from 'react';
import type {
  AriaAttributes,
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  PropsWithChildren,
  ReactNode,
} from 'react';

import styles from './SplitPanels.module.css';
import { warnDroppedChild } from './warnDroppedChild';

const SPLIT_PANELS_SLOTS = ['SplitPanels.First', 'SplitPanels.Second'] as const;

function First(_: PropsWithChildren): null {
  return null;
}

function Second(_: PropsWithChildren): null {
  return null;
}

/** The smallest and largest size of the primary panel, in percent of the room both panels share. */
export type SplitLimits = Readonly<{ min: number; max: number }>;

type SplitPanelsProps = PropsWithChildren<{
  /** The separator's orientation, as ARIA names it: `vertical` sets the panels side by side, `horizontal` stacks them. */
  orientation: NonNullable<AriaAttributes['aria-orientation']>;
  /** The panel whose size the separator reports and the limits bound. */
  primary?: 'first' | 'second';
  /** The primary panel's size before the reader moves the separator, in percent. */
  defaultSize: number;
  /**
   * The limits for the room both panels share, given in pixels along the split.
   * Called again whenever that room changes, so pass a stable function.
   */
  limits: (room: number) => SplitLimits;
  /** How far an arrow key moves the separator, in percent. */
  step: number;
  /** How far Page Up and Page Down grow and shrink the primary panel, in percent. */
  pageStep: number;
  /** The separator's accessible name. */
  label: string;
  /** Words for the primary panel's size, when a bare percentage would not say what it measures. */
  valueText?: (size: number) => string;
}>;

type Orientation = SplitPanelsProps['orientation'];

type SplitState = Readonly<{ size: number; limits: SplitLimits; pointerId: number | null }>;

type SplitEvent =
  | { type: 'limit.changed'; limits: SplitLimits }
  | { type: 'capture.started'; pointerId: number; size: number }
  | { type: 'pointer.moved'; pointerId: number; size: number }
  | { type: 'capture.ended'; pointerId: number }
  | { type: 'key.pressed'; size: number };

function clamp(size: number, { min, max }: SplitLimits): number {
  return Math.min(max, Math.max(min, size));
}

function reduceSplit(state: SplitState, event: SplitEvent): SplitState {
  switch (event.type) {
    case 'limit.changed':
      if (event.limits.min === state.limits.min && event.limits.max === state.limits.max) {
        return state;
      }
      return { ...state, limits: event.limits, size: clamp(state.size, event.limits) };
    case 'capture.started':
      if (state.pointerId !== null) {
        return state;
      }
      return { ...state, pointerId: event.pointerId, size: clamp(event.size, state.limits) };
    case 'pointer.moved':
      if (state.pointerId !== event.pointerId) {
        return state;
      }
      return { ...state, size: clamp(event.size, state.limits) };
    case 'capture.ended':
      if (state.pointerId !== event.pointerId) {
        return state;
      }
      return { ...state, pointerId: null };
    case 'key.pressed':
      return { ...state, size: clamp(event.size, state.limits) };
  }
}

/** The arrow that moves the separator toward the end of the split, and the one that moves it back. */
const ARROWS = {
  vertical: { forward: 'ArrowRight', back: 'ArrowLeft' },
  horizontal: { forward: 'ArrowDown', back: 'ArrowUp' },
} as const satisfies Record<Orientation, { forward: string; back: string }>;

type KeySettings = Pick<Required<SplitPanelsProps>, 'orientation' | 'primary' | 'step' | 'pageStep'>;

/**
 * The primary panel's size a key asks for, or null when the key is not the separator's.
 * Arrows move the separator where they point;
 * Page Up and Page Down grow and shrink the primary panel;
 * Home and End take it to its limits.
 */
function sizeForKey(key: string, state: SplitState, { orientation, primary, step, pageStep }: KeySettings) {
  const forward = primary === 'first' ? step : -step;
  switch (key) {
    case ARROWS[orientation].forward:
      return state.size + forward;
    case ARROWS[orientation].back:
      return state.size - forward;
    case 'PageUp':
      return state.size + pageStep;
    case 'PageDown':
      return state.size - pageStep;
    case 'Home':
      return state.limits.min;
    case 'End':
      return state.limits.max;
    default:
      return null;
  }
}

function lengthOf(box: DOMRect, orientation: Orientation): number {
  return orientation === 'vertical' ? box.width : box.height;
}

/** One decimal is as fine as a reader can hear or a screen can show. */
function tenths(size: number): number {
  return Number(size.toFixed(1));
}

/**
 * Two panels either side of a separator the reader drags, or steps with the keys.
 * Callers own the two panels, the limits and the steps;
 * this owns the split: the gesture, the keys, the separator's look, and stacking side-by-side panels once its container is too narrow for both.
 * Only the primary button and one pointer move the separator, and while it moves neither panel takes the pointer.
 * It fills the box its parent gives it, and its panels are positioned, so absolutely placed content fills a panel.
 */
function SplitPanelsBase({
  orientation,
  primary = 'first',
  defaultSize,
  limits,
  step,
  pageStep,
  label,
  valueText,
  children,
}: SplitPanelsProps) {
  const primaryId = useId();
  const layoutRef = useRef<HTMLDivElement>(null);
  const separatorRef = useRef<HTMLDivElement>(null);
  const [state, dispatch] = useReducer(reduceSplit, {
    size: defaultSize,
    limits: { min: 0, max: 100 },
    pointerId: null,
  });

  /* The room both panels share is the one thing the split learns from outside React: a ResizeObserver reports it, and the caller turns it into limits. */
  useLayoutEffect(() => {
    const layout = layoutRef.current;
    const separator = separatorRef.current;
    if (!layout || !separator) {
      return;
    }
    const measure = () => {
      const room =
        lengthOf(layout.getBoundingClientRect(), orientation) -
        lengthOf(separator.getBoundingClientRect(), orientation);
      dispatch({ type: 'limit.changed', limits: limits(room) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(layout);
    return () => observer.disconnect();
  }, [limits, orientation]);

  /* The pointer marks the middle of the separator, so the panels share the room either side of it. */
  const sizeAtPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const layout = layoutRef.current!.getBoundingClientRect();
    const thickness = lengthOf(event.currentTarget.getBoundingClientRect(), orientation);
    const along = orientation === 'vertical' ? event.clientX - layout.left : event.clientY - layout.top;
    const firstSize = ((along - thickness / 2) / (lengthOf(layout, orientation) - thickness)) * 100;
    return primary === 'first' ? firstSize : 100 - firstSize;
  };

  const endCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dispatch({ type: 'capture.ended', pointerId: event.pointerId });
  };

  let first: ReactNode = null;
  let second: ReactNode = null;
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      warnDroppedChild('SplitPanels', SPLIT_PANELS_SLOTS, child);
      return;
    }
    if (child.type === First) {
      first = (child.props as PropsWithChildren).children;
      return;
    }
    if (child.type === Second) {
      second = (child.props as PropsWithChildren).children;
      return;
    }
    warnDroppedChild('SplitPanels', SPLIT_PANELS_SLOTS, child);
  });

  const firstSize = primary === 'first' ? state.size : 100 - state.size;
  const split = {
    '--split-panels-first': `${firstSize}fr`,
    '--split-panels-second': `${100 - firstSize}fr`,
  } as CSSProperties;

  return (
    <div className={styles.root}>
      <div
        ref={layoutRef}
        className={styles.layout}
        data-orientation={orientation}
        data-resizing={state.pointerId !== null}
        style={split}
      >
        <div className={styles.panel} id={primary === 'first' ? primaryId : undefined}>
          {first}
        </div>
        <div
          ref={separatorRef}
          className={styles.separator}
          role="separator"
          tabIndex={0}
          aria-label={label}
          aria-orientation={orientation}
          aria-controls={primaryId}
          aria-valuemin={tenths(state.limits.min)}
          aria-valuemax={tenths(state.limits.max)}
          aria-valuenow={tenths(state.size)}
          aria-valuetext={valueText?.(state.size)}
          onKeyDown={(event) => {
            const size = sizeForKey(event.key, state, { orientation, primary, step, pageStep });
            if (size === null) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            dispatch({ type: 'key.pressed', size });
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary || state.pointerId !== null) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            dispatch({ type: 'capture.started', pointerId: event.pointerId, size: sizeAtPointer(event) });
          }}
          onPointerMove={(event) => {
            if (state.pointerId !== event.pointerId) {
              return;
            }
            event.preventDefault();
            dispatch({ type: 'pointer.moved', pointerId: event.pointerId, size: sizeAtPointer(event) });
          }}
          onPointerUp={endCapture}
          onPointerCancel={endCapture}
          onLostPointerCapture={(event) => dispatch({ type: 'capture.ended', pointerId: event.pointerId })}
        >
          <span className={styles.grip} aria-hidden="true" />
        </div>
        <div className={styles.panel} id={primary === 'second' ? primaryId : undefined}>
          {second}
        </div>
      </div>
    </div>
  );
}

type SplitPanelsComponent = ((props: SplitPanelsProps) => ReactNode) & {
  First: typeof First;
  Second: typeof Second;
};

export const SplitPanels = Object.assign(SplitPanelsBase, { First, Second }) as SplitPanelsComponent;
