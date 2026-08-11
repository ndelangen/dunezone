import { Box, Group, Title } from '@mantine/core';
import type { ReactNode } from 'react';

import { useHeadingSlot } from './headingSlot';

/**
 * How loudly the heading speaks, independent of the level screen readers hear.
 *
 * `page` heads a top-level region of a route; `panel` heads a region inside a card, where the
 * surrounding surface already provides separation; `subsection` heads a division within one.
 */
type SectionLevel = 'page' | 'panel' | 'subsection';

const LEVEL: Record<SectionLevel, { order: 2 | 3; size: string | undefined }> = {
  page: { order: 2, size: undefined },
  panel: { order: 2, size: 'h3' },
  subsection: { order: 3, size: 'h4' },
};

export interface SectionProps {
  title: ReactNode;
  /** Topical glyph beside the title. Decorative — the words carry the meaning. */
  icon?: ReactNode;
  level?: SectionLevel;
  /**
   * Target for the enclosing section's `aria-labelledby`. Rarely needed: a heading rendered into
   * `Region` is given one automatically. Set it only to pin a stable in-page anchor.
   */
  id?: string;
}

/**
 * The heading of a section, with its topical glyph.
 *
 * Callers own the words and the glyph. This component owns only their pairing and the split between
 * heading level and visual weight, so a heading inside a card can be quieter than a page section
 * without lying to a screen reader about the document outline.
 *
 * It is only the heading. An eyebrow above it, or a link to the section's full contents at the far
 * end, are separate things a page arranges around this one — bundling them here made a "heading"
 * that was really a heading, a label, a link and a row layout in one.
 *
 * **A heading belongs to a slot.** Pass it to `Card` when the content it names sits on that card's
 * pane, to `Region` when the content brings panes of its own, or to `SectionIntro` when something
 * else shares its top line. Rendering one loose in a page body warns in development.
 */
export function Section({ title, icon, level = 'panel', id }: SectionProps) {
  const { order, size } = LEVEL[level];
  const slot = useHeadingSlot();

  if (import.meta.env.DEV && slot === null) {
    console.warn(
      '[Section] A heading is rendered outside a heading slot. The heading and the content it ' +
        'names are one region, and nothing keeps them together unless a component owns both: ' +
        'use `Card` when the content sits on the card pane, `Region` when the content brings its ' +
        'own panes, or `SectionIntro` when a description or an action shares the heading line.'
    );
  }

  return (
    <Group gap="xs" wrap="nowrap" c="var(--color-text, var(--mantine-color-text))">
      {icon == null ? null : (
        <Box component="span" display="inline-flex" aria-hidden>
          {icon}
        </Box>
      )}
      <Title id={id ?? slot?.headingId} order={order} size={size}>
        {title}
      </Title>
    </Group>
  );
}
