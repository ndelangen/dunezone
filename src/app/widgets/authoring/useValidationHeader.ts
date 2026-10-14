import { useCallback, useReducer } from 'react';

/**
 * The masthead's replacement, open only while validation warnings exist.
 * Callers render the band on `open` and hand `settle` to the editor;
 * every action that replaces the draft goes through `releasing`.
 */
export type ValidationHeaderState = {
  open: boolean;
  /** The editor's own settle signal, wired to its blur capture and its chapter switch. */
  settle: () => void;
  /**
   * Wraps an action that replaces the draft wholesale, so the release rides with the action instead of being remembered separately.
   * Reset, loading a draft over the current one, and a container membership mutation are all releases;
   * a keystroke is not.
   */
  releasing: <Arguments extends unknown[]>(action: (...args: Arguments) => void) => (...args: Arguments) => void;
};

/* The masthead's replacement exists only while validation warnings exist.
   Asymmetric settle: new warnings open it immediately, but an empty list only closes it
   on a settle signal (field blur or chapter switch), never mid-keystroke, so the layout
   never jumps above the sticky toolbar while typing. The open state gates the
   PageLayout.Header slot itself; the shell's band already animates its height change. */
export function useValidationHeader(count: number): ValidationHeaderState {
  const [state, dispatch] = useReducer(
    (
      current: { count: number; open: boolean; released: boolean; tick: number; observedTick: number },
      event: { kind: 'observe'; count: number } | { kind: 'settle' } | { kind: 'release' }
    ) => {
      if (event.kind === 'settle') {
        return { ...current, tick: current.tick + 1 };
      }
      if (event.kind === 'release') {
        return { ...current, released: true, tick: current.tick + 1 };
      }
      const close = event.count === 0 && (current.released || current.tick !== current.observedTick);
      return {
        ...current,
        count: event.count,
        observedTick: current.tick,
        open: event.count > 0 ? true : close ? false : current.open,
        released: close ? false : current.released,
      };
    },
    count,
    (initialCount) => ({ count: initialCount, open: initialCount > 0, released: false, tick: 0, observedTick: 0 })
  );
  /* Prop changes and settle signals reconcile before commit, so a discarded render cannot release the band. */
  if (state.count !== count || state.observedTick !== state.tick) {
    dispatch({ kind: 'observe', count });
  }
  const settle = useCallback(() => dispatch({ kind: 'settle' }), []);
  const releasing = useCallback(
    <Arguments extends unknown[]>(action: (...args: Arguments) => void) =>
      (...args: Arguments) => {
        /* The release waits for an asynchronous replacement to clear its final warning. */
        dispatch({ kind: 'release' });
        action(...args);
      },
    []
  );
  return { open: state.open, settle, releasing };
}
