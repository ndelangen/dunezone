import { ActionIcon, Tooltip } from '@mantine/core';
import type { ActionIconProps } from '@mantine/core';
import type {
  FocusEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  PointerEventHandler,
  ReactNode,
  Ref,
} from 'react';

import type { RenderRoot } from '../renderRoot';

export interface IconActionProps extends Pick<ActionIconProps, 'variant' | 'color' | 'size' | 'disabled' | 'loading'> {
  /**
   * What the action does, as a verb phrase: "Delete answer".
   * This is the accessible name and, unless `tooltip` says otherwise, the hover text: an icon-only control has no other way to say what it is, so the two cannot come apart.
   */
  label: string;
  /** Longer hover text, when the glyph needs more explanation than its name. */
  tooltip?: ReactNode;
  /** The glyph. Sized by the caller; marked decorative here, since `label` carries the meaning. */
  icon: ReactNode;
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
  ...actionIconProps
}: IconActionProps) {
  /* Two branches rather than one spread: `component="a"` re-types the whole element, so the
     anchor form cannot carry the button-shaped ref, click handler or form binding anyway. */
  return (
    <Tooltip label={tooltip ?? label} opened={tooltipOpened}>
      {href == null ? (
        <ActionIcon
          {...actionIconProps}
          ref={ref}
          type={renderRoot ? undefined : type}
          form={form}
          aria-label={label}
          onClick={onClick}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onPointerCancel={onPointerCancel}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onContextMenu={onContextMenu}
          onBlur={onBlur}
          className={className}
          renderRoot={renderRoot}
        >
          {icon}
        </ActionIcon>
      ) : (
        <ActionIcon
          {...actionIconProps}
          component="a"
          href={href}
          target={target}
          rel={rel}
          aria-label={label}
          className={className}
        >
          {icon}
        </ActionIcon>
      )}
    </Tooltip>
  );
}
