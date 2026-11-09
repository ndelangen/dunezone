import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';

/*
 * The prediction locket keeps everything on the phone (Norbert, 2026-11-09): the faction and turn picked, and, once locked,
 * the time Dune Zone's clock gave at the moment of locking. Dune Zone never sees the prediction.
 */

/** A faction as the locket draws it: its token from its emblem and background, or its published token where it was found by search. */
export type LocketFaction = Readonly<{
  id: string;
  name: string;
  emblem?: string;
  background?: unknown;
  src?: string | null;
}>;

export type LockedPrediction = Readonly<{
  faction: LocketFaction;
  turn: number;
  /** Milliseconds since 1970, by Dune Zone's clock, never the phone's. */
  lockedAt: number;
  revealed: boolean;
}>;

export type LocketState = Readonly<{
  /** The prediction being picked, before it is locked. */
  faction: LocketFaction | null;
  turn: number | null;
  locked: LockedPrediction | null;
}>;

/** Where this browser keeps the locket. */
export const PREDICTION_LOCKET_STORAGE_KEY = 'dunezone.tools.prediction-locket';

/** The turns offered: a game of Dune lasts ten. */
export const TURNS = 10;

const FRESH: LocketState = { faction: null, turn: null, locked: null };

const STORED_VERSION = 1;
const factionSchema = z.looseObject({ id: z.string(), name: z.string() });
const storedSchema = z.object({
  version: z.literal(STORED_VERSION),
  faction: factionSchema.nullable(),
  turn: z.number().int().min(1).max(TURNS).nullable(),
  locked: z
    .object({
      faction: factionSchema,
      turn: z.number().int().min(1).max(TURNS),
      lockedAt: z.number(),
      revealed: z.boolean(),
    })
    .nullable(),
});

function write(state: LocketState) {
  try {
    globalThis.localStorage?.setItem(
      PREDICTION_LOCKET_STORAGE_KEY,
      JSON.stringify({ ...state, version: STORED_VERSION })
    );
  } catch {
    /* Private windows may refuse storage; the locket still works for this visit. */
  }
}

/* Anything that is not the shape this version writes reads as nothing stored, so a bad entry never breaks the page. */
function read(): LocketState | null {
  try {
    const stored = globalThis.localStorage?.getItem(PREDICTION_LOCKET_STORAGE_KEY);
    const parsed = stored ? storedSchema.safeParse(JSON.parse(stored)) : null;
    return parsed?.success ? (parsed.data as unknown as LocketState) : null;
  } catch {
    return null;
  }
}

/** The locket as this browser keeps it, and the ways to change it. */
export function usePredictionLocket() {
  const [state, setState] = useState<LocketState>(() => read() ?? FRESH);
  useEffect(() => write(state), [state]);
  const pickFaction = useCallback((faction: LocketFaction) => setState((now) => ({ ...now, faction })), []);
  const pickTurn = useCallback((turn: number) => setState((now) => ({ ...now, turn })), []);
  const lock = useCallback(
    (lockedAt: number) =>
      setState((now) =>
        now.faction && now.turn
          ? { faction: null, turn: null, locked: { faction: now.faction, turn: now.turn, lockedAt, revealed: false } }
          : now
      ),
    []
  );
  const reveal = useCallback(
    () => setState((now) => (now.locked ? { ...now, locked: { ...now.locked, revealed: true } } : now)),
    []
  );
  const clear = useCallback(() => setState(FRESH), []);
  return { state, pickFaction, pickTurn, lock, reveal, clear };
}

/*
 * How long ago the prediction was locked, as the reveal says it: "2h 14m ago", "5m ago", or "just now" within the first minute.
 * No clock time, so a table across time zones reads the same thing (Norbert, 2026-11-09).
 */
export function lockedAgoText(lockedAt: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - lockedAt) / 60_000);
  if (minutes < 1) {
    return 'just now';
  }
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const parts = days > 0 ? [`${days}d`, `${hours}h`] : hours > 0 ? [`${hours}h`, `${rest}m`] : [`${rest}m`];
  return `${parts.join(' ')} ago`;
}
