import { Group, Stack, VisuallyHidden } from '@mantine/core';
import clsx from 'clsx';
import { useId } from 'react';
import type { ReactNode } from 'react';

import { Eyebrow } from '../content/Eyebrow';
import { HelpMark } from '../content/HelpMark';
import { BlockHeading } from './BlockHeading';
import { OneLevelDeeper, useSectionDepth } from './depth';
import styles from './Section.module.css';

export interface SectionProps {
  /** What this part of the page is called. */
  title: string;
  /** Classifier above the title: what kind of thing this is, or what state it is in. */
  eyebrow?: string;
  /** What this part is for, behind a (?) beside the title. Instructions the reader needs to act belong in the body instead. */
  help?: string;
  /** Topical glyph beside the title. Decorative: the words carry the meaning. */
  icon?: ReactNode;
  /** The single control that belongs beside the title: a link onward, a status, one button. */
  action?: ReactNode;
  /** Stable anchor for in-page navigation. The accessible name is wired up either way. */
  id?: string;
  /** Placement only: grid area, width. The block owns its own internal spacing. */
  className?: string;
  /** Name and describe the section to assistive technology only: for expert controls whose name and guidance are shown elsewhere. */
  hiddenHeading?: boolean;
  /** Where the heading and prose align within the section. */
  alignment?: 'start' | 'center';
  children: ReactNode;
}

/**
 * A named part of a page: what it is called, optionally what kind of thing it is and a (?) saying what it is for, the one control that belongs beside its name, and its content.
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
  help,
  icon,
  action,
  id,
  className,
  hiddenHeading = false,
  alignment = 'start',
  children,
}: SectionProps) {
  const headingId = useId();
  const helpId = useId();
  const depth = useSectionDepth();

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      aria-describedby={help ? helpId : undefined}
      className={clsx(styles.section, alignment === 'center' && styles.centered, className)}
    >
      {hiddenHeading ? (
        <VisuallyHidden>
          <BlockHeading id={headingId} title={title} />
          {help ? <span id={helpId}>{help}</span> : null}
        </VisuallyHidden>
      ) : (
        <Group justify={alignment === 'center' ? 'center' : 'space-between'} align="end" wrap="wrap" gap="md">
          <Stack gap={4} align={alignment === 'center' ? 'center' : 'flex-start'} miw={0}>
            {eyebrow == null ? null : <Eyebrow tone="accent">{eyebrow}</Eyebrow>}
            {help ? (
              <Group gap={6} wrap="nowrap" miw={0}>
                <BlockHeading id={headingId} title={title} icon={icon} />
                <HelpMark id={helpId} text={help} />
              </Group>
            ) : (
              <BlockHeading id={headingId} title={title} icon={icon} />
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
