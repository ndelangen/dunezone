import { Menu } from '@mantine/core';
import type { PointerEvent } from 'react';

import { useHoldToConfirm } from './useHoldToConfirm';

export interface ConfirmDeleteMenuItemProps {
  /** What holding the item does, shown at rest, for example "Hold to delete permanently". */
  label: string;
  /** Fires once the hold completes. */
  onConfirm: () => void;
  /** Disables the item, and drops a countdown already running. */
  disabled?: boolean;
  /** True while the request runs, so a failed request can be retried in the same menu. */
  pending?: boolean;
  /** The countdown's verb, "Deleting" unless the item does something else for good, such as "Leaving". */
  holdingVerb?: string;
  closeMenuOnClick?: boolean;
}

/* Both labels share one grid cell, so the item keeps its resting width while it counts down and a press near its edge stays on it. */
const CELL = { gridArea: '1 / 1' } as const;

/**
 * Deletes something from a menu, if you mean it for five seconds: the menu shape of `ConfirmDeleteAction`.
 * The item's own words become the countdown ("Deleting in 4.."), and releasing, sliding off or moving focus away cancels with nothing fired.
 * See docs/technical/ui-design-decisions.md, "Destructive actions are held, not asked twice".
 */
export function ConfirmDeleteMenuItem({
  label,
  onConfirm,
  disabled = false,
  pending = false,
  holdingVerb = 'Deleting',
  closeMenuOnClick = true,
}: ConfirmDeleteMenuItemProps) {
  const { holding, remaining, handlers } = useHoldToConfirm({ pending, blocked: disabled, onConfirm });
  return (
    <Menu.Item
      color="red"
      closeMenuOnClick={closeMenuOnClick}
      disabled={disabled || pending}
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
          {holdingVerb} in {remaining ?? 5}..
        </span>
      </span>
    </Menu.Item>
  );
}
