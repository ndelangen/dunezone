/*
 * The recall timeline's seeks, one in flight at a time. The table's next change of value answers the seek in flight, with its step
 * or another seat's choice. A choice made while one is in flight waits, the latest replacing any earlier one, and is sent once the
 * answer lands, so answers can never arrive out of order. A seek the table could not be sent, such as while it resyncs, is dropped.
 */

/** Sends a seek; false when it could not be sent. */
export type SendSeek = (step: number) => boolean | void;

export type SeekState = Readonly<{
  /** The step in flight and the value it was sent from. */
  sent: Readonly<{ step: number; from: number }> | null;
  /** The latest choice waiting for the one in flight to land. */
  queued: number | null;
}>;

const IDLE: SeekState = { sent: null, queued: null };

function sendNow(step: number, from: number, send: SendSeek): SeekState {
  return send(step) === false ? IDLE : { sent: { step, from }, queued: null };
}

/** The step the timeline shows: the choice still to be sent, else the one in flight, else the table's own. */
export function shownStep(state: SeekState, value: number) {
  const inFlight = state.sent && state.sent.from === value ? state.sent.step : null;
  return state.queued ?? inFlight ?? value;
}

/** A choice made on the timeline: sent at once when nothing is in flight, otherwise held as the next to send. */
export function chooseSeek(state: SeekState, step: number, value: number, send: SendSeek): SeekState {
  if (step === shownStep(state, value)) {
    return state;
  }
  const inFlight = state.sent && state.sent.from === value ? state.sent.step : null;
  if (inFlight === null) {
    return sendNow(step, value, send);
  }
  return { sent: state.sent, queued: step === inFlight ? null : step };
}

/** The table's value as it now stands: once it has moved off the one a seek was sent from, the waiting choice goes next. */
export function landSeek(state: SeekState, value: number, send: SendSeek): SeekState {
  if (!state.sent || state.sent.from === value) {
    return state;
  }
  return state.queued !== null && state.queued !== value ? sendNow(state.queued, value, send) : IDLE;
}

/** A small store for one picker's seeks, read while rendering and changed from events and effects. */
export function createSeekStore() {
  let state = IDLE;
  const listeners = new Set<() => void>();
  const set = (next: SeekState) => {
    if (next !== state) {
      state = next;
      for (const listener of listeners) {
        listener();
      }
    }
  };
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => state,
    choose: (step: number, value: number, send: SendSeek) => set(chooseSeek(state, step, value, send)),
    land: (value: number, send: SendSeek) => set(landSeek(state, value, send)),
  };
}
