import { Badge } from '@mantine/core';
import type { ReactNode } from 'react';

/** What a status means to the reader, independent of which subsystem produced it. */
type StatusTone = 'neutral' | 'positive' | 'pending' | 'progress' | 'critical';

const TONE_COLOR: Record<StatusTone, string> = {
  neutral: 'gray',
  positive: 'green',
  pending: 'yellow',
  progress: 'blue',
  critical: 'red',
};

export interface StatusBadgeProps {
  /** The reader-facing meaning; the colour follows from it, never the other way round. */
  tone?: StatusTone;
  /** Announce changes to assistive tech, for statuses that move on their own. */
  live?: boolean;
  children: ReactNode;
}

/**
 * States where a subject currently sits in a lifecycle.
 * 
 * Callers own the mapping from their own status union to a tone; this component owns the mapping from tone to colour, so "pending" is the same yellow whether it describes a membership request or an asset publication, and no page re-invents that ladder inline.
 */
export function StatusBadge({ tone = 'neutral', live = false, children }: StatusBadgeProps) {
  /* Neutral takes the default variant: the light variant of the warm `gray` tuple collapses into
     the dark scheme's navy surfaces, while the stock tone tuples derive legible dark values. */
  return (
    <Badge
      {...(tone === 'neutral'
        ? { variant: 'default' as const }
        : { variant: 'light' as const, color: TONE_COLOR[tone] })}
      {...(live ? { role: 'status', 'aria-live': 'polite' as const } : {})}
    >
      {children}
    </Badge>
  );
}
