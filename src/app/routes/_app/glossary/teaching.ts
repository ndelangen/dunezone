import { createContext, useContext, useEffect, useState } from 'react';

/** The glossary term a reader is pointing at, which its topic's picture demonstrates. */
export const TeachingTermContext = createContext<string | null>(null);

export function useTeachingTerm() {
  return useContext(TeachingTermContext);
}

/** A fresh random number each time the reader points at a term, so a demonstration can vary from one pointing to the next. */
export const TeachingRunContext = createContext(0);

export function useTeachingRun() {
  return useContext(TeachingRunContext);
}

/*
 * Steps through a demonstration while it plays, starting again from the first step each time it begins.
 * Demonstrations play whatever the reader's reduced-motion setting says: they only move while the reader points at a term, and a still frame cannot show what the term means.
 */
export function useTeachingStep(playing: boolean, steps: number, interval = 700) {
  /* Each pointing at a term is its own run with its own tick count, so a new run starts from the first step. */
  const term = useTeachingTerm();
  const pointing = useTeachingRun();
  const run = `${term}:${pointing}:${steps}:${interval}`;
  const [ticks, setTicks] = useState({ run, count: 0 });
  useEffect(() => {
    if (!playing || steps < 2) {
      return undefined;
    }
    const timer = setInterval(
      () => setTicks((current) => ({ run, count: current.run === run ? current.count + 1 : 1 })),
      interval
    );
    return () => clearInterval(timer);
  }, [playing, steps, interval, run]);
  if (!playing) {
    return 0;
  }
  return ticks.run === run ? ticks.count % steps : 0;
}
