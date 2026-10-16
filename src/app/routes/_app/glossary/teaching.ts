import { useReducedMotion } from '@mantine/hooks';
import { createContext, useContext, useEffect, useState } from 'react';

/** The glossary term a reader is pointing at or has focused, which its topic's picture demonstrates. */
export const TeachingTermContext = createContext<string | null>(null);

export function useTeachingTerm() {
  return useContext(TeachingTermContext);
}

/*
 * Steps through a demonstration while it plays, starting again from the first step each time it begins.
 * A reader who asks for less motion sees the demonstration's last step, held still.
 */
export function useTeachingStep(playing: boolean, steps: number, interval = 700) {
  const reducedMotion = useReducedMotion();
  /* Each run of a demonstration counts its own ticks, so a new run starts from the first step without resetting state. */
  const run = `${playing}:${steps}:${interval}`;
  const [ticks, setTicks] = useState({ run, count: 0 });
  useEffect(() => {
    if (!playing || reducedMotion || steps < 2) {
      return undefined;
    }
    const timer = setInterval(
      () => setTicks((current) => ({ run, count: current.run === run ? current.count + 1 : 1 })),
      interval
    );
    return () => {
      clearInterval(timer);
      /* Pointing at the same term again starts its demonstration over. */
      setTicks({ run: '', count: 0 });
    };
  }, [playing, steps, interval, reducedMotion, run]);
  if (!playing) {
    return 0;
  }
  if (reducedMotion) {
    return steps - 1;
  }
  return ticks.run === run ? ticks.count % steps : 0;
}
