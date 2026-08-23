import { Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

import type { RenderRoot } from '../renderRoot';
import styles from './OpenableTile.module.css';

export interface OpenableTileProps {
  /**
   * Names the tile, visibly and for assistive technology alike: the caption is the link's content, so the two cannot come apart.
   * A tile is its render and its name;
   * everything else lives on the page the tile opens (Norbert, 2026-08-21).
   */
  caption: string;
  /** Makes the whole tile a link, in practice the router's `Link`, so route type-checking stays at the call site. */
  renderRoot: RenderRoot;
  /** The artwork. Decorative to a screen reader, since the caption carries the name. */
  children: ReactNode;
}

/**
 * One openable tile: an artwork above a caption, the whole tile a link.
 *
 * Callers own the artwork and the destination;
 * this owns the treatment "something you can open", lift and shadow on hover, the focus ring on the anchor with an offset so it never crops the art, and the caption doubling as the accessible name.
 * It replaced two hand-written copies of the same tile (the browse grid and the container composition grid) that had already diverged in their accessibility wiring.
 */
export function OpenableTile({ caption, renderRoot, children }: OpenableTileProps) {
  return renderRoot({
    className: styles.tile,
    children: (
      <Stack gap={6}>
        <div className={styles.art} aria-hidden>
          {children}
        </div>
        {/* Centred on the same axis as the art, so the caption belongs to it rather than floating beside it. */}
        <Text size="sm" fw={600} lineClamp={1} ta="center">
          {caption}
        </Text>
      </Stack>
    ),
  });
}
