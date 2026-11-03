import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { useReducedMotion } from './motion';
import { useSeen } from './useSeen';

/*
 * A figure that tells its story in numbered steps: the step count climbs on a timer once the reader reaches the figure.
 * Until scripts run, and under reduced motion, every step shows at once, so the picture is complete for the prerendered page and for a reader who asked for stillness.
 * `loop` starts over after a pause of `pause` intervals at the end, for a figure that plays as a cycle; otherwise `replay` starts it again on request.
 * A loop only runs while the figure is in view and the tab is visible, so nothing cycles unwatched, and takes up where it stopped when the reader comes back; a one-shot story plays on once it has started.
 * Once scripts run but before the reader arrives, the figure waits at its first step, so the story starts from the beginning when they get there.
 */
/** How many steps are shown: everything when the figure cannot or should not move, the first step while it waits for the reader. */
function shownSteps({
  animated,
  seen,
  step,
  total,
}: {
  animated: boolean;
  seen: boolean;
  step: number;
  total: number;
}) {
  if (!animated) {
    return total;
  }
  return seen ? step : 0;
}

type StepTimer = {
  from: number;
  total: number;
  interval: number;
  loop: boolean;
  pause: number;
  show: (step: number) => void;
};

/** Climbs from `from` to `total`, one step per interval; a loop holds the last step for `pause` intervals and starts over. Returns the cancel. */
function runSteps({ from, total, interval, loop, pause, show }: StepTimer) {
  let current = from;
  let timer: ReturnType<typeof setTimeout>;
  const next = () => {
    if (current < total) {
      current += 1;
      return current === total && loop ? interval * pause : interval;
    }
    current = 0;
    return interval;
  };
  const tick = () => {
    if (current >= total && !loop) {
      return;
    }
    const wait = next();
    show(current);
    timer = setTimeout(tick, wait);
  };
  timer = setTimeout(tick, interval);
  return () => clearTimeout(timer);
}

/** Runs the step timer while `ticking`, picking up from the step it stopped at. */
function useStepTimer({
  ticking,
  run,
  total,
  interval,
  loop,
  pause,
  position,
  setStep,
}: Omit<StepTimer, 'from' | 'show'> & {
  ticking: boolean;
  run: number;
  position: RefObject<number>;
  setStep: (step: number) => void;
}) {
  useEffect(() => {
    if (!ticking) {
      return;
    }
    return runSteps({
      from: position.current,
      total,
      interval,
      loop,
      pause,
      show: (next) => {
        position.current = next;
        setStep(next);
      },
    });
    /* `run` is a replay counter: bumping it restarts the timer from the first step. */
  }, [ticking, total, interval, loop, pause, run, position, setStep]);
}

export function useSteps(
  rootRef: RefObject<HTMLElement | null>,
  total: number,
  { interval, loop = false, pause = 4 }: { interval: number; loop?: boolean; pause?: number }
) {
  const { armed, seen, active } = useSeen(rootRef);
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);
  /* Where the timer stands, kept outside the render so the timer resumes from the step it stopped at. */
  const position = useRef(0);

  const playing = armed && seen && !reduced;
  const ticking = playing && (active || !loop);

  useStepTimer({ ticking, run, total, interval, loop, pause, position, setStep });

  return {
    step: shownSteps({ animated: armed && !reduced, seen, step, total }),
    finished: !playing || step >= total,
    replay: () => {
      position.current = 0;
      setStep(0);
      setRun((count) => count + 1);
    },
    playing,
    armed,
    seen,
    active,
  };
}
