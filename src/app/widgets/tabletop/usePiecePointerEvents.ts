import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { ThreeEvent } from '@react-three/fiber/webgpu';
import { gestureBlockReason } from '@shared/play/model';
import type { TablePiece } from '@shared/play/model';
import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import { Matrix4 } from 'three';

import { pieceHasMenu } from './pieceMenu';
import { usePointerSession } from './PointerSessionContext';
import { useTabletopActions, useTabletopSelector } from './TabletopContext';
import { territoryBrush } from './territoryBrush';

/*
 * What a piece on the table does under the pointer: pressing picks it up, the right button opens its menu,
 * and resting on it aims the keys at it and shows its name and count.
 */
function pieceHoverCursor(canInteract: boolean, interactionBlocked: boolean, gestureBlocked: boolean) {
  if (interactionBlocked) {
    return canInteract ? 'not-allowed' : 'default';
  }
  return gestureBlocked ? 'not-allowed' : 'grab';
}

/* How long a tag stays after the pointer slips off its piece, so a pointer crossing a seam between a stack's layers, or brushing a neighbour, does not blink it. */
const HOVER_TAG_GRACE_MS = 160;

/*
 * Which piece shows its hover tag: one at a time, so two stacks never show tags together.
 * Held as where the piece lay when the pointer reached it: a piece that moves away under a still pointer hears no leave,
 * as the table looks again only when the pointer moves, so a moved piece shows no tag until the pointer comes back to it.
 */
