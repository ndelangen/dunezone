import { z } from 'zod';

import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import { consistentTracker, newTracker, trackerReducer } from '@app/widgets/treachery-tracker/tracker';
import type { CardDef, TrackerAction, TrackerState } from '@app/widgets/treachery-tracker/tracker';

/**
 * A game tracked at a physical table: the Ruleset it plays, the factions in seat order, the turn, and the tracker.
 * The tracker carries its own copy of the deck, so a saved game opens without reading the Ruleset again, even offline.
 */
export type StandaloneGame = Readonly<{
  ruleset: Readonly<{ id: string; name: string }>;
  factions: readonly FactionToken[];
  turn: number;
  state: TrackerState;
}>;

/** A new game: the whole deck and every hand empty, in turn 1. */
export function startGame(
  ruleset: StandaloneGame['ruleset'],
  factions: readonly FactionToken[],
  defs: readonly CardDef[]
): StandaloneGame {
  return {
    ruleset,
    factions,
    turn: 1,
    state: newTracker(
      defs,
      factions.map((faction) => faction.id)
    ),
  };
}

/** A game after one of the tracker's actions. */
export function playGame(game: StandaloneGame, action: TrackerAction): StandaloneGame {
  return { ...game, state: trackerReducer(game.state, action) };
}

const STORAGE_KEY = 'dune-zone:standalone-treachery-tracker';

const defSchema = z.object({
  key: z.string(),
  name: z.string(),
  kind: z.enum(['weapon', 'defense', 'special', 'worthless']),
  detail: z.string(),
  face: z.string(),
  count: z.number().int().positive(),
});
/* Where a card in a hand came from, so Take back can return it: the discard pile, or another hand, which may have had it from elsewhere. */
type SavedOrigin = { at: 'discard' } | { at: 'hand'; faction: string; slot: string; from?: SavedOrigin | undefined };
const originSchema: z.ZodType<SavedOrigin> = z.lazy(() =>
  z.union([
    z.object({ at: z.literal('discard') }),
    z.object({ at: z.literal('hand'), faction: z.string(), slot: z.string(), from: originSchema.optional() }),
  ])
);
const slotSchema = z.object({ id: z.string(), card: z.string().nullable(), from: originSchema.optional() });

/* Every hand an origin names belongs to a faction at the table, so taking a card back never sends it to a hand no one sees. */
function originsAtTable(origin: SavedOrigin | undefined, seated: ReadonlySet<string>): boolean {
  for (let at = origin; at && at.at === 'hand'; at = at.from) {
    if (!seated.has(at.faction)) {
      return false;
    }
  }
  return true;
}

/* A saved game is opened only when it holds together: every card it names is one of its own copies, no card is in two places, and no slot id is used twice. */
const gameSchema = z
  .object({
    ruleset: z.object({ id: z.string(), name: z.string() }),
    factions: z.array(
      z.object({ id: z.string(), name: z.string(), src: z.string().nullish(), color: z.string().optional() })
    ),
    turn: z.number().int().positive(),
    state: z.object({
      copies: z.array(z.object({ id: z.string(), def: defSchema, copy: z.number() })),
      hands: z.record(z.string(), z.array(slotSchema.passthrough())),
      discard: z.array(z.string()),
      seen: z.array(z.object({ id: z.string(), turn: z.number(), card: z.string().nullable() }).passthrough()),
      notes: z.record(z.string(), z.string()),
      nextSlot: z.number(),
    }),
  })
  .refine(({ factions, state }) => {
    const ids = new Set(state.copies.map((copy) => copy.id));
    const seated = new Set(factions.map((faction) => faction.id));
    const named = [
      ...Object.values(state.hands).flatMap((slots) => slots.flatMap((slot) => (slot.card ? [slot.card] : []))),
      ...state.discard,
      ...state.seen.flatMap((sighting) => (sighting.card ? [sighting.card] : [])),
    ];
    return (
      named.every((card) => ids.has(card)) &&
      consistentTracker(state) &&
      factions.every((faction) => faction.id in state.hands) &&
      Object.values(state.hands).every((slots) => slots.every((slot) => originsAtTable(slot.from, seated)))
    );
  });

/* The game saved in this browser, or null where there is none or it no longer holds together. */
function loadGame(): StandaloneGame | null {
  try {
    const parsed = gameSchema.safeParse(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'));
    return parsed.success ? (parsed.data as StandaloneGame) : null;
  } catch {
    return null;
  }
}

/* Saves the game in this browser, or forgets it when `game` is null; false when the browser would not keep it. */
function saveGame(game: StandaloneGame | null): boolean {
  try {
    if (game) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    return true;
  } catch {
    /* A full or blocked storage keeps the game only until the page closes; the page says so. */
    return false;
  }
}

/*
 * The saved game as a page reads it: undefined on the server, which has no storage, and in the browser the game or null.
 * Another tab that saves the game is followed here, so neither tab writes over the other's moves.
 */
let read: { game: StandaloneGame | null } | undefined;
/* Whether the last change failed to save, so the game lives only in this page until a save works again. */
let unsaved = false;
const listeners = new Set<() => void>();

function onStorage(event: StorageEvent) {
  /* A null key is storage cleared as a whole, which takes the saved game with it. */
  if (event.key === STORAGE_KEY || event.key === null) {
    read = undefined;
    listeners.forEach((listener) => listener());
  }
}

export const savedGame = {
  subscribe: (listener: () => void) => {
    if (listeners.size === 0) {
      /* Nothing followed storage while no one listened: another tab may have saved since. */
      read = undefined;
      window.addEventListener('storage', onStorage);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        window.removeEventListener('storage', onStorage);
      }
    };
  },
  get: (): StandaloneGame | null => {
    read ??= { game: loadGame() };
    return read.game;
  },
  getServer: (): StandaloneGame | null | undefined => undefined,
  /** Whether the game on screen is not saved, because the browser would not keep the last change. */
  unsaved: (): boolean => unsaved,
  set: (game: StandaloneGame | null) => {
    unsaved = !saveGame(game);
    read = { game };
    listeners.forEach((listener) => listener());
  },
  /** Changes the saved game as it is now, so two changes from one tap both land, the second on top of the first. */
  update: (change: (game: StandaloneGame) => StandaloneGame) => {
    const game = savedGame.get();
    if (game) {
      savedGame.set(change(game));
    }
  },
};
