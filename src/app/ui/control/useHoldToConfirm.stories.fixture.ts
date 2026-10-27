import { install } from '@sinonjs/fake-timers';
import { userEvent } from 'storybook/test';

import { HOLD_SECONDS } from './useHoldToConfirm';

/**
 * Completes one hold on a hold-to-confirm trigger, for a story above the kit that proves what the hold sends (ADR-0005).
 * The kit's own stories and `useHoldToConfirm.test.tsx` cover the countdown, the early release and the hover text, so this only runs the hold to the end.
 * Only the hold's intervals are faked: pointer events, rendering and database waits keep their real clocks.
 */
export async function completeHold(trigger: HTMLElement) {
  const clock = install({ toFake: ['setInterval', 'clearInterval'], shouldClearNativeTimers: true });
  try {
    await userEvent.pointer({ target: trigger, keys: '[MouseLeft>]' });
    await clock.tickAsync(HOLD_SECONDS * 1000);
  } finally {
    try {
      await userEvent.pointer({ target: trigger, keys: '[/MouseLeft]' });
    } finally {
      clock.uninstall();
    }
  }
}
