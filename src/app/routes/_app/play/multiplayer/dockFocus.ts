/*
 * Which dock tab the table opens on its own, and when.
 * The dock opens a tab only when something happens: the live phase changes, a battle starts, the end of the game begins or is declared.
 * A request that merely stays around is never applied again, so the player's own choice of tab stands until the next event.
 */

type FocusRequest = Readonly<{ key: string; token: string }>;

export type DockFocusInput = Readonly<{
  /* Browsing a replay pauses the dock: nothing it shows is an event, and returning to live is not one either. */
  playback: boolean;
  /* The live stage and phase; a change is a phase transition, including one back to a phase seen before. */
  phase: string;
  /* The phase's own tab for this viewer, or null when the phase leaves the dock alone. */
  phaseTab: string | null;
  /* Battle and result requests, earlier ones winning when several begin together. */
  events: readonly (FocusRequest | null)[];
}>;

export type DockFocusState = Readonly<{
  /* Set while a replay is open, so the first live render after it catches up without opening anything. */
  paused: boolean;
  phase: string | null;
  events: readonly string[];
  arrivals: number;
  focus: FocusRequest | null;
}>;

/* The table loaded mid-play keeps the tab the player opens on; one loaded during setup or drafting still opens the first phase's tab. */
export function initialDockFocus(phase: string, inPlay: boolean): DockFocusState {
  return { paused: false, phase: inPlay ? phase : null, events: [], arrivals: 0, focus: null };
}

/* The state after this render, or the same state when nothing happened. */
export function nextDockFocus(state: DockFocusState, input: DockFocusInput): DockFocusState {
  if (input.playback) {
    return state.paused ? state : { ...state, paused: true };
  }
  const events = input.events.filter((request): request is FocusRequest => request !== null);
  const tokens = events.map((request) => request.token);
  /* What the live game did while the player browsed the replay is not news to bring the dock back for. */
  if (state.paused) {
    return { ...state, paused: false, phase: input.phase, events: tokens };
  }
  const phaseChanged = input.phase !== state.phase;
  if (!phaseChanged && tokens.join('\n') === state.events.join('\n')) {
    return state;
  }
  const fresh = freshRequest(state, events, phaseChanged ? input : null);
  if (!fresh) {
    return { ...state, phase: input.phase, events: tokens };
  }
  /* Each arrival gets its own delivery token, so the dock applies it even when the same request was the last one applied. */
  const arrivals = state.arrivals + 1;
  return {
    paused: false,
    phase: input.phase,
    events: tokens,
    arrivals,
    focus: { key: fresh.key, token: `${fresh.token}#${arrivals}` },
  };
}

/* The request that just began: a new event first, else the phase's own tab when the phase changed. */
function freshRequest(
  state: DockFocusState,
  events: readonly FocusRequest[],
  changedPhase: DockFocusInput | null
): FocusRequest | null {
  const event = events.find((request) => !state.events.includes(request.token));
  if (event) {
    return event;
  }
  return changedPhase?.phaseTab ? { key: changedPhase.phaseTab, token: `phase:${changedPhase.phase}` } : null;
}
