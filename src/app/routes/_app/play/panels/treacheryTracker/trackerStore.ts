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
    const stored: unknown = JSON.parse(window.localStorage.getItem(key) ?? 'null');
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

/* One store per storage key, so the panel and the table's follower share the same tracker. */
const stores = new Map<string, TrackerStore>();

/**
 * The tracker kept in this browser under `key`, made on first use from storage or afresh.
 * What the tracker remembers lives in this browser only, per account, game and faction: no other player ever receives it.
 */
export function trackerStore(key: string, defs: readonly CardDef[], factions: readonly string[]): TrackerStore {
  const existing = stores.get(key);
  if (existing) {
    return existing;
  }
  let kept = restored(key, defs, factions);
  const listeners = new Set<() => void>();
  const set = (next: Kept) => {
    if (next.state === kept.state && next.memory === kept.memory) {
      return;
    }
    kept = next;
    save(key, kept);
    listeners.forEach((listener) => listener());
  };
  const store: TrackerStore = {
    get: () => kept,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch: (action) => set({ ...kept, state: trackerReducer(kept.state, action) }),
    follow: (facts) => {
      const followed = followTable(kept.state, kept.memory, facts);
      set(sameMemory(kept.memory, followed.memory) ? { ...kept, state: followed.state } : followed);
    },
  };
  stores.set(key, store);
  return store;
}

/* A read that followed nothing new keeps the memory it had, so the store does not save or notify for it. */
function sameMemory(before: TableMemory | undefined, after: TableMemory) {
  return before !== undefined && JSON.stringify(before) === JSON.stringify(after);
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
