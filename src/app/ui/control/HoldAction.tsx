import { Button, Menu, Text, Tooltip } from '@mantine/core';
import { BookUp2, Replace, Trash2 } from 'lucide-react';
import type { PointerEvent, ReactNode } from 'react';

import { IconAction } from './IconAction';
import { useHoldToConfirm } from './useHoldToConfirm';

/** What the hold does for good. Each verb only changes the words (and, for convert and publish, the glyph and colour); the five-second hold is the same. */
export type HoldVerb = 'delete' | 'remove' | 'sign out' | 'clear' | 'convert' | 'publish' | 'leave';

/** How the hold is drawn: a toolbar glyph, a full-width labelled button, or an item in a menu. */
export type HoldShape = 'icon' | 'button' | 'menu-item';

/** The countdown per verb: a noun for the hover text and the button ("deletion in 4.."), a participle for a menu item ("Deleting in 4.."). */
const WORDS: Record<HoldVerb, { noun: string; doing: string }> = {
  delete: { noun: 'deletion', doing: 'Deleting' },
  remove: { noun: 'removal', doing: 'Removing' },
  'sign out': { noun: 'sign-out', doing: 'Signing out' },
  clear: { noun: 'clearing', doing: 'Clearing' },
  convert: { noun: 'conversion', doing: 'Converting' },
  publish: { noun: 'publishing', doing: 'Publishing' },
  leave: { noun: 'leaving', doing: 'Leaving' },
};

function defaultGlyph(verb: HoldVerb) {
  if (verb === 'convert') return <Replace size={17} aria-hidden />;
  if (verb === 'publish') return <BookUp2 size={17} aria-hidden />;
  return <Trash2 size={17} aria-hidden />;
}

/* A menu item's two labels share one grid cell, so the item keeps its resting width while it counts down and a press near its edge stays on it. */
const CELL = { gridArea: '1 / 1' } as const;

export interface HoldActionProps {
  /**
   * What the hold does: the icon's accessible name ("Delete faction"), or the words on a button or menu item ("Delete account", "Hold to delete permanently").
   */
  label: string;
  /** Fires once the hold completes. The caller owns the mutation and whatever follows it. */
  onConfirm: () => void;
  /** True while the caller's request runs. Latches the trigger so a second hold cannot fire it twice; a failed request releases it for a retry. */
  pending?: boolean;
  /** The words the hold uses, `delete` by default. */
  verb?: HoldVerb;
  /** The trigger's shape, `icon` by default. */
  shape?: HoldShape;
  /** The glyph of an icon trigger, when the verb's default (trash, replace, book) is not the thing acted on. */
  icon?: ReactNode;
  /** Disables the trigger, for preconditions the caller gates on; drops a countdown already running. */
  disabled?: boolean;
  /** Why the hold is unavailable right now. Disables it, and an icon trigger says this on hover instead of "hold to …". */
  disabledReason?: string;
  /** The hover text at rest, when "hold to <verb>" needs a consequence spelled out, as a conversion does. */
  hint?: string;
  /** An icon trigger's size: `lg` for toolbars, smaller in dense rows, or a length matching neighbours the kit does not draw. */
  size?: 'sm' | 'md' | 'lg' | `${number}rem`;
  /** An icon trigger among buttons the kit does not draw: the class that matches their corners. */
  className?: string;
  /** A menu item that leaves its menu open on a short click. */
  closeMenuOnClick?: boolean;
}

/**
 * Does something for good, if you mean it for five seconds.
 *
 * `useHoldToConfirm` owns the hold; this owns how each shape wears it.
 * Hovering says "hold to delete", pressing counts down ("deletion in 4.." in the hover text and the glyph, or in the button's or item's own words), and releasing early cancels with nothing fired.
 * Space and Enter hold too. A plain click does nothing, which is the point.
 * Publishing wears its own colour so it never reads as a second Save; every other verb is red.
 * See docs/technical/ui-design-decisions.md, "Destructive actions are held, not asked twice".
 */
export function HoldAction({
  label,
  onConfirm,
  pending = false,
  verb = 'delete',
  shape = 'icon',
  icon,
  disabled = false,
  disabledReason,
  hint,
  size = 'lg',
  className,
  closeMenuOnClick = true,
}: HoldActionProps) {
  const blocked = disabled || disabledReason != null;
  const { holding, remaining, submitted, handlers } = useHoldToConfirm({ pending, onConfirm, blocked });
  const { noun, doing } = WORDS[verb];
  const countdown = `${noun} in ${remaining}..`;
  const atRest = hint ?? `hold to ${verb}`;
  /* A hold already fired keeps its spinner until the page settles, whatever the page now says about the hold. */
  const busy = pending || submitted;

  if (shape === 'menu-item') {
    return (
      <Menu.Item
        color="red"
        closeMenuOnClick={closeMenuOnClick}
        disabled={blocked || pending}
        {...handlers}
        onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
          /* Mantine keeps a pressed item from taking focus, so the hold focuses it: focus moving elsewhere then blurs it and cancels. */
          event.currentTarget.focus();
          handlers.onPointerDown(event);
        }}
      >
        <span style={{ display: 'inline-grid' }}>
          <span style={{ ...CELL, visibility: holding ? 'hidden' : undefined }} aria-hidden={holding}>
            {label}
          </span>
          <span style={{ ...CELL, visibility: holding ? undefined : 'hidden' }} aria-hidden={!holding}>
            {doing} in {remaining ?? 5}..
          </span>
        </span>
      </Menu.Item>
    );
  }

  if (shape === 'button') {
    return (
      <Tooltip label={holding ? countdown : (disabledReason ?? atRest)} opened={holding ? true : undefined}>
        <Button color="red" variant="light" disabled={blocked} loading={busy} {...handlers}>
          {holding ? countdown : label}
        </Button>
      </Tooltip>
    );
  }

  const publish = verb === 'publish';
  const glyph = icon ?? defaultGlyph(verb);
  if (disabledReason != null && !busy) {
    return (
      <IconAction
        label={label}
        disabledReason={disabledReason}
        intent={publish ? 'publish' : 'negative'}
        emphasis={publish ? 'strong' : 'standard'}
        size={size}
        className={className}
        icon={glyph}
      />
    );
  }
  return (
    <IconAction
      label={label}
      tooltip={holding ? countdown : atRest}
      tooltipOpened={holding ? true : undefined}
      intent={publish ? 'publish' : 'negative'}
      emphasis={publish ? 'strong' : 'standard'}
      size={size}
      className={className}
      disabled={disabled}
      loading={busy}
      {...handlers}
      icon={
        holding ? (
          <Text size="sm" fw={700} aria-hidden>
            {remaining}
          </Text>
        ) : (
          glyph
        )
      }
    />
  );
}
