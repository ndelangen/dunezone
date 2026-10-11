import { Group, Stack, Text, VisuallyHidden } from '@mantine/core';
import clsx from 'clsx';
import { useId } from 'react';
import type { ReactNode } from 'react';

import { Eyebrow } from '../content/Eyebrow';
import { BlockHeading } from './BlockHeading';
import { OneLevelDeeper, useSectionDepth } from './depth';
import styles from './Section.module.css';

export interface SectionProps {
  /** What this part of the page is called. */
  title: string;
  /** Classifier above the title: what kind of thing this is, or what state it is in. */
  eyebrow?: string;
  /** One line saying what this part is for. */
  description?: string;
  /** Topical glyph beside the title. Decorative: the words carry the meaning. */
  icon?: ReactNode;
  /** The single control that belongs beside the title: a link onward, a status, one button. */
  action?: ReactNode;
  /** Stable anchor for in-page navigation. The accessible name is wired up either way. */
  id?: string;
  /** Placement only: grid area, width. The block owns its own internal spacing. */
  className?: string;
  /** Name and describe the section to assistive technology only, for expert controls whose tab tooltip carries the guidance. */
  hiddenHeading?: boolean;
  /** Where the heading and prose align within the section. */
  alignment?: 'start' | 'center';
  children: ReactNode;
}

/**
 * A named part of a page: what it is called, optionally what kind of thing it is and what it is for, the one control that belongs beside its name, and its content.
 *
 * Callers pass **words**, not components;
 * this block owns which content component each word becomes, and how loudly the heading speaks for how deep it sits.
 * Written by hand it was four spellings across four pages, half of them unnamed to a screen reader and each guessing its own heading level.
 *
 * Glyphs and controls stay as nodes, because an icon and a router link are not text.
 *
 * Its content brings its own panes, so this is not a `Card` and must not be given one: a `Card` puts content on its pane, and a section of a page holds cards.
 */
export function Section({
  title,
  eyebrow,
  description,
  icon,
  action,
  id,
  className,
  hiddenHeading = false,
  alignment = 'start',
  children,
}: SectionProps) {
  const headingId = useId();
  const descriptionId = useId();
  const depth = useSectionDepth();

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      aria-describedby={hiddenHeading && description ? descriptionId : undefined}
      className={clsx(styles.section, alignment === 'center' && styles.centered, className)}
    >
      {hiddenHeading ? (
        <VisuallyHidden>
          <BlockHeading id={headingId} title={title} />
          {description ? <span id={descriptionId}>{description}</span> : null}
        </VisuallyHidden>
      ) : (
        <Group
          justify={alignment === 'center' ? 'center' : 'space-between'}
          align={description == null ? 'end' : 'flex-start'}
          wrap="wrap"
          gap="md"
        >
          <Stack gap={4} align={alignment === 'center' ? 'center' : 'flex-start'} miw={0}>
            {eyebrow == null ? null : <Eyebrow tone="accent">{eyebrow}</Eyebrow>}
            <BlockHeading id={headingId} title={title} icon={icon} />
            {description == null ? null : (
              <Text size="sm" c="dimmed">
                {description}
              </Text>
            )}
          </Stack>
          {action}
        </Group>
      )}
      {hiddenHeading && action}
      <OneLevelDeeper depth={depth}>{children}</OneLevelDeeper>
    </section>
  );
}
