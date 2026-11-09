import { useCallback, useEffect, useState } from 'react';

import { EMPTY_PLAN } from './battleWheel';
import type { FactionChoice, WheelFaction, WheelPlan } from './battleWheel';

/* What this browser remembers between battles: the table's Ruleset, the player's faction, the plan on the wheel, and the factions picked before. */
export type WheelState = Readonly<{
  rulesetId: string | null;
  faction: WheelFaction | null;
  plan: WheelPlan;
  /** Factions picked before, so a faction found by search stays one tap away. */
  recent?: readonly FactionChoice[];
}>;

const FRESH: WheelState = { rulesetId: null, faction: null, plan: EMPTY_PLAN };
const MOST_RECENT = 6;

function read(storageKey: string): WheelState | null {
  try {
    const stored = globalThis.localStorage?.getItem(storageKey);
    return stored ? (JSON.parse(stored) as WheelState) : null;
  } catch {
    return null;
  }
}

export function useBattleWheel(storageKey: string, initial: WheelState = FRESH) {
  const [state, setState] = useState<WheelState>(() => read(storageKey) ?? initial);
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* Private windows may refuse storage; the wheel still works for this visit. */
    }
  }, [storageKey, state]);
  const setPlan = useCallback((plan: WheelPlan) => setState((was) => ({ ...was, plan })), []);
  const chooseRuleset = useCallback((rulesetId: string) => setState((was) => ({ ...was, rulesetId })), []);
  /* Another faction has other leaders and troops, so its wheel starts empty. */
  const chooseFaction = useCallback(
    (faction: WheelFaction) =>
      setState((was) => ({
        ...was,
        faction,
        plan: faction.id === was.faction?.id ? was.plan : EMPTY_PLAN,
        recent: [
          { id: faction.id, name: faction.name, emblem: faction.emblem, background: faction.background },
          ...(was.recent ?? []).filter((known) => known.id !== faction.id),
        ].slice(0, MOST_RECENT),
      })),
    []
  );
  const clear = useCallback(() => setState((was) => ({ ...was, plan: EMPTY_PLAN })), []);
  return { state, setPlan, chooseRuleset, chooseFaction, clear };
}
