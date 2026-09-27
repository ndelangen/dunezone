import { Box, Stack, Tooltip, VisuallyHidden } from '@mantine/core';
import clsx from 'clsx';
import { createContext, useContext, useId } from 'react';
import type { ReactNode } from 'react';

import styles from './StatusMark.module.css';

/**
 * What a status means to the reader, independent of which subsystem produced it.
 * The words come from the variant language: `caution` warns without failing, as unsaved work does.
 */
type StatusMarkTone = 'neutral' | 'positive' | 'negative' | 'caution' | 'pending' | 'progress';

const InsideStatusMarkList = createContext(false);

export interface StatusMarkProps {
  /** The reader-facing meaning; the glyph's colour follows from it, never the other way round. */
  tone?: StatusMarkTone;
  /** The glyph. Sized by the caller; marked decorative here, since `label` carries the meaning. */
  icon: ReactNode;
  /** The full wording: the accessible name, and the tooltip unless `tooltip` says more. */
  label: string;
  /**
   * Tooltip content richer than the name, such as the list of statuses a single mark stands in for.
   * It is also the mark's accessible description, because a tooltip only paints on hover, focus and touch.
   */
  tooltip?: ReactNode;
}

/**
 * A status stated as a glyph alone, for a bar with no room for the words.
 *
 * Callers own the glyph, the tone and the full wording.
 * This owns keeping the words reachable: the glyph is a tab stop named with them, and its tooltip shows them on hover, focus and touch.
 * Inside a `StatusMarkList` the same mark states its words beside its glyph instead, so one set of marks can fill a bar and the tooltip that stands in for it.
 */
export function StatusMark({ tone = 'neutral', icon, label, tooltip }: StatusMarkProps) {
  const listed = useContext(InsideStatusMarkList);
  const descriptionId = useId();

  /* A list is read inside a tooltip, whose own ink the glyph keeps: the tone colours are set for the page, not for the tooltip's pane. */
  if (listed) {
    return (
      <span className={styles.row}>
        <span aria-hidden className={styles.glyph}>
          {icon}
        </span>
        <span>{label}</span>
      </span>
    );
  }

  return (
    <>
      {tooltip ? <VisuallyHidden id={descriptionId}>{tooltip}</VisuallyHidden> : null}
      {/* Below the glyph, since a status bar sits at the top of what it describes and a tooltip above it would cover the navigation. */}
      <Tooltip
        label={tooltip ?? label}
        position="bottom"
        multiline
        maw={320}
        withArrow
        events={{ hover: true, focus: true, touch: true }}
      >
        <Box
          component="span"
          role="img"
          aria-label={label}
          aria-describedby={tooltip ? descriptionId : undefined}
          tabIndex={0}
          className={clsx(styles.glyph, styles.mark, styles[tone])}
        >
          {icon}
        </Box>
      </Tooltip>
    </>
  );
}

/**
 * States every `StatusMark` inside it as its glyph and its words, one per row.
 *
 * Callers own which marks it holds.
 * This owns the one place several statuses are read at once, such as the tooltip of a mark that stands in for all of them.
 */
export function StatusMarkList({ children }: { children: ReactNode }) {
  return (
    <InsideStatusMarkList.Provider value>
      <Stack gap="xs">{children}</Stack>
    </InsideStatusMarkList.Provider>
  );
}
