import preview from '@sb/preview';
import { Crown } from 'lucide-react';

import { StatusBadge } from './StatusBadge';

const meta = preview.meta({
  component: StatusBadge,
  parameters: { layout: 'centered' },
  args: {
    children: 'Not a member',
  },
});

/** A state with no positive or negative charge: not a member, no file published. */
export const Neutral = meta.story({});

/** The desired end state: an active membership, a current publication. */
export const Positive = meta.story({
  args: { tone: 'positive', children: 'Active' },
});

/** Waiting on someone else to act. */
export const Pending = meta.story({
  args: { tone: 'pending', children: 'Scheduled' },
});

/** Underway right now. */
export const Progress = meta.story({
  args: { tone: 'progress', children: 'In progress' },
});

export const Negative = meta.story({
  args: { tone: 'negative', children: 'Failed' },
});

/**
 * Ownership, per the ratified vocabulary: the dune tuple, worn here the way the group page's Owner badge wears it, crown and all.
 * The icon slot exists for exactly this fold.
 */
export const Brand = meta.story({
  args: { tone: 'brand', icon: <Crown size={12} aria-hidden />, children: 'Owner' },
});

/** For statuses that change without the reader acting, announced politely to assistive tech. */
export const Live = meta.story({
  args: { tone: 'progress', live: true, children: 'In progress' },
});

export const LongLabel = meta.story({
  args: { tone: 'pending', children: 'Awaiting moderator approval' },
});
