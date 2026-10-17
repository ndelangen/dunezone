import { Group } from '@mantine/core';
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

/**
 * Every tone side by side, so their contrast can be compared: positive is the desired end state, pending waits on someone else, progress is underway now.
 * Ownership uses slate, as the group page's Owner badge does;
 * the icon slot exists for exactly this fold.
 */
export const Tones = meta.story({
  render: () => (
    <Group gap="xs">
      <StatusBadge>Not a member</StatusBadge>
      <StatusBadge tone="positive">Active</StatusBadge>
      <StatusBadge tone="pending">Scheduled</StatusBadge>
      <StatusBadge tone="progress">In progress</StatusBadge>
      <StatusBadge tone="negative">Failed</StatusBadge>
      <StatusBadge tone="brand" icon={<Crown size={12} aria-hidden />}>
        Owner
      </StatusBadge>
    </Group>
  ),
});

/** For statuses that change without the reader acting, announced politely to assistive tech. */
export const Live = meta.story({
  args: { tone: 'progress', live: true, children: 'In progress' },
});

export const LongLabel = meta.story({
  args: { tone: 'pending', children: 'Awaiting moderator approval' },
});
