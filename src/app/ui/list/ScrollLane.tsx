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

/**
 * Where the fade at the lane's ends is painted.
 * `lane` masks the whole line, the default.
 * `items` leaves the line unmasked and lets each item fade itself, for items that blur the page behind them (see `fadingItemClass`).
 */
type LaneFade = 'lane' | 'items';

/**
 * The class an item puts on the element that fades, in a lane with `fade="items"`: the very element that carries the blur, never one above it.
 * A mask on an ancestor would make that ancestor the blur's backdrop, and the blur would see the empty lane instead of the page.
 */
export const fadingItemClass: string = styles.fadingItem;

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
  /**
   * Where the fade is painted, `lane` by default.
   * `items` for items that blur the page behind them, such as `Surface` panes: each puts `fadingItemClass` on the element that blurs.
   */
  fade?: LaneFade;
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
  fade = 'lane',
}: ScrollLaneProps) {
  return (
    <div className={styles.frame}>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A line that scrolls is reached by the keyboard only when it can take the focus. */}
      <Tag
        className={styles.lane}
        data-room={room}
        data-fade={fade}
        aria-label={ariaLabel}
        start={Tag === 'ol' ? start : undefined}
        tabIndex={focusable ? 0 : undefined}
      >
        {children}
      </Tag>
    </div>
  );
}
