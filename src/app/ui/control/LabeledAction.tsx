import { Button, Loader, Tooltip, VisuallyHidden } from '@mantine/core';
import type { ButtonProps } from '@mantine/core';
import clsx from 'clsx';
import { useId } from 'react';
import type { MouseEventHandler, ReactNode, Ref } from 'react';

import type { RenderRoot } from '../renderRoot';
import { EMPHASIS_VARIANT, INTENT_COLOR, tileVars } from './actionIntent';
import type { ActionEmphasis, ActionIntent } from './actionIntent';
import styles from './LabeledAction.module.css';

export interface LabeledActionProps extends Pick<ButtonProps, 'size' | 'justify'> {
  /** What the action does, as a short verb phrase on the button: "Reset filters". */
  children: string;
  /** The glyph before the words. Required: a worded button without one is the text-only button the app does not use. Marked decorative here, since the words carry the meaning. */
  icon: ReactNode;
  /** The reader-facing meaning, in IconAction's words; the colour follows from it. */
  intent?: ActionIntent;
  /** How loudly the action renders, in IconAction's words, framed only: without a tile a worded action is the text-only button the app does not use. Omitted is `standard`, the tinted tile, where IconAction's is `strong`: a worded action is wide, and a filled one would compete with the page's `CallToAction`. */
  emphasis?: Extract<ActionEmphasis, 'standard' | 'strong'>;
  /** Why the action cannot run right now, as a sentence; the button stays hoverable and focusable and this is its hover text and description, as on `IconAction`. */
  disabledReason?: string;
  /**
   * True while the work this action started is in flight: a spinner takes the glyph's place and a second press does nothing.
   * Not Mantine's `loading`, which disables the button and drops a keyboard reader's focus to the page;
   * this stays focusable and says it is busy.
   */
  busy?: boolean;
  /** Makes the action a toggle that is on, as on `IconAction`: it announces as pressed and wears the selected tile, whatever its emphasis. Pass `false` for a toggle that is off, so it still announces as a toggle. */
  pressed?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** Makes the action a link, in practice the router's `Link`. */
  renderRoot?: RenderRoot;
  /** Makes the action a plain anchor, for a destination outside the router, as on `IconAction`. */
  href?: string;
  target?: string;
  rel?: string;
  type?: 'button' | 'submit';
  /** Submits a form this action sits outside of, by that form's id. */
  form?: string;
  /** Placement only. */
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * An action shown as a glyph and its words, for the places with room to say what it does.
 *
 * The worded sibling of `IconAction`: the same intents, the same emphasis words and the same tinted tile, so a worded Delete and a glyph Delete are one red.
 * `CallToAction` keeps the page's primary journey;
 * this is every other worded action, whether it runs on a click or goes somewhere through `renderRoot`.
 * It exists because about two hundred raw Mantine Buttons each picked their own variant and colour, and many said what they did in words alone.
 */
export function LabeledAction({
  children,
  icon,
  intent = 'neutral',
  emphasis = 'standard',
  disabledReason,
  busy = false,
  pressed,
  onClick,
  renderRoot: routerRoot,
  href,
  target,
  rel,
  type = 'button',
  form,
  className,
  ref,
  ...buttonProps
}: LabeledActionProps) {
  const reasonId = useId();
  const renderRoot: RenderRoot | undefined =
    href == null
      ? routerRoot
      : (props) => (
          <a {...props} href={href} target={target} rel={rel}>
            {props.children}
          </a>
        );
  const color = INTENT_COLOR[intent];
  const variant = pressed ? 'light' : EMPHASIS_VARIANT[emphasis];
  const vars = pressed || emphasis === 'standard' ? () => tileVars(intent, pressed === true, 'button') : undefined;
  const classes = clsx(className, pressed && styles.pressed);
  const leftSection = busy ? <Loader size="xs" /> : <span aria-hidden>{icon}</span>;
  if (disabledReason != null) {
    return (
      <>
        <Tooltip label={disabledReason}>
          <Button
            size={buttonProps.size}
            justify={buttonProps.justify}
            color={color}
            variant={variant}
            vars={vars}
            leftSection={leftSection}
            ref={ref}
            type={renderRoot ? undefined : type}
            form={form}
            data-disabled
            aria-disabled
            aria-describedby={reasonId}
            /* Keeps its type so a form's Enter lands here and stops, the way a disabled submit button stops it. */
            onClick={(event) => event.preventDefault()}
            aria-pressed={pressed}
            className={classes}
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
      {...buttonProps}
      color={color}
      variant={variant}
      vars={vars}
      leftSection={leftSection}
      ref={ref}
      type={renderRoot ? undefined : type}
      form={form}
      aria-disabled={busy || undefined}
      onClick={(event) => {
        if (busy) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      renderRoot={renderRoot}
      aria-pressed={pressed}
      className={classes}
    >
      {children}
    </Button>
  );
}
