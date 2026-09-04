import { Badge } from '@mantine/core';
import type { ReactNode } from 'react';

/**
 * What a status means to the reader, independent of which subsystem produced it.
 * Exported so a caller mapping its own status union can name the target type instead of restating the words.
 */
export type StatusBadgeTone = 'neutral' | 'positive' | 'negative' | 'pending' | 'progress' | 'brand';

const TONE_COLOR: Record<StatusBadgeTone, string> = {
  neutral: 'gray',
  positive: 'green',
  negative: 'red',
  pending: 'yellow',
  progress: 'blue',
  /* Ownership, per the ratified vocabulary (selection has its own word); the brand hue is the dune tuple. */
  brand: 'dune',
};

export interface StatusBadgeProps {
  /** The reader-facing meaning; the colour follows from it, never the other way round. */
  tone?: StatusBadgeTone;
  /** Announce changes to assistive tech, for statuses that move on their own. */
  live?: boolean;
  /** A small mark beside the words, the way the owner badge carries its crown. */
  icon?: ReactNode;
  children: ReactNode;
}

/**
 * States where a subject currently sits in a lifecycle.
 *
 * Callers own the mapping from their own status union to a tone;
 * this component owns the mapping from tone to colour, so "pending" is the same yellow whether it describes a membership request or an asset publication, and no page re-invents that ladder inline.
 */
export function StatusBadge({ tone = 'neutral', live = false, icon, children }: StatusBadgeProps) {
  /* Neutral takes the default variant: the light variant of the warm `gray` tuple collapses into
     the dark scheme's navy surfaces, while the stock tone tuples derive legible dark values. */
  return (
    <Badge
      {...(tone === 'neutral'
        ? { variant: 'default' as const }
        : { variant: 'light' as const, color: TONE_COLOR[tone] })}
      {...(live ? { role: 'status', 'aria-live': 'polite' as const } : {})}
      leftSection={icon}
    >
      {children}
    </Badge>
  );
}
