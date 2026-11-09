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
  /** The time zone of the city the player named when locking, which the lock time is shown in. */
  timeZone: string;
  revealed: boolean;
}>;

export type LocketState = Readonly<{
  /** The prediction being picked, before it is locked. */
  faction: LocketFaction | null;
  turn: number | null;
  /** The time zone of the player's city, kept for the next prediction; null until named, then the phone's own zone is offered. */
  timeZone: string | null;
  locked: LockedPrediction | null;
}>;

/** Where this browser keeps the locket. */
export const PREDICTION_LOCKET_STORAGE_KEY = 'dunezone.tools.prediction-locket';

/** The turns offered: a game of Dune lasts ten. */
export const TURNS = 10;

const FRESH: LocketState = { faction: null, turn: null, timeZone: null, locked: null };

const STORED_VERSION = 2;
/* A zone this browser cannot show a time in reads as nothing stored, rather than breaking the page. */
const zoneSchema = z.string().refine((zone) => {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone });
    return true;
  } catch {
    return false;
  }
});
const factionSchema = z.looseObject({ id: z.string(), name: z.string() });
const storedSchema = z.object({
  version: z.literal(STORED_VERSION),
  faction: factionSchema.nullable(),
  turn: z.number().int().min(1).max(TURNS).nullable(),
  timeZone: zoneSchema.nullable(),
  locked: z
    .object({
      faction: factionSchema,
      turn: z.number().int().min(1).max(TURNS),
      lockedAt: z.number(),
      timeZone: zoneSchema,
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
  const pickTimeZone = useCallback((timeZone: string) => setState((now) => ({ ...now, timeZone })), []);
  const lock = useCallback(
    (lockedAt: number, timeZone: string) =>
      setState((now) =>
        now.faction && now.turn
          ? {
              faction: null,
              turn: null,
              timeZone,
              locked: { faction: now.faction, turn: now.turn, lockedAt, timeZone, revealed: false },
            }
          : now
      ),
    []
  );
  const reveal = useCallback(
    () => setState((now) => (now.locked ? { ...now, locked: { ...now.locked, revealed: true } } : now)),
    []
  );
  /* The city stays named for the next prediction. */
  const clear = useCallback(() => setState((now) => ({ ...FRESH, timeZone: now.timeZone })), []);
  return { state, pickFaction, pickTurn, pickTimeZone, lock, reveal, clear };
}

/*
 * The lock time as the table reads it: Dune Zone's time shown in the city the player named, with the city beside it,
 * so nobody at the table has to work out a time zone, and the phone's clock plays no part (Norbert, 2026-11-09).
 */
export function lockTimeText(lockedAt: number, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(lockedAt);
}

export type City = Readonly<{ timeZone: string; name: string; region: string }>;

/** A time zone's city as people say it: "America/New_York" is New York, in America. */
export function cityOf(timeZone: string): City {
  const parts = timeZone.split('/');
  return {
    timeZone,
    name: parts[parts.length - 1]!.replaceAll('_', ' '),
    region: parts.slice(0, -1).join(' / ').replaceAll('_', ' '),
  };
}

/** Every city this browser knows a time zone for, by name. */
export function knownCities(): readonly City[] {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'];
  return zones
    .filter((zone) => zone.includes('/'))
    .map(cityOf)
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/** The phone's own time zone, offered until the player names a city: a setting the player can see, not its clock. */
export function phoneTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}
