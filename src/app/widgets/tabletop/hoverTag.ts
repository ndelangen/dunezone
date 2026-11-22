import { createContext } from 'react';

/* How long a tag stays after the pointer slips off its piece, so a pointer crossing a seam between a stack's layers, or brushing a neighbour, does not blink it. */
export const HOVER_TAG_GRACE_MS = 160;

/* Which piece shows its hover tag: one at a time, so two stacks never show tags together. */
export function createHoverTag() {
  let current: string | null = null;
  let hide: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const set = (next: typeof current) => {
    if (current === next) {
      return;
    }
    current = next;
    for (const listener of listeners) {
      listener();
    }
  };
  const cancelHide = () => {
    clearTimeout(hide);
    hide = undefined;
  };
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    shows: (pieceId: string) => current === pieceId,
    show(pieceId: string) {
      cancelHide();
      set(pieceId);
    },
    /*
     * The pointer left the piece: its tag goes after a moment, unless the pointer comes back or reaches another piece first.
     * What else ends with the hover, such as the hand cursor, goes with the tag, so it does not blink either.
     */
    leave(pieceId: string, gone: () => void) {
      if (current !== pieceId) {
        return;
      }
      cancelHide();
      hide = setTimeout(() => {
        hide = undefined;
        if (current === pieceId) {
          set(null);
          gone();
        }
      }, HOVER_TAG_GRACE_MS);
    },
    /* No pointer rests on the table: any tag goes at once. */
    clear() {
      cancelHide();
      set(null);
    },
    /* The piece is gone from the table: its tag goes at once. */
    drop(pieceId: string) {
      if (current === pieceId) {
        cancelHide();
        set(null);
      }
    },
  };
}

export type HoverTag = ReturnType<typeof createHoverTag>;

export const HoverTagContext = createContext(createHoverTag());
