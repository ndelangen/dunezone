import { useCallback, useEffect, useRef, useState } from 'react';
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

/** The turns offered one tap each: a game of Dune usually lasts ten. Any later turn is a step past them (Norbert, 2026-11-09). */
export const TURNS = 10;

const FRESH: LocketState = { faction: null, turn: null, timeZone: null, locked: null };

const STORED_VERSION = 2;

const factionSchema = z.looseObject({ id: z.string(), name: z.string() });
const storedSchema = z.object({
  version: z.literal(STORED_VERSION),
  faction: factionSchema.nullable(),
  turn: z.number().int().min(1).nullable(),
  timeZone: z.string().nullable(),
  locked: z
    .object({
      faction: factionSchema,
      turn: z.number().int().min(1),
      lockedAt: z.number(),
      timeZone: z.string(),
      revealed: z.boolean(),
    })
    .nullable(),
});

/* Whether the write held: a private window, or a full storage, may refuse it, and the locket then lasts only this visit. */
function write(state: LocketState): boolean {
  try {
    globalThis.localStorage.setItem(
      PREDICTION_LOCKET_STORAGE_KEY,
      JSON.stringify({ ...state, version: STORED_VERSION })
    );
    return true;
  } catch {
    return false;
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

/* Whether this browser lets the locket be kept: a private window may refuse, and then a reload loses the prediction. */
function storageWorks(): boolean {
  try {
    const probe = `${PREDICTION_LOCKET_STORAGE_KEY}.probe`;
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** The locket as this browser keeps it, and the ways to change it. */
export function usePredictionLocket() {
  const [state, setState] = useState<LocketState>(() => read() ?? FRESH);
  const [kept, setKept] = useState(storageWorks);
  /* The locket as this tab last saw or saved it, for the changes below to build on without waiting for a render. */
  const current = useRef(state);
  /*
   * Every change is saved the moment it is made, in the same step that checks storage, so nothing written later can land
   * on top of a lock another tab saved in between: no change waits for a render to be saved.
   */
  const commit = useCallback((next: LocketState): boolean => {
    current.current = next;
    setState(next);
    return write(next);
  }, []);
  /* Takes what another tab saved, when it holds a lock this tab must not write over. */
  const adoptStoredLock = useCallback((): boolean => {
    const stored = read();
    if (!stored?.locked) {
      return false;
    }
    current.current = stored;
    setState(stored);
    return true;
  }, []);
  /* Another tab of the tool changed the locket: take its state, so this tab never writes an older one over a lock made there. */
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === PREDICTION_LOCKET_STORAGE_KEY) {
        const stored = read() ?? FRESH;
        current.current = stored;
        setState(stored);
      }
    };
    globalThis.addEventListener?.('storage', onStorage);
    return () => globalThis.removeEventListener?.('storage', onStorage);
  }, []);
  /*
   * A pick changes the draft only while nothing is locked in storage: another tab's lock may be saved before its storage event
   * reaches this tab, and this tab's draft, saved over it, would erase that lock. The lock wins and this tab shows it.
   */
  const editDraft = useCallback(
    (change: Partial<Pick<LocketState, 'faction' | 'turn' | 'timeZone'>>) => {
      if (!adoptStoredLock()) {
        commit({ ...current.current, ...change });
      }
    },
    [adoptStoredLock, commit]
  );
  const pickFaction = useCallback((faction: LocketFaction) => editDraft({ faction }), [editDraft]);
  const pickTurn = useCallback((turn: number) => editDraft({ turn }), [editDraft]);
  const pickTimeZone = useCallback((timeZone: string) => editDraft({ timeZone }), [editDraft]);
  /*
   * Locks the prediction as it stood when Lock was tapped, never the picks made while the time was on its way.
   * A lock already in storage, perhaps from another tab whose storage event has not arrived, wins over this late answer.
   */
  const lock = useCallback(
    (prediction: Omit<LockedPrediction, 'revealed'>) => {
      if (adoptStoredLock()) {
        return;
      }
      /* Whether the save held, so the locked view knows whether a reload would keep it. */
      setKept(
        commit({ faction: null, turn: null, timeZone: prediction.timeZone, locked: { ...prediction, revealed: false } })
      );
    },
    [adoptStoredLock, commit]
  );
  const reveal = useCallback(() => {
    const { locked } = current.current;
    if (locked) {
      commit({ ...current.current, locked: { ...locked, revealed: true } });
    }
  }, [commit]);
  /* Clearing is the one change that may replace a lock; the city stays named for the next prediction. */
  const clear = useCallback(() => commit({ ...FRESH, timeZone: current.current.timeZone }), [commit]);
  return { state, kept, pickFaction, pickTurn, pickTimeZone, lock, reveal, clear };
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
    timeZone: shownZone(timeZone),
  }).format(lockedAt);
}

/** The zone a time is shown in: a zone this browser cannot show, kept from a browser that could, falls back to UTC rather than losing the lock. */
export function shownZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
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

/** Every city this browser knows a time zone for, by name; an older browser that cannot list them offers the phone's own and UTC. */
export function knownCities(): readonly City[] {
  const zones =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [phoneTimeZone(), 'UTC'];
  return [...new Set(zones)]
    .filter((zone) => zone.includes('/') || zone === 'UTC')
    .map(cityOf)
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/** The phone's own time zone, offered until the player names a city: a setting the player can see, not its clock. */
export function phoneTimeZone(): string {
  /* Older engines answer undefined. */
  const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone as string | undefined;
  return zone ? shownZone(zone) : 'UTC';
}
