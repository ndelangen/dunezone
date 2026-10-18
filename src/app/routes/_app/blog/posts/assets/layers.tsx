import type { ReactNode } from 'react';

import styles from './layers.module.css';

/*
 * Wrappers that trim a real renderer down to one of its layers, so a figure pulls apart the code the site draws with and not a copy of it.
 * They select by the renderer's structure and by its `data-component-part` names, which the asset publisher also relies on.
 */

/**
 * The parts of a leader token, bottom to top: the two colours and the texture between them, then the drawing on top.
 * `mask` is the portrait flattened to one light tone, which shows the shape its mask lets through.
 */
export type LeaderTokenPart =
  | 'colour-one'
  | 'texture'
  | 'colour-two'
  | 'mask'
  | 'portrait'
  | 'ring'
  | 'strength'
  | 'name'
  | 'faction-emblem';

/** Shows one part of the `LeaderToken` it wraps. */
export function LeaderTokenLayer({ part, children }: Readonly<{ part: LeaderTokenPart; children: ReactNode }>) {
  return (
    <div className={styles.leader} data-part={part}>
      {children}
    </div>
  );
}

/**
 * Shows only the `index`th element, counting from 1, of the renderer root it wraps.
 * When that element is a `BackgroundRenderer`, `part` narrows it to its background or to what it draws on top.
 */
export function RootChildLayer({
  index,
  part,
  children,
}: Readonly<{ index: number; part?: 'background' | 'contents'; children: ReactNode }>) {
  return (
    <div className={styles.rootChild} data-child={index} data-part={part}>
      {children}
    </div>
  );
}
