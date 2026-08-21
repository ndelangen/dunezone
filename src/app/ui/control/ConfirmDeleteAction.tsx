import { Text } from '@mantine/core';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { IconAction } from './IconAction';

export interface ConfirmDeleteActionProps {
  /**
   * What gets deleted, as a verb phrase, for example "Delete faction".
   * The trigger's accessible name;
   * the hover text says "hold to delete" and the countdown while held.
   */
  label: string;
  /** True while the deletion is in flight. Latches the trigger so a second hold cannot fire it twice. */
  pending: boolean;
  /** Fires once the hold completes. The caller owns the mutation and navigates to the parent page on success. */
  onConfirm: () => void;
}

/** How long the trigger is held before the deletion fires. */
const HOLD_SECONDS = 5;

/**
 * Deletes something, if you mean it for five seconds.
 *
 * Callers own what is deleted and the words for it;
 * this owns the hold.
 * Hovering says "hold to delete";
 * pressing starts a countdown that the hover text and the glyph both show ("deletion in 4.."), and releasing anywhere short of zero cancels with nothing fired.
 * Norbert chose the hold over the previous expand-into-a-question two-step (2026-08-21): the question asked for a second decision, while the hold asks for sustained intent, which reads as safer and is one interaction rather than two.
 * See docs/technical/ui-design-decisions.md, "Destructive actions are held, not asked twice".
 *
 * The keyboard holds too: Space or Enter held down runs the same countdown, releasing the key cancels.
 * A plain click therefore does nothing, which is the point.
 * The mid-hold state lives here because it is furniture around committing the action, not something a caller ever needs to read.
 */
export function ConfirmDeleteAction({ label, pending, onConfirm }: ConfirmDeleteActionProps) {
  /* Seconds until the deletion fires; null while nothing is held. */
  const [remaining, setRemaining] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [sawPending, setSawPending] = useState(false);
  /* Reset during render, the search box's pattern: when the caller's round trip ends, a failed delete gets its retry back. */
  if (pending && !sawPending) {
    setSawPending(true);
  }
  if (!pending && sawPending) {
    setSawPending(false);
    setSubmitted(false);
  }

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimer = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };
  /* An unmounted countdown must not fire: the page may be navigating away for unrelated reasons. */
  useEffect(
    () => () => {
      stopTimer();
    },
    []
  );

  const cancelHold = () => {
    stopTimer();
    setRemaining(null);
  };

  /*
   * The countdown's source of truth is a ref, mirrored into state for display.
   * Firing from inside a state updater would make the updater impure, and React batches and may
   * re-invoke updaters, either of which turns one completed hold into a wrong number of deletions.
   */
  const secondsLeft = useRef(0);
  /* The interval closes over the render where the hold began; the ref keeps the fired callback current if the caller re-rendered mid-countdown. */
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const startHold = () => {
    if (pending || submitted || timer.current) {
      return;
    }
    secondsLeft.current = HOLD_SECONDS;
    setRemaining(HOLD_SECONDS);
    timer.current = setInterval(() => {
      secondsLeft.current -= 1;
      if (secondsLeft.current <= 0) {
        /* Latched before the callback, the double-fire guard this control has always carried: the caller's pending arrives a render later. */
        stopTimer();
        setRemaining(null);
        setSubmitted(true);
        onConfirmRef.current();
        return;
      }
      setRemaining(secondsLeft.current);
    }, 1000);
  };

  const holding = remaining !== null;
  return (
    <IconAction
      label={label}
      tooltip={holding ? `deletion in ${remaining}..` : 'hold to delete'}
      tooltipOpened={holding ? true : undefined}
      variant="light"
      color="red"
      size="lg"
      loading={pending || submitted}
      onPointerDown={(event) => {
        /* Only a primary press holds: a right or middle button five seconds down must not delete. */
        if (!event.isPrimary || event.button !== 0) {
          return;
        }
        /* Touch implicitly captures the pointer, which would retarget the leave event; releasing the capture lets sliding off the trigger cancel the way it does for a mouse. Capture exists only for touch, hence the check. */
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        startHold();
      }}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      /* Focus leaving mid-hold (Tab, window blur) takes the keyup with it; the hold must not outlive the reader's attention. */
      onBlur={cancelHold}
      /* A held key repeats its keydown; only the first one starts the countdown. */
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
          event.preventDefault();
          startHold();
        }
      }}
      /* Only the activation key's release cancels; letting go of an unrelated key mid-hold is not a change of mind. */
      onKeyUp={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          cancelHold();
        }
      }}
      /* A touch long-press would otherwise open the browser menu mid-hold. */
      onContextMenu={(event) => event.preventDefault()}
      icon={
        holding ? (
          <Text size="sm" fw={700} aria-hidden>
            {remaining}
          </Text>
        ) : (
          <Trash2 size={17} aria-hidden />
        )
      }
    />
  );
}
