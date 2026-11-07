import { ActionIcon, Tooltip, VisuallyHidden } from '@mantine/core';
import type { ActionIconProps } from '@mantine/core';
import clsx from 'clsx';
import { useId } from 'react';
import type {
  FocusEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  PointerEventHandler,
  ReactNode,
  Ref,
} from 'react';

import type { RenderRoot } from '../renderRoot';
import { EMPHASIS_VARIANT, INTENT_COLOR, tileVars } from './actionIntent';
import type { ActionEmphasis, ActionIntent } from './actionIntent';
import styles from './IconAction.module.css';

/* The hover text is also the name, and sometimes the only route to longer detail, so a keyboard focus opens it too. */
const TOOLTIP_EVENTS = { hover: true, focus: true, touch: false };

export interface IconActionProps extends Pick<ActionIconProps, 'size' | 'disabled' | 'loading'> {
  /**
   * What the action does, as a verb phrase: "Delete answer".
   * This is the accessible name and, unless `tooltip` says otherwise, the hover text: an icon-only control has no other way to say what it is, so the two cannot come apart.
   */
  label: string;
  /** The reader-facing meaning; the colour follows from it, never the other way round. */
  intent?: ActionIntent;
  /** How loudly the action renders; omitted keeps Mantine's default, which is strong. */
  emphasis?: ActionEmphasis;
  /** Longer hover text, when the glyph needs more explanation than its name. */
  tooltip?: ReactNode;
  /**
   * Why the action cannot run right now, as a sentence: "The PDF is still being prepared."
   * The action renders disabled but stays hoverable and focusable, and this becomes its hover text, so the reason sits on the control it explains instead of in a status beside it.
   * A plain `disabled` control cannot say why, since it takes no pointer events and so never opens its tooltip.
   */
  disabledReason?: string;
  /** The glyph. Sized by the caller; marked decorative here, since `label` carries the meaning. */
  icon: ReactNode;
  /** Makes the action a toggle that is on: it announces as pressed and wears the selected look, whatever its emphasis. */
  pressed?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** Press-and-hold support, for an action whose commitment is the held duration rather than the click. */
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onPointerUp?: PointerEventHandler<HTMLButtonElement>;
  onPointerLeave?: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel?: PointerEventHandler<HTMLButtonElement>;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  onKeyUp?: KeyboardEventHandler<HTMLButtonElement>;
  onContextMenu?: MouseEventHandler<HTMLButtonElement>;
  onBlur?: FocusEventHandler<HTMLButtonElement>;
  /** Forces the hover text open, for the moments it carries live state (a hold's countdown). */
  tooltipOpened?: boolean;
  /** Makes the action a link, in practice the router's `Link`. */
  renderRoot?: RenderRoot;
  /** Makes the action a plain anchor, for a destination outside the router. */
  href?: string;
  target?: string;
  rel?: string;
  type?: 'button' | 'submit';
  /** Submits a form this action sits outside of, by that form's id. */
  form?: string;
  /** Placement only. */
  className?: string;
  ref?: Ref<HTMLButtonElement>;
  /**
   * The attributes a drag library hangs on its activator: what a screen reader calls the control, where its live instructions live, and whether it is currently grabbed.
   *
   * Declared rather than left to the rest spread, because they reach the button either way and a later tightening of this membrane would drop them with no type error and no visible change.
   * `SortableReorderHandle` is the caller;
   * nothing else should need these.
   */
  role?: string;
  tabIndex?: number;
  'aria-describedby'?: string;
  /** Names the action from words on the page, over `label`, which stays the hover text; `AssetSelect` names its filter after the field's title this way. */
  'aria-labelledby'?: string;
  'aria-roledescription'?: string;
  'aria-pressed'?: boolean;
  'aria-disabled'?: boolean;
}

/**
 * A single action shown as a glyph, named for people who cannot see it.
 *
 * Callers own the glyph, the intent, and the words.
 * This component owns the one thing that must never be forgotten: an icon-only control carries its name in three places at once (the hover text, the accessible name, and nothing on screen), so it takes one `label` and fans it out, rather than letting a call site set a tooltip and omit the
 * `aria-label`.
 *
 * It replaces the hand-assembled `Tooltip` around `ActionIcon` that appeared ~50 times, where the pairing was a convention rather than a guarantee.
 */
