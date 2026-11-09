import { z } from 'zod';

import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';

import { newTracker, trackerReducer } from './tracker';
import type { CardDef, TrackerAction, TrackerState } from './tracker';

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
const slotSchema = z.object({ id: z.string(), card: z.string().nullable() });

/* A saved game is opened only when it holds together: every card it names is one of its own copies, and no card is in two places. */
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
    const slots = Object.values(state.hands).flat();
    const held = slots.flatMap((slot) => (slot.card ? [slot.card] : []));
    const named = [
      ...held,
      ...state.discard,
      ...state.seen.flatMap((sighting) => (sighting.card ? [sighting.card] : [])),
    ];
    return (
      named.every((card) => ids.has(card)) &&
      new Set([...held, ...state.discard]).size === held.length + state.discard.length &&
      factions.every((faction) => faction.id in state.hands)
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

/* Saves the game in this browser, or forgets it when `game` is null. */
function saveGame(game: StandaloneGame | null) {
  try {
    if (game) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* A full or blocked storage only loses the game on reload. */
  }
}

/*
 * The saved game as a page reads it: undefined on the server, which has no storage, and in the browser the game or null.
 * Another tab that saves the game is followed here, so neither tab writes over the other's moves.
 */
let read: { game: StandaloneGame | null } | undefined;
const listeners = new Set<() => void>();

function onStorage(event: StorageEvent) {
  if (event.key === STORAGE_KEY) {
    read = undefined;
    listeners.forEach((listener) => listener());
  }
}

export const savedGame = {
  subscribe: (listener: () => void) => {
    if (listeners.size === 0) {
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
  set: (game: StandaloneGame | null) => {
    saveGame(game);
    read = { game };
    listeners.forEach((listener) => listener());
  },
};
