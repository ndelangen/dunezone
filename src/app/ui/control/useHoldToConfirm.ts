import { useEffect, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, MouseEvent, PointerEvent } from 'react';

/** Space or Enter: the two keys that press a button, and so the two that hold one. */
function isActivationKey(event: KeyboardEvent<HTMLElement>): boolean {
  return event.key === 'Enter' || event.key === ' ';
}

/** How long a destructive trigger is held before it fires. One number for the whole application, so every hold means the same thing. */
const HOLD_SECONDS = 5;

/**
 * The hold behind every destructive trigger: five seconds of sustained press, then the action fires once.
 *
 * Norbert chose the hold over the ask-twice question (2026-08-21): the question asked for a second decision, while the hold asks for sustained intent, which reads as safer and is one interaction rather than two.
 * See docs/technical/ui-design-decisions.md, "Destructive actions are held, not asked twice".
 *
 * This hook owns the mechanics and nothing visual: the countdown (a ref as source of truth, mirrored into state for display, because firing from inside a state updater would make it impure, and React batches and may re-invoke updaters, either of which turns one completed hold into a wrong number of firings), the latch that keeps a finished hold from firing twice before the caller's `pending` arrives, its render-phase reset when the round trip ends so a failed action gets its retry back, and the handler bag: only a primary press holds, touch releases its implicit capture so drag-off cancels, blur cancels, a repeated keydown does not restart, only the activation key's release cancels, and the context menu stays closed mid-hold.
 *
 * The shapes that wear it (`ConfirmDeleteAction` for the icon triggers, `ConfirmDeleteButton` for the full-width ones) own the words and the glyphs;
 * spread `handlers` onto the pressable element and render `remaining` while `holding`.
 */
export function useHoldToConfirm({ pending, onConfirm }: { pending: boolean; onConfirm: () => void }) {
  /* Seconds until the action fires; null while nothing is held. */
  const [remaining, setRemaining] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [sawPending, setSawPending] = useState(false);
  /* Reset during render, the search box's pattern. */
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

  const secondsLeft = useRef(0);
  /* The interval closes over the render where the hold began; the ref keeps the fired callback current if the caller re-rendered mid-countdown. */
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const startHold = () => {
    /* One name for the three reasons a hold may not start: the caller is busy, a fired hold awaits its pending, or a countdown already runs. */
    const blocked = pending || submitted || timer.current !== null;
    if (blocked) {
      return;
    }
    secondsLeft.current = HOLD_SECONDS;
    setRemaining(HOLD_SECONDS);
    timer.current = setInterval(() => {
      secondsLeft.current -= 1;
      if (secondsLeft.current <= 0) {
        /* Latched before the callback: the caller's pending arrives a render later. */
        stopTimer();
        setRemaining(null);
        setSubmitted(true);
        onConfirmRef.current();
        return;
      }
      setRemaining(secondsLeft.current);
    }, 1000);
  };

  const handlers = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      /* Only a primary press holds: a right or middle button five seconds down must not fire. */
      if (!event.isPrimary || event.button !== 0) {
        return;
      }
      /* Touch implicitly captures the pointer, which would retarget the leave event; releasing the capture lets sliding off the trigger cancel the way it does for a mouse. Capture exists only for touch, hence the check. */
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      startHold();
    },
    onPointerUp: cancelHold,
    onPointerLeave: cancelHold,
    onPointerCancel: cancelHold,
    /* Focus leaving mid-hold (Tab, window blur) takes the keyup with it; the hold must not outlive the reader's attention. */
    onBlur: (_event: FocusEvent<HTMLElement>) => cancelHold(),
    /* A held key repeats its keydown; only the first one starts the countdown. */
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (isActivationKey(event) && !event.repeat) {
        event.preventDefault();
        startHold();
      }
    },
    /* Only the activation key's release cancels; letting go of an unrelated key mid-hold is not a change of mind. */
    onKeyUp: (event: KeyboardEvent<HTMLElement>) => {
      if (isActivationKey(event)) {
        cancelHold();
      }
    },
    /* A touch long-press would otherwise open the browser menu mid-hold. */
    onContextMenu: (event: MouseEvent<HTMLElement>) => event.preventDefault(),
  };

  return { holding: remaining !== null, remaining, submitted, handlers };
}
