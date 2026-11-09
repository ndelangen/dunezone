import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';

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

/*
 * What a read checks before the wheel trusts it: the shape this version writes.
 * Anything else, an older shape or a hand-edited value, reads as nothing stored, so a bad entry never breaks the page.
 */
const STORED_VERSION = 1;
const storedSchema = z.object({
  version: z.literal(STORED_VERSION),
  rulesetId: z.string().nullable(),
  faction: z
    .looseObject({
      id: z.string(),
      name: z.string(),
      emblem: z.string(),
      background: z.unknown(),
      leaders: z.array(
        z.looseObject({ id: z.string(), name: z.string(), strength: z.number().nullable(), image: z.string() })
      ),
      faces: z.array(
        z.looseObject({
          id: z.string(),
          name: z.string(),
          strength: z.number(),
          supportedStrength: z.number(),
          supportCost: z.number(),
          count: z.number(),
          image: z.string(),
        })
      ),
    })
    .nullable(),
  plan: z.object({
    leaderId: z.string().nullable(),
    leaderX: z.number(),
    troops: z.record(z.string(), z.number()),
    spice: z.number(),
  }),
  recent: z.array(z.looseObject({ id: z.string(), name: z.string(), emblem: z.string() })).optional(),
});

function read(storageKey: string): WheelState | null {
  try {
    const stored = globalThis.localStorage?.getItem(storageKey);
    const parsed = stored ? storedSchema.safeParse(JSON.parse(stored)) : null;
    /* The schema checks the parts the wheel reads; the token art inside is the catalogue's own, written by this page. */
    return parsed?.success ? (parsed.data as unknown as WheelState) : null;
  } catch {
    return null;
  }
}

export function useBattleWheel(storageKey: string, initial: WheelState = FRESH) {
  const [state, setState] = useState<WheelState>(() => read(storageKey) ?? initial);
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(storageKey, JSON.stringify({ ...state, version: STORED_VERSION }));
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
