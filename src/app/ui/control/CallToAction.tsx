import { Button, Loader, Tooltip, VisuallyHidden } from '@mantine/core';
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

/**
 * Exactly one destination: the router's `Link` through `renderRoot`, or a plain anchor's `href` for a jump within this page (`#play-preview`), which a hash link keeps working before hydration.
 * Or `submit`, for a journey that starts by sending the form the button sits in (Create game); `busy` then holds a spinner while the form is on its way.
 */
export type CallToActionProps = CallToActionBaseProps &
  (
    | { renderRoot: RenderRoot; href?: never; submit?: never; busy?: never }
    | { href: string; renderRoot?: never; submit?: never; busy?: never }
    | { submit: true; busy?: boolean; renderRoot?: never; href?: never }
  );

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
  submit,
  busy = false,
}: CallToActionProps) {
  const reasonId = useId();
  const iconSize = size === 'sm' ? 15 : 17;
  const Arrow = TrailingArrow[direction];
  const variant = tone === 'artwork' ? 'artwork' : undefined;
  const sections = {
    leftSection: busy ? (
      <Loader size="xs" color="currentColor" />
    ) : direction === 'start' ? (
      <Plus size={iconSize} aria-hidden />
    ) : undefined,
    rightSection: Arrow ? <Arrow size={iconSize} aria-hidden /> : undefined,
  };

  const disabled = disabledReason != null;
  /*
   * One tree for every state, so the button a reader is focused on stays that button when its reason comes or goes.
   * Disabled is Mantine's own look without the `disabled` attribute that would swallow the hover, and with no root, so it leads nowhere.
   * A submit keeps its type while it waits, so a form's Enter lands here and stops, the way a disabled submit button stops it.
   */
  const destination = disabled
    ? { type: submit ? ('submit' as const) : ('button' as const) }
    : submit
      ? { type: 'submit' as const }
      : href == null
        ? { renderRoot }
        : { component: 'a' as const, href };
  return (
    <>
      <Tooltip label={disabledReason} disabled={!disabled}>
        <Button
          color="cta"
          variant={variant}
          className={attention && !disabled ? styles.attention : undefined}
          size={size}
          {...sections}
          {...destination}
          data-disabled={disabled || undefined}
          aria-disabled={disabled || busy || undefined}
          aria-describedby={disabled ? reasonId : undefined}
          onClick={(event: { preventDefault: () => void }) => {
            if (disabled || busy) {
              event.preventDefault();
            }
          }}
        >
          {children}
        </Button>
      </Tooltip>
      {disabled ? <VisuallyHidden id={reasonId}>{disabledReason}</VisuallyHidden> : null}
    </>
  );
}
