import { useCallback, useEffect, useReducer, useRef } from 'react';

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
  const pointer = useRef({ active: false, pendingSettle: false });
  useEffect(() => {
    const gesture = pointer.current;
    let endTask: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(endTask);
      gesture.active = false;
      if (gesture.pendingSettle) {
        gesture.pendingSettle = false;
        dispatch({ kind: 'settle' });
      }
    };
    const start = (event: PointerEvent) => {
      if (event.button === 0 && event.isPrimary !== false) {
        gesture.active = true;
      }
    };
    /* A stopped click still settles after its pointer-up task, once the browser has dispatched the click. */
    const released = (event: PointerEvent) => {
      if (event.button !== 0 || event.isPrimary === false) {
        return;
      }
      clearTimeout(endTask);
      endTask = setTimeout(finish, 0);
    };
    const cancelled = (event: PointerEvent) => {
      if (event.isPrimary !== false) {
        finish();
      }
    };
    window.addEventListener('pointerdown', start, true);
    window.addEventListener('pointerup', released, true);
    window.addEventListener('click', finish);
    window.addEventListener('pointercancel', cancelled, true);
    window.addEventListener('blur', finish);
    return () => {
      clearTimeout(endTask);
      window.removeEventListener('pointerdown', start, true);
      window.removeEventListener('pointerup', released, true);
      window.removeEventListener('click', finish);
      window.removeEventListener('pointercancel', cancelled, true);
      window.removeEventListener('blur', finish);
    };
  }, []);
  const settle = useCallback(() => {
    /* Closing the band on pointer-down blur moves the clicked control before pointer-up. */
    if (pointer.current.active) {
      pointer.current.pendingSettle = true;
      return;
    }
    dispatch({ kind: 'settle' });
  }, []);
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
