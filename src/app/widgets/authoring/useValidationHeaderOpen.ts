import { useEffect, useRef, useState } from 'react';

/* The masthead's replacement exists only while validation warnings exist.
   Asymmetric settle — new warnings open it immediately, but an empty list only closes it
   on a settle signal (field blur or chapter switch), never mid-keystroke, so the layout
   never jumps above the sticky toolbar while typing. The open state gates the
   PageLayout.Header slot itself; the shell's band already animates its height change. */
export function useValidationHeaderOpen(count: number, settleTick: number): boolean {
  const [open, setOpen] = useState(count > 0);
  const countRef = useRef(count);

  /* The ref syncs inside the committed effect — a render-phase write could survive from a
     discarded render and let a later settle close the header while warnings still show.
     Declared before the settle effect so a commit changing both runs the sync first. */
  useEffect(() => {
    countRef.current = count;
    if (count > 0) {
      setOpen(true);
    }
  }, [count]);

  useEffect(() => {
    if (countRef.current === 0) {
      setOpen(false);
    }
  }, [settleTick]);

  return open;
}
