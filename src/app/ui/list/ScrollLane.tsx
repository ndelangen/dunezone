import type { ReactNode } from 'react';

import styles from './ScrollLane.module.css';

/** The element the lane is: a plain row, or a list whose items are `li`. */
type LaneElement = 'div' | 'ol' | 'ul';

/**
 * What an item paints past its own box, which the lane would otherwise clip.
 * `outline` keeps room for a ring of 2px at 2px offset, the default.
 * `shadow` keeps room for a drop shadow's blur, a large space on both sides.
 */
type LaneRoom = 'outline' | 'shadow';

export interface ScrollLaneProps {
  /** The items, in reading order, each at its own fixed width. In a list lane each is an `li`. */
  children: ReactNode;
  /** `div` by default; `ol` or `ul` when the items are list items, so a reader hears a list. */
  as?: LaneElement;
  /** Names the list for assistive tech, where no heading above it does. For a list lane only. */
  'aria-label'?: string;
  /** The first item's number, for an `ol` whose count starts past one. */
  start?: number;
  /**
   * Whether the lane takes the focus, so the keyboard scrolls it.
   * Set it when the items hold nothing focusable, or when a reader should scroll the line as one thing.
   */
  focusable?: boolean;
  /** The room the lane keeps above and below its items, `outline` by default. */
  room?: LaneRoom;
}

/**
 * One line of items that scrolls sideways, masked: the faction page's leaders, a blog post's chapter tiles.
 *
 * A List.
 * Callers hand it the items, each sized by its own rules, and may ask an item to snap with `scroll-snap-align`;
 * this owns that they sit on one line that bleeds past its frame and fades out at both ends, the gap between them, the scrollbar, and the ring when it takes the focus.
 * Callers own the empty case.
 */
export function ScrollLane({
  children,
  as: Tag = 'div',
  'aria-label': ariaLabel,
  start,
  focusable = false,
  room = 'outline',
}: ScrollLaneProps) {
  return (
    <div className={styles.frame}>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A line that scrolls is reached by the keyboard only when it can take the focus. */}
      <Tag
        className={styles.lane}
        data-room={room}
        aria-label={ariaLabel}
        start={Tag === 'ol' ? start : undefined}
        tabIndex={focusable ? 0 : undefined}
      >
        {children}
      </Tag>
    </div>
  );
}
