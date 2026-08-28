import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [open, setOpen] = useState(count > 0);
  const countRef = useRef(count);
  const [settleTick, setSettleTick] = useState(0);
  /* A release that arrived while warnings still stood, waiting for the count it was about to reach zero.
     Discrete draft replacements are the asynchronous case: a membership mutation releases now and the warning it clears
     only disappears once the server's next result lands, which is one or more renders later («Reset leaves the validation header open»). */
  const releasedRef = useRef(false);

  /* The ref syncs inside the committed effect; a render-phase write could survive from a
     discarded render and let a later settle close the header while warnings still show.
     Declared before the settle effect so a commit changing both runs the sync first. */
  useEffect(() => {
    countRef.current = count;
    if (count > 0) {
      setOpen(true);
      return;
    }
    if (releasedRef.current) {
      releasedRef.current = false;
      setOpen(false);
    }
  }, [count]);

  useEffect(() => {
    if (countRef.current === 0) {
      releasedRef.current = false;
      setOpen(false);
    }
  }, [settleTick]);

  const settle = useCallback(() => setSettleTick((tick) => tick + 1), []);

  const releasing = useCallback(
    <Arguments extends unknown[]>(action: (...args: Arguments) => void) =>
      (...args: Arguments) => {
        /* Armed before the action runs, so a replacement that clears the warnings in this very commit
           is already covered when the count effect observes the empty list. */
        releasedRef.current = true;
        action(...args);
        setSettleTick((tick) => tick + 1);
      },
    []
  );

  return { open, settle, releasing };
}
