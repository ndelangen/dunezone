import { z } from 'zod';

import { followTable } from './tableFeed';
import type { TableFacts, TableMemory } from './tableFeed';
import { newTracker, trackerReducer } from './tracker';
import type { CardDef, TrackerAction, TrackerState } from './tracker';

/** The tracker a seat keeps, and what it already followed from the table. */
type Kept = Readonly<{ state: TrackerState; memory: TableMemory | undefined }>;

export type TrackerStore = Readonly<{
  get: () => Kept;
  subscribe: (listener: () => void) => () => void;
  dispatch: (action: TrackerAction) => void;
  follow: (facts: TableFacts) => void;
}>;

/*
 * Whether a stored tracker holds together: no card in two places at once, and no slot in two hands.
 * The reducer never builds such a state, so one that does was edited or damaged, and starts afresh.
 */
function consistent(state: Pick<TrackerState, 'hands' | 'discard'>): boolean {
  const slots = Object.values(state.hands).flat();
  const cards = [...slots.flatMap((slot) => (slot.card ? [slot.card] : [])), ...state.discard];
  return new Set(cards).size === cards.length && new Set(slots.map((slot) => slot.id)).size === slots.length;
}

const memorySchema = z.object({ peeked: z.array(z.string()) });

/* A stored tracker is used only when every card it names is in this deck; anything else, such as an older shape, starts afresh. */
function storedTracker(fresh: TrackerState) {
  const ids = new Set(fresh.copies.map((copy) => copy.id));
  const known = z.string().refine((card) => ids.has(card));
  const slot = z.object({ id: z.string(), card: known.nullable() });
  return z.object({
    state: z
      .object({
        copies: z.array(z.object({ id: known })).length(ids.size),
        discard: z.array(known),
        seen: z.array(slot),
        hands: z.record(z.string(), z.array(slot)),
        notes: z.record(z.string(), z.string()),
        nextSlot: z.number(),
      })
      .refine(consistent),
    memory: memorySchema.optional(),
  });
}

function restored(key: string, defs: readonly CardDef[], factions: readonly string[]): Kept {
  const fresh = newTracker(defs, factions);
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    /* A tracker saved before the table was followed is the bare state, with nothing followed yet. */
    const stored = raw && typeof raw === 'object' && !('state' in raw) ? { state: raw } : raw;
    if (!storedTracker(fresh).safeParse(stored).success) {
      return { state: fresh, memory: undefined };
    }
    const kept = stored as Kept;
    /* The stored copies carry the deck as it was saved; the game's own deck replaces them, card for card. */
    return { state: { ...kept.state, copies: fresh.copies }, memory: kept.memory };
  } catch {
    return { state: fresh, memory: undefined };
  }
}

function save(key: string, kept: Kept) {
  try {
    window.localStorage.setItem(key, JSON.stringify(kept));
  } catch {
    /* A full or blocked storage only loses the tracker on reload. */
  }
}

/*
 * One store per storage key, so the panel and the table's follower share the same tracker.
 * A store is made again from storage when the game's deck or its seated factions change, so it never keeps a deck or roster it was first made with.
 */
const stores = new Map<string, Readonly<{ basis: string; store: TrackerStore }>>();

/**
 * The tracker kept in this browser under `key`, made on first use from storage or afresh.
 * What the tracker remembers lives in this browser only, per account, game and faction: no other player ever receives it.
 * Another tab of the same game that saves it is followed here too, so neither tab writes over the other's edits.
 */
export function trackerStore(key: string, defs: readonly CardDef[], factions: readonly string[]): TrackerStore {
  const basis = `${defs.map((def) => `${def.key}:${def.count}`).join(',')}|${factions.join(',')}`;
  const existing = stores.get(key);
  if (existing?.basis === basis) {
    return existing.store;
  }
  let kept = restored(key, defs, factions);
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const set = (next: Kept) => {
    if (next.state === kept.state && next.memory === kept.memory) {
      return;
    }
    kept = next;
    save(key, kept);
    notify();
  };
  const store: TrackerStore = {
    get: () => kept,
    subscribe: (listener) => {
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
    dispatch: (action) => set({ ...kept, state: trackerReducer(kept.state, action) }),
    follow: (facts) => set(followTable(kept.state, kept.memory, facts)),
  };
  function onStorage(event: StorageEvent) {
    if (event.key === key) {
      kept = restored(key, defs, factions);
      notify();
    }
  }
  stores.set(key, { basis, store });
  return store;
}

/** The storage key of a seat's tracker: per account, game and faction, so another account on the same browser never opens it. */
export function storageKey(user: string, game: string, faction: string) {
  return `dune-zone:treachery-tracker:${user}:${game}:${faction}`;
}

/** Forgets every tracker this page holds and the ones stored in this browser, so a story starts from a fresh tracker. */
export function forgetTrackers() {
  stores.clear();
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('dune-zone:treachery-tracker:')) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    /* Blocked storage holds nothing to forget. */
  }
}
