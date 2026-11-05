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
  /**
   * What a screen reader calls the action, when the words lean on their surroundings: "Open Arrakeen picnic" for an "Open" on that game's card.
   * It must start with the visible words, so a reader who says what they see still reaches it.
   */
  accessibleName?: string;
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
  accessibleName,
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
  const disabled = disabledReason != null;
  /*
   * One tree for both states, so the button a reader is focused on stays that button when its reason comes or goes.
   * Disabled is Mantine's own look without the `disabled` attribute that would swallow the hover, and the reason is also the control's description, for a reader who never hovers.
   * A disabled link renders as a button, since there is nowhere it may go.
   */
  return (
    <>
      <Tooltip label={disabledReason} disabled={!disabled}>
        <Button
          {...buttonProps}
          color={color}
          variant={variant}
          vars={vars}
          leftSection={leftSection}
          ref={ref}
          type={renderRoot && !disabled ? undefined : type}
          form={form}
          data-disabled={disabled || undefined}
          aria-disabled={disabled || busy || undefined}
          aria-describedby={disabled ? reasonId : undefined}
          /* Keeps its type so a form's Enter lands here and stops, the way a disabled submit button stops it. */
          onClick={(event) => {
            if (disabled || busy) {
              event.preventDefault();
              return;
            }
            onClick?.(event);
          }}
          renderRoot={disabled ? undefined : renderRoot}
          aria-pressed={pressed}
          aria-label={accessibleName}
          className={classes}
        >
          {children}
        </Button>
      </Tooltip>
      {disabled ? <VisuallyHidden id={reasonId}>{disabledReason}</VisuallyHidden> : null}
    </>
  );
}
