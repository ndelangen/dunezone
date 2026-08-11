import { Group, Stack } from '@mantine/core';
import type { ReactNode } from 'react';

import { HeadingSlot, useHeadingSlot } from '../content/headingSlot';

export interface SectionIntroProps {
  /** The heading itself — a `Section`, or a `Title` where a page needs its own `h1`. */
  heading: ReactNode;
  /** Classifier above the heading: an `Eyebrow`, or a `Badge` when it names a state. */
  eyebrow?: ReactNode;
  /** One line saying what the region is for. Its presence switches the row to top alignment. */
  description?: ReactNode;
  /** The single control that belongs beside the heading — a link onward, a button, a status. */
  action?: ReactNode;
}

/**
 * The top of a region: what kind of thing it is, what it is called, what it is for, and the one
 * control that belongs beside it.
 *
 * Every slot is the caller's — this owns only how they relate: the classifier sits tight above the
 * heading, the description below it, the action at the far end, and the two sides wrap onto their
 * own lines before either is truncated. Alignment follows the description, because a one-line
 * heading pairs with its action on a baseline while a block of text pairs with it at the top.
 *
 * Deliberately not a heading and deliberately not in `Text` — it arranges a heading rather than
 * being one. `Section` is the heading; bundling these slots into it made a "heading" that was
 * really four things.
 */
export function SectionIntro({ heading, eyebrow, description, action }: SectionIntroProps) {
  /* Forwards an enclosing Region's id rather than shadowing it, so the landmark keeps its name. */
  const slot = useHeadingSlot();

  return (
    <Group
      justify="space-between"
      align={description == null ? 'end' : 'flex-start'}
      wrap="wrap"
      gap="md"
    >
      <Stack gap={4} align="flex-start" miw={0}>
        {eyebrow}
        <HeadingSlot headingId={slot?.headingId}>{heading}</HeadingSlot>
        {description}
      </Stack>
      {action}
    </Group>
  );
}
