import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

import { useReducedMotion } from './motion';
import { useSeen } from './useSeen';

/*
 * A figure that tells its story in numbered steps: the step count climbs on a timer once the reader reaches the figure.
 * Until scripts run, and under reduced motion, every step shows at once, so the picture is complete for the prerendered page and for a reader who asked for stillness.
 * `loop` starts over after a pause of `pause` intervals at the end, for a figure that plays as a cycle; otherwise `replay` starts it again on request.
 */
export function useSteps(
  rootRef: RefObject<HTMLElement | null>,
  total: number,
  { interval, loop = false, pause = 4 }: { interval: number; loop?: boolean; pause?: number }
) {
  const { armed, seen } = useSeen(rootRef);
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);

  const playing = armed && seen && !reduced;

  useEffect(() => {
    if (!playing) {
      return;
    }
    let current = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (current < total) {
        current += 1;
        setStep(current);
        timer = setTimeout(tick, current === total && loop ? interval * pause : interval);
      } else if (loop) {
        current = 0;
        setStep(0);
        timer = setTimeout(tick, interval);
      }
    };
    timer = setTimeout(tick, interval);
    return () => clearTimeout(timer);
    /* `run` is a replay counter: bumping it restarts the timer from the first step. */
  }, [playing, total, interval, loop, pause, run]);

  return {
    /* How many steps are shown; everything shows when the figure cannot or should not move. */
    step: playing ? step : total,
    finished: !playing || step >= total,
    replay: () => {
      setStep(0);
      setRun((count) => count + 1);
    },
    playing,
    armed,
    seen,
  };
}
