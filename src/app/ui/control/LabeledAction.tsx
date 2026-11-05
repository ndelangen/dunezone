import { Button, Tooltip, VisuallyHidden } from '@mantine/core';
import type { ButtonProps } from '@mantine/core';
import { useId } from 'react';
import type { MouseEventHandler, ReactNode, Ref } from 'react';

import type { RenderRoot } from '../renderRoot';
import { EMPHASIS_VARIANT, INTENT_COLOR, tileVars } from './actionIntent';
import type { ActionEmphasis, ActionIntent } from './actionIntent';

export interface LabeledActionProps extends Pick<ButtonProps, 'size' | 'disabled' | 'loading'> {
  /** What the action does, as a short verb phrase on the button: "Reset filters". */
  children: string;
  /** The glyph before the words. Required: a worded button without one is the text-only button the app does not use. Marked decorative here, since the words carry the meaning. */
  icon: ReactNode;
  /** The reader-facing meaning, in IconAction's words; the colour follows from it. */
  intent?: ActionIntent;
  /** How loudly the action renders, in IconAction's words; omitted is `standard`, the tinted tile. */
  emphasis?: ActionEmphasis;
  /** Why the action cannot run right now, as a sentence; the button stays hoverable and focusable and this is its hover text and description, as on `IconAction`. */
  disabledReason?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** Makes the action a link, in practice the router's `Link`. */
  renderRoot?: RenderRoot;
  /** Makes the action a plain anchor, for a destination outside the router. */
  href?: string;
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
  onClick,
  renderRoot,
  href,
  type = 'button',
  form,
  className,
  ref,
  ...buttonProps
}: LabeledActionProps) {
  const reasonId = useId();
  const color = INTENT_COLOR[intent];
  const variant = EMPHASIS_VARIANT[emphasis];
  const vars = emphasis === 'standard' ? () => tileVars(intent, false, 'button') : undefined;
  const leftSection = <span aria-hidden>{icon}</span>;
  if (disabledReason != null) {
    return (
      <>
        <Tooltip label={disabledReason}>
          <Button
            size={buttonProps.size}
            color={color}
            variant={variant}
            vars={vars}
            leftSection={leftSection}
            ref={ref}
            type="button"
            data-disabled
            aria-disabled
            aria-describedby={reasonId}
            onClick={(event) => event.preventDefault()}
            className={className}
          >
            {children}
          </Button>
        </Tooltip>
        <VisuallyHidden id={reasonId}>{disabledReason}</VisuallyHidden>
      </>
    );
  }
  if (href != null) {
    return (
      <Button
        {...buttonProps}
        component="a"
        href={href}
        color={color}
        variant={variant}
        vars={vars}
        leftSection={leftSection}
        className={className}
      >
        {children}
      </Button>
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
      onClick={onClick}
      renderRoot={renderRoot}
      className={className}
    >
      {children}
    </Button>
  );
}