export function createHoverTag() {
  let current: { pieceId: string; pose: string } | null = null;
  let hide: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const set = (next: typeof current) => {
    if (current?.pieceId === next?.pieceId && current?.pose === next?.pose) {
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
    poseOf(pieceId: string) {
      return current?.pieceId === pieceId ? current.pose : null;
    },
    show(pieceId: string, pose: string) {
      cancelHide();
      set({ pieceId, pose });
    },
    /*
     * The pointer left the piece: its tag goes after a moment, unless the pointer comes back or reaches another piece first.
     * What else ends with the hover, such as the hand cursor, goes with the tag, so it does not blink either.
     */
    leave(pieceId: string, gone: () => void) {
      if (current?.pieceId !== pieceId) {
        return;
      }
      cancelHide();
      hide = setTimeout(() => {
        hide = undefined;
        if (current?.pieceId === pieceId) {
          set(null);
          gone();
        }
      }, HOVER_TAG_GRACE_MS);
    },
    /* The piece is gone from the table: its tag goes at once. */
    drop(pieceId: string) {
      if (current?.pieceId === pieceId) {
        cancelHide();
        set(null);
      }
    },
  };
}

export const HoverTagContext = createContext(createHoverTag());

/* Opens a piece's menu at a point. */
export const PieceMenuContext = createContext<((pieceId: string, x: number, y: number) => void) | null>(null);

export function usePiecePointerEvents({
  piece,
  interactionBlocked,
  canHandleTable,
  carrying,
  remoteCarried,
}: Readonly<{
  piece: TablePiece;
  interactionBlocked: boolean;
  canHandleTable: boolean;
  carrying: boolean;
  remoteCarried: boolean;
}>) {
  const { selectPiece, setHoveredPiece } = useTabletopActions();
  const openPieceMenu = useContext(PieceMenuContext);
  /* A selector, so a change elsewhere in the scene's store does not render every piece again. */
  const get = useThree((state) => state.get);
  const pointerSession = usePointerSession();
  const gestureBlocked = gestureBlockReason(piece);
  const alliances = useTabletopSelector((table) => table.allianceControls);
  const hasMenu = !carrying && pieceHasMenu(piece, alliances);
  /* Only a left press handles a piece, and none does while the table blocks it or the paintbrush is on. */
  const ignoresPress = (event: ThreeEvent<PointerEvent>) => {
    const notLeftOrBlocked = event.button !== 0 || interactionBlocked;
    return notLeftOrBlocked || territoryBrush() !== null;
  };
  /* A piece that leaves the table under a still cursor hears no pointer leave, so its hover would keep the keys aimed at a piece that is gone. */
  const hovered = useRef(false);
  /* The cursor this piece put up on the canvas, taken down when its hover ends. */
  const shownCursor = useRef<string | null>(null);
  /*
   * Whether the pointer rests on the piece, so its tag shows its name and count (#2988).
   * Kept apart from the table's hover, which aims the keys and only follows pieces the viewer may handle: a spectator sees the tag too.
   * A turned card can swing out from under the pointer, so its turn counts as a move.
   */
  const pose = `${piece.position.join()}@${piece.orientation}`;
  const hoverTag = useContext(HoverTagContext);
  const pointerOverAt = useSyncExternalStore(hoverTag.subscribe, () => hoverTag.poseOf(piece.id));
  useEffect(
    () => () => {
      hoverTag.drop(piece.id);
    },
    [hoverTag, piece.id]
  );
  useEffect(
    () => () => {
      if (hovered.current) {
        setHoveredPiece(null);
      }
    },
    [setHoveredPiece]
  );

  const handlers = {
    onContextMenu: (event: ThreeEvent<MouseEvent>) => {
      if (hasMenu && openPieceMenu) {
        event.stopPropagation();
        openPieceMenu(piece.id, event.nativeEvent.clientX, event.nativeEvent.clientY);
      }
    },
    /* While the paintbrush is on, a click on a piece paints the territory under it, and the piece is neither picked up nor selected. */
    onClick: (event: ThreeEvent<MouseEvent>) => {
      if (!territoryBrush()) {
        event.stopPropagation();
      }
    },
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      if (ignoresPress(event)) {
        return;
      }
      event.stopPropagation();
      if (pointerSession.busy) {
        return;
      }
      selectPiece(piece.id);
      if (gestureBlocked) {
        return;
      }
      pointerSession.press(event.nativeEvent, piece.id);
    },
    onPointerEnter: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      hoverTag.show(piece.id, pose);
      if (!interactionBlocked) {
        hovered.current = true;
        setHoveredPiece(piece.id);
      }
      if (!pointerSession.busy) {
        shownCursor.current = pieceHoverCursor(canHandleTable, interactionBlocked, Boolean(gestureBlocked));
        get().renderer.domElement.style.cursor = shownCursor.current;
      }
    },
    /* The table keeps a hovered piece hovered without a new enter, so a stack nudged under the pointer takes its new place here. */
    onPointerMove: () => hoverTag.show(piece.id, pose),
    onPointerLeave: () => {
      hovered.current = false;
      setHoveredPiece(null);
      hoverTag.leave(piece.id, () => {
        /* Only the cursor this piece put up: something the pointer reached meanwhile, such as the spice bank, keeps its own. */
        const canvas = get().renderer.domElement;
        if (!pointerSession.busy && canvas.style.cursor === shownCursor.current) {
          canvas.style.cursor = 'default';
        }
      });
    },
  };
  /* A piece in someone's hand, or the viewer's own, moves out from under a still pointer, so it shows no hover tag. */
  return { handlers, hovered: pointerOverAt === pose && !carrying && !remoteCarried };
}

/*
 * The table looks for the piece under the pointer only when the pointer moves, so a camera that pans under a still pointer
 * would leave the hover on a piece that has slid away; while the pointer is over the table, a moved camera looks again.
 */
export function useHoverFollowsCamera() {
  const { camera, renderer } = useThree();
  const events = useThree((state) => state.events);
  /*
   * The pointer's own last move, replayed as it was: the table's remembered event can be a wheel turn, which carries no pointer id
   * and would hover a second piece for a pointer that is not there.
   */
  const lastMove = useRef<PointerEvent | null>(null);
  const seen = useRef(new Matrix4());
  useEffect(() => {
    const canvas = renderer.domElement;
    const move = (event: PointerEvent) => (lastMove.current = event);
    const leave = () => (lastMove.current = null);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', leave);
    window.addEventListener('blur', leave);
    return () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
      window.removeEventListener('blur', leave);
    };
  }, [renderer]);
  useFrame(() => {
    if (seen.current.equals(camera.matrixWorld)) {
      return;
    }
    seen.current.copy(camera.matrixWorld);
    if (lastMove.current) {
      events.handlers?.onPointerMove?.(lastMove.current);
    }
  });
}
