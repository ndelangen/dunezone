import { HOLD_SECONDS } from '@ui/control/useHoldToConfirm';
import { useEffect, useRef, useState } from 'react';

import type { Suggestion } from './suggestions';

/** The suggestion counting down, and the seconds it has left. */
export type HeldSuggestion = Readonly<{ key: string; remaining: number }>;

/**
 * The compass's hold for a destructive suggestion, such as clearing every chat: Enter or a press held on its row runs it after the same five seconds every delete takes, and letting go, moving the cursor or closing cancels.
 * The row's search field keeps focus, so the compass's keys drive the hold rather than the row's own handlers.
 * See docs/technical/ui-design-decisions.md, "Destructive actions are held, not asked twice".
 */
export function useHeldSuggestion() {
  const [held, setHeld] = useState<HeldSuggestion | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimer = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };
  /* A countdown must not outlive the controls that started it. */
  useEffect(() => stopTimer, []);

  const release = () => {
    stopTimer();
    setHeld(null);
  };
  /* A held key repeats its keydown; only the first one starts the countdown. */
  const hold = (suggestion: Suggestion) => {
    if (timer.current) {
      return;
    }
    let left = HOLD_SECONDS;
    setHeld({ key: suggestion.key, remaining: left });
    timer.current = setInterval(() => {
      left -= 1;
      if (left > 0) {
        setHeld({ key: suggestion.key, remaining: left });
        return;
      }
      release();
      suggestion.run();
    }, 1000);
  };
  return { held, hold, release };
}
