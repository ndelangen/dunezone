import { Button, Tooltip } from '@mantine/core';

import { useHoldToConfirm } from './useHoldToConfirm';

export interface ConfirmDeleteButtonProps {
  /** What the hold does, as the button's own text, "Delete account". */
  label: string;
  /** True while the action is in flight. Latches the button so a second hold cannot fire it twice. */
  pending: boolean;
  /** Fires once the hold completes. The caller owns the mutation and whatever follows it. */
  onConfirm: () => void;
  /** Disables the button entirely, for preconditions the caller gates on: an unacknowledged checkbox, a missing choice. */
  disabled?: boolean;
}

/**
 * The full-width shape of the hold, for the deletions heavy enough to be a labelled button rather than a toolbar glyph.
 *
 * `useHoldToConfirm` owns the mechanics (the same five seconds, cancels and latch as `ConfirmDeleteAction`), and this shape puts the countdown where a button keeps its meaning: the label itself becomes "deletion in 4.." while held, and the hover text says "hold to delete" so a plain click's silence explains itself.
 * See docs/technical/ui-design-decisions.md, "Destructive actions are held, not asked twice".
 */
export function ConfirmDeleteButton({ label, pending, onConfirm, disabled = false }: ConfirmDeleteButtonProps) {
  const { holding, remaining, submitted, handlers } = useHoldToConfirm({ pending, onConfirm });
  return (
    <Tooltip label={holding ? `deletion in ${remaining}..` : 'hold to delete'} opened={holding ? true : undefined}>
      <Button color="red" variant="light" disabled={disabled} loading={pending || submitted} {...handlers}>
        {holding ? `deletion in ${remaining}..` : label}
      </Button>
    </Tooltip>
  );
}
