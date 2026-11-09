import { useCallback, useEffect, useState } from 'react';

import { EMPTY_PLAN } from './battleWheel';
import type { WheelPlan } from './battleWheel';

/* What this browser remembers between battles: the table's Ruleset, the player's faction and the plan on the wheel. */
export type WheelState = Readonly<{ rulesetId: string; factionId: string; plan: WheelPlan }>;

function read(storageKey: string): WheelState | null {
  try {
    const stored = globalThis.localStorage?.getItem(storageKey);
    return stored ? (JSON.parse(stored) as WheelState) : null;
  } catch {
    return null;
  }
}

export function useBattleWheel(storageKey: string, initial: WheelState) {
  const [state, setState] = useState<WheelState>(() => read(storageKey) ?? initial);
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* Private windows may refuse storage; the wheel still works for this visit. */
    }
  }, [storageKey, state]);
  const setPlan = useCallback((plan: WheelPlan) => setState((was) => ({ ...was, plan })), []);
  const choose = useCallback(
    (next: Partial<Pick<WheelState, 'rulesetId' | 'factionId'>>) =>
      setState((was) => ({
        ...was,
        ...next,
        /* Another faction has other leaders and troops, so its wheel starts empty. */
        plan: next.factionId && next.factionId !== was.factionId ? EMPTY_PLAN : was.plan,
      })),
    []
  );
  const clear = useCallback(() => setState((was) => ({ ...was, plan: EMPTY_PLAN })), []);
  return { state, setPlan, choose, clear };
}
