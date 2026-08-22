import { Text } from '@mantine/core';
import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { IconAction } from './IconAction';
import { useHoldToConfirm } from './useHoldToConfirm';

export interface ConfirmDeleteActionProps {
  /**
   * What the hold does, as a verb phrase, for example "Delete faction" or "Remove member".
   * The trigger's accessible name;
   * the hover text says "hold to <verb>" and the countdown while held.
   */
  label: string;
  /** True while the action is in flight. Latches the trigger so a second hold cannot fire it twice. */
  pending: boolean;
  /** Fires once the hold completes. The caller owns the mutation and navigates to the parent page on success. */
  onConfirm: () => void;
  /**
   * The word the hover text and countdown use, `delete` unless the action removes a thing from somewhere rather than from existence.
   * A removal held five seconds is the same commitment;
   * only the words differ.
   */
  verb?: 'delete' | 'remove';
  /** The glyph, when the action is not the trash can. A member removal keeps its own icon. */
  icon?: ReactNode;
  /** Disables the trigger entirely, for callers whose action is sometimes unavailable rather than in flight. */
  disabled?: boolean;
  /** The trigger's size: `lg` for toolbars, smaller where the hold sits in a dense row among same-sized neighbours. */
  size?: 'sm' | 'md' | 'lg';
}

/** What the countdown announces per verb: "deletion in 4..", "removal in 4..". */
const COUNTDOWN_NOUN = { delete: 'deletion', remove: 'removal' } as const;

/**
 * Deletes (or removes) something, if you mean it for five seconds.
 *
 * Callers own what is acted on and the words for it;
 * `useHoldToConfirm` owns the hold, and this shape owns how an icon trigger wears it: hovering says "hold to delete", pressing counts down in the hover text and the glyph ("deletion in 4.."), and releasing anywhere short of zero cancels with nothing fired.
 * The keyboard holds too: Space or Enter held down runs the same countdown, releasing the key cancels.
 * A plain click therefore does nothing, which is the point.
 * See docs/technical/ui-design-decisions.md, "Destructive actions are held, not asked twice".
 */
export function ConfirmDeleteAction({
  label,
  pending,
  onConfirm,
  verb = 'delete',
  icon,
  disabled = false,
  size = 'lg',
}: ConfirmDeleteActionProps) {
  const { holding, remaining, submitted, handlers } = useHoldToConfirm({ pending, onConfirm });
  return (
    <IconAction
      label={label}
      tooltip={holding ? `${COUNTDOWN_NOUN[verb]} in ${remaining}..` : `hold to ${verb}`}
      tooltipOpened={holding ? true : undefined}
      variant="light"
      color="red"
      size={size}
      disabled={disabled}
      loading={pending || submitted}
      {...handlers}
      icon={
        holding ? (
          <Text size="sm" fw={700} aria-hidden>
            {remaining}
          </Text>
        ) : (
          (icon ?? <Trash2 size={17} aria-hidden />)
        )
      }
    />
  );
}
