import { Button, Tooltip, VisuallyHidden } from '@mantine/core';
import type { ButtonProps } from '@mantine/core';
import { ArrowDown, ArrowRight, Plus } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';

import type { RenderRoot } from '../renderRoot';
import styles from './CallToAction.module.css';

interface CallToActionBaseProps {
  children: ReactNode;
  /**
   * `start` prefixes a plus, for an action that brings something into existence;
   * `forward` suffixes an arrow, for one that continues a journey already begun;
   * `down` suffixes a downward arrow, for one that jumps to a part of this same page.
   */
  direction?: 'start' | 'forward' | 'down';
  /** `artwork` is the near-black, cream-lettered fill for a call that sits on the sandy header art, where the bright yellow would sink into the sand. */
  tone?: 'bright' | 'artwork';
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
}

/** Exactly one destination: the router's `Link` through `renderRoot`, or a plain anchor's `href` for a jump within this page (`#play-preview`), which a hash link keeps working before hydration. */
export type CallToActionProps = CallToActionBaseProps &
  ({ renderRoot: RenderRoot; href?: never } | { href: string; renderRoot?: never });

const TrailingArrow: Partial<Record<NonNullable<CallToActionBaseProps['direction']>, typeof ArrowRight>> = {
  forward: ArrowRight,
  down: ArrowDown,
};

/**
 * The button that starts a page's primary journey, or a section's on a page made of sections, such as the homepage.
 *
 * Callers own the words and the destination.
 * This component owns the primary action colour, the icon convention for creating or continuing, icon sizing tied to button size, and the opt-in attention pulse that respects `prefers-reduced-motion`.
 */
export function CallToAction({
  children,
  direction = 'start',
  tone = 'bright',
  size = 'md',
  attention = false,
  disabledReason,
  renderRoot,
  href,
}: CallToActionProps) {
  const reasonId = useId();
  const iconSize = size === 'sm' ? 15 : 17;
  const Arrow = TrailingArrow[direction];
  const variant = tone === 'artwork' ? 'artwork' : undefined;
  const sections = {
    leftSection: direction === 'start' ? <Plus size={iconSize} aria-hidden /> : undefined,
    rightSection: Arrow ? <Arrow size={iconSize} aria-hidden /> : undefined,
  };

  if (disabledReason != null) {
    /* Mantine's own disabled look, without the `disabled` attribute that would swallow the hover; no root, so it leads nowhere. */
    return (
      <>
        <Tooltip label={disabledReason}>
          <Button
            color="cta"
            variant={variant}
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
      variant={variant}
      className={attention ? styles.attention : undefined}
      size={size}
      {...sections}
      {...(href == null ? { renderRoot } : { component: 'a' as const, href })}
    >
      {children}
    </Button>
  );
}
