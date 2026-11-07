import { Box, Tooltip } from '@mantine/core';
import clsx from 'clsx';
import { useId } from 'react';
import type { ReactNode } from 'react';

import styles from './StatusMark.module.css';

/**
 * What a status means to the reader, independent of which subsystem produced it.
 * The words come from the variant language: `caution` warns without failing, as unsaved work does.
 */
type StatusMarkTone = 'neutral' | 'positive' | 'negative' | 'caution' | 'pending' | 'progress';

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
 */
export function StatusMark({ tone = 'neutral', icon, label, tooltip }: StatusMarkProps) {
  const descriptionId = useId();

  return (
    <>
      {/* Hidden, not visually hidden: the words are the mark's description, so browsing the page reads them with the mark rather than a second time as text. */}
      {tooltip ? (
        <div hidden id={descriptionId}>
          {tooltip}
        </div>
      ) : null}
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
