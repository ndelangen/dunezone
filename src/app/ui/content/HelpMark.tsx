import { Box, Tooltip, VisuallyHidden } from '@mantine/core';
import { CircleHelp } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';

import styles from './HelpMark.module.css';

export interface HelpMarkProps {
  /** The explanation: a constraint, a consequence, or what a panel is for. A line break in a string starts a new line in the tooltip. */
  text: ReactNode;
  /** The id the text is published under, when the thing it explains names it in its own `aria-describedby`. */
  id?: string;
}

/**
 * The (?) help affordance: a small glyph whose tooltip explains the thing beside it on hover, focus or touch.
 * The words stay reachable without the tooltip: visually hidden text, which the glyph itself is described by.
 */
export function HelpMark({ text, id }: HelpMarkProps) {
  const ownId = useId();
  const descriptionId = id ?? ownId;
  return (
    <>
      {/* Read aloud as one description: the tooltip's line breaks are only for the eye. */}
      <VisuallyHidden id={descriptionId}>{typeof text === 'string' ? text.replaceAll('\n', ' ') : text}</VisuallyHidden>
      <Tooltip
        label={text}
        multiline
        maw={360}
        classNames={{ tooltip: styles.tip }}
        position="top-start"
        withArrow
        events={{ hover: true, focus: true, touch: true }}
      >
        <Box
          component="span"
          role="img"
          aria-label="Help"
          aria-describedby={descriptionId}
          tabIndex={0}
          className={styles.help}
        >
          <CircleHelp size={14} aria-hidden />
        </Box>
      </Tooltip>
    </>
  );
}
