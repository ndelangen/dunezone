import { Button, Tooltip, VisuallyHidden } from '@mantine/core';
import type { ButtonProps } from '@mantine/core';
import { ArrowRight, Plus } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';

import type { RenderRoot } from '../renderRoot';
import styles from './CallToAction.module.css';

export interface CallToActionProps {
  children: ReactNode;
  /**
   * `start` prefixes a plus, for an action that brings something into existence;
   * `forward` suffixes an arrow, for one that continues a journey already begun.
   */
  direction?: 'start' | 'forward';
  size?: ButtonProps['size'];
  /**
   * Pulses periodically to draw the eye.
   * Reserve it for a page whose entire purpose is this one action;
   * a second pulsing button on the same screen cancels out the first.
   */
  attention?: boolean;
  /**
   * Why the journey cannot start yet, as a sentence.
   * The button renders disabled but stays hoverable and focusable, and this becomes its hover text and description, as on `IconAction`.
   */
  disabledReason?: string;
  renderRoot: RenderRoot;
}

/**
 * The button that starts a page's primary journey.
 *
 * Callers own the words and the destination.
 * This component owns the primary action colour, the icon convention for creating or continuing, icon sizing tied to button size, and the opt-in attention pulse that respects `prefers-reduced-motion`.
 */
export function CallToAction({
  children,
  direction = 'start',
  size = 'md',
  attention = false,
  disabledReason,
  renderRoot,
}: CallToActionProps) {
  const reasonId = useId();
  const iconSize = size === 'sm' ? 15 : 17;
  const sections = {
    leftSection: direction === 'start' ? <Plus size={iconSize} aria-hidden /> : undefined,
    rightSection: direction === 'forward' ? <ArrowRight size={iconSize} aria-hidden /> : undefined,
  };

  if (disabledReason != null) {
    /* Mantine's own disabled look, without the `disabled` attribute that would swallow the hover; no root, so it leads nowhere. */
    return (
      <>
        <Tooltip label={disabledReason}>
          <Button
            color="cta"
            size={size}
            {...sections}
            type="button"
            data-disabled
            aria-disabled
            aria-describedby={reasonId}
            onClick={(event) => event.preventDefault()}
          >
            {children}
          </Button>
        </Tooltip>
        <VisuallyHidden id={reasonId}>{disabledReason}</VisuallyHidden>
      </>
    );
  }
  return (
    <Button
      color="cta"
      className={attention ? styles.attention : undefined}
      size={size}
      {...sections}
      renderRoot={renderRoot}
    >
      {children}
    </Button>
  );
}
