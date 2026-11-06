import type { z } from 'zod';

import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import type { StoredShape } from '@app/widgets/authoring/authoringEnvelope';

/* The draft state every card session keeps, and the reducers most types use as they are; kept free of React so tests can drive them. */

/** The state every card session keeps: the draft being edited and the last saved (or opening) draft it is compared with. */
export type DraftState<Draft> = { data: Draft; baseline: Draft };

/** A session that also keeps choices the stored card has no room for, such as which background mode a picker was in. */
export type MemoryState<Draft, Memory> = DraftState<Draft> & { memory: Memory };

/** The events every card session handles; a type may add its own, such as remembering a UI choice. */
export type DraftEvent<Draft> =
  | { kind: 'patch'; update: Partial<Draft> }
  | { kind: 'replace'; data: Draft }
  | { kind: 'saved'; data: Draft };

export type RememberEvent<Memory> = { kind: 'remember'; update: Partial<Memory> };

/** Whether the draft differs from its baseline, why it cannot be saved, and what a save would post. */
export type DraftStatus<Payload> = { isDirty: boolean; invalid?: string; payload: Payload | null | undefined };

/** The shared events on any state that carries a draft. */
function reduceDraft<Draft, State extends DraftState<Draft>>(state: State, event: DraftEvent<Draft>): State {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    /* Loading and Reset replace the whole draft while keeping the saved baseline. */
    case 'replace':
      return { ...state, data: event.data };
    /* A completed save moves the baseline to the payload that was posted, so edits made during the save stay dirty. */
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

/** Dirty reads the draft alone and never any memory beside it, and the stored schema's own keys decide what is posted. */
function draftStatus<Draft extends object>(
  schema: z.ZodType<Draft> & StoredShape,
  state: DraftState<Draft>
): DraftStatus<Draft> {
  const validation = schema.safeParse(state.data);
  return {
    payload: validation.success ? postedPayload(schema, state.data) : undefined,
    invalid: validation.success ? undefined : validation.error.issues[0]?.message,
    isDirty: JSON.stringify(state.data) !== JSON.stringify(state.baseline),
  };
}

/** The reducer and status for a type whose state is only its draft and baseline. */
export function plainDraftSession<Draft extends { name: string }>(schema: z.ZodType<Draft> & StoredShape) {
  return {
    open: (data: Draft, baseline: Draft): DraftState<Draft> => ({ data, baseline }),
    reduce: (state: DraftState<Draft>, event: DraftEvent<Draft>) => reduceDraft(state, event),
    status: (state: DraftState<Draft>) => draftStatus(schema, state),
  };
}

/** The reducer and status for a type that also remembers UI choices; a load or reset forgets them. */
export function memoryDraftSession<Draft extends { name: string }, Memory>(
  schema: z.ZodType<Draft> & StoredShape,
  openingMemory: () => Memory
) {
  const open = (data: Draft, baseline: Draft): MemoryState<Draft, Memory> => ({
    data,
    baseline,
    memory: openingMemory(),
  });
  return {
    open,
    reduce: (
      state: MemoryState<Draft, Memory>,
      event: DraftEvent<Draft> | RememberEvent<Memory>
    ): MemoryState<Draft, Memory> => {
      switch (event.kind) {
        case 'remember':
          return { ...state, memory: { ...state.memory, ...event.update } };
        /* A reset rebuilds the whole state, so a piece added later cannot be the one a reset forgets. */
        case 'replace':
          return open(event.data, state.baseline);
        default:
          return reduceDraft(state, event);
      }
    },
    status: (state: MemoryState<Draft, Memory>) => draftStatus(schema, state),
  };
}

const OPEN = Symbol('open');

/** The edit page's own event, tagged so it can never collide with an event a card type adds. */
type OpenEvent<State> = { [OPEN]: State };

export function openEvent<State>(state: State): OpenEvent<State> {
  return { [OPEN]: state };
}

/** The edit page's reducer: empty until the stored card is first read, then the type's own; a second open changes nothing. */
export function reduceOpened<State, Event>(reduce: (state: State, event: Event) => State) {
  return (state: State | null, event: Event | OpenEvent<State>): State | null => {
    if (isOpenEvent(event)) {
      return state ?? event[OPEN];
    }
    return state ? reduce(state, event) : null;
  };
}

function isOpenEvent<State>(event: unknown): event is OpenEvent<State> {
  return typeof event === 'object' && event !== null && OPEN in event;
}
