import { Button, Group, Select, Text } from '@mantine/core';
import { createContext, useContext, useEffect, useReducer } from 'react';
import type { ReactNode } from 'react';

import styles from './biddingClockPrototype.module.css';

/* Four timer-only variations on the existing bidder; this provider is mounted only by the throwaway story. */
const variants = [
  { value: 'ring', label: 'Ring around the existing button' },
  { value: 'dial', label: 'Small dial beside the existing time' },
  { value: 'bar', label: 'Thin bar beneath the existing button' },
  { value: 'pill', label: 'Progress inside the existing time label' },
] as const;
type Variant = (typeof variants)[number]['value'];
export type BiddingClockPrototypeState = {
  variant: Variant;
  enabled: boolean;
  remaining: number;
  deadline: number | null;
};
type State = BiddingClockPrototypeState;
type Event =
  | { type: 'variant'; variant: Variant }
  | { type: 'toggle' }
  | { type: 'run' }
  | { type: 'tick'; now: number };
function reduce(state: State, event: Event): State {
  switch (event.type) {
    case 'variant':
      return { ...state, variant: event.variant, remaining: 12, deadline: null };
    case 'toggle':
      return { ...state, enabled: !state.enabled, remaining: 20, deadline: null };
    case 'run':
      return { ...state, enabled: true, remaining: 20, deadline: performance.now() + 20_000 };
    case 'tick':
      return state.deadline === null
        ? state
        : { ...state, remaining: Math.max(0, Math.ceil((state.deadline - event.now) / 1000)) };
  }
}
type Clock = State & { toggle(): void };
const Context = createContext<Clock | null>(null);
export const useBiddingClockPrototype = () => useContext(Context);

export function BiddingClockPrototypeProvider({ children }: { children: ReactNode }) {
  const value = new URLSearchParams(window.location.search).get('variant');
  const selected = variants.find((entry) => entry.value === value)?.value ?? 'ring';
  const [state, dispatch] = useReducer(reduce, { variant: selected, enabled: true, remaining: 12, deadline: null });
  useEffect(() => {
    if (state.deadline === null) {
      return;
    }
    const interval = window.setInterval(() => dispatch({ type: 'tick', now: performance.now() }), 200);
    return () => window.clearInterval(interval);
  }, [state.deadline]);
  function choose(variant: Variant) {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', variant);
    window.history.replaceState(null, '', url);
    dispatch({ type: 'variant', variant });
  }
  function step(direction: number) {
    const index = variants.findIndex((entry) => entry.value === state.variant);
    choose(variants[(index + direction + variants.length) % variants.length]!.value);
  }
  return (
    <Context value={{ ...state, toggle: () => dispatch({ type: 'toggle' }) }}>
      {children}
      <Group className={styles.switcher} gap="xs" justify="center">
        <Text size="xs">Timer-only prototype</Text>
        <Button variant="subtle" aria-label="Previous timer design" onClick={() => step(-1)}>
          ‹
        </Button>
        <Select
          aria-label="Timer design"
          data={[...variants]}
          value={state.variant}
          onChange={(value) => value && choose(value as Variant)}
        />
        <Button variant="subtle" aria-label="Next timer design" onClick={() => step(1)}>
          ›
        </Button>
        <Button variant="default" onClick={() => dispatch({ type: 'run' })}>
          Preview 20 seconds
        </Button>
      </Group>
    </Context>
  );
}