export function IconAction({
  label,
  tooltip,
  disabledReason,
  tooltipOpened,
  icon,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  onKeyDown,
  onKeyUp,
  onContextMenu,
  onBlur,
  renderRoot,
  href,
  target,
  rel,
  type = 'button',
  form,
  className,
  ref,
  intent,
  emphasis,
  pressed,
  ...actionIconProps
}: IconActionProps) {
  const reasonId = useId();
  const resolvedColor = intent ? INTENT_COLOR[intent] : undefined;
  const tinted = pressed === true || emphasis === 'standard';
  const resolvedVariant = pressed ? 'light' : emphasis ? EMPHASIS_VARIANT[emphasis] : undefined;
  const vars = tinted ? () => tileVars(intent ?? 'neutral', pressed === true) : undefined;
  const classes = clsx(className, pressed && styles.pressed);
  const pressedState = pressed ?? actionIconProps['aria-pressed'];
  const disabled = disabledReason != null;
  /* A caller that already describes the control (a form's own message for the same reason) keeps that description instead of a second copy. */
  const ownReason = disabled && actionIconProps['aria-describedby'] == null;
  const describedBy = ownReason ? reasonId : actionIconProps['aria-describedby'];
  /*
   * One tree for both states, so the button a reader is focused on stays that button when its reason comes or goes.
   * Disabled is Mantine's own look without the `disabled` attribute that would swallow the hover, and the reason is also the control's description, for a reader who never hovers.
   * A disabled link renders as a button, since there is nowhere it may go.
   * Two element branches rather than one spread: `component="a"` re-types the whole element, so the anchor form cannot carry the button-shaped ref, click handler or form binding anyway.
   */
  return (
    <>
      {/* A longer explanation wraps at a readable width; the bare name stays on one line. */}
      <Tooltip
        label={disabled ? disabledReason : (tooltip ?? label)}
        opened={disabled ? undefined : tooltipOpened}
        events={TOOLTIP_EVENTS}
        multiline={disabled || tooltip != null}
        maw={disabled || tooltip != null ? 320 : undefined}
      >
        {href == null || disabled ? (
          <ActionIcon
            {...actionIconProps}
            color={resolvedColor}
            variant={resolvedVariant}
            vars={vars}
            /* A reason replaces Mantine's own disabled and loading, which set the attribute that swallows the hover. */
            disabled={disabled ? undefined : actionIconProps.disabled}
            loading={disabled ? undefined : actionIconProps.loading}
            aria-pressed={pressedState}
            ref={ref}
            type={disabled ? 'button' : renderRoot ? undefined : type}
            form={disabled ? undefined : form}
            data-disabled={disabled || undefined}
            aria-disabled={disabled || actionIconProps['aria-disabled'] || undefined}
            aria-describedby={describedBy}
            aria-label={label}
            onClick={disabled ? (event) => event.preventDefault() : onClick}
            onPointerDown={disabled ? undefined : onPointerDown}
            onPointerUp={disabled ? undefined : onPointerUp}
            onPointerLeave={disabled ? undefined : onPointerLeave}
            onPointerCancel={disabled ? undefined : onPointerCancel}
            onKeyDown={disabled ? undefined : onKeyDown}
            onKeyUp={disabled ? undefined : onKeyUp}
            onContextMenu={disabled ? undefined : onContextMenu}
            onBlur={onBlur}
            className={classes}
            renderRoot={disabled ? undefined : renderRoot}
          >
            {icon}
          </ActionIcon>
        ) : (
          <ActionIcon
            {...actionIconProps}
            color={resolvedColor}
            variant={resolvedVariant}
            vars={vars}
            component="a"
            href={href}
            target={target}
            rel={rel}
            aria-label={label}
            className={classes}
          >
            {icon}
          </ActionIcon>
        )}
      </Tooltip>
      {ownReason ? <VisuallyHidden id={reasonId}>{disabledReason}</VisuallyHidden> : null}
    </>
  );
}
