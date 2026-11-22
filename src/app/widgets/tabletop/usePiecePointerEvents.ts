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
    /* The piece is gone from the table: its tag goes at once. */
    drop(pieceId: string) {
      if (current === pieceId) {
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
  locallyCarried,
  remoteCarried,
}: Readonly<{
  piece: TablePiece;
  interactionBlocked: boolean;
  canHandleTable: boolean;
  carrying: boolean;
  locallyCarried: boolean;
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
   * A piece that moves under a still pointer is looked at again by the table (useHoverFollowsTable), so its tag follows the pointer, not the piece.
   */
  const hoverTag = useContext(HoverTagContext);
  const tagged = useSyncExternalStore(hoverTag.subscribe, () => hoverTag.shows(piece.id));
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
      hoverTag.show(piece.id);
      if (!interactionBlocked) {
        hovered.current = true;
        setHoveredPiece(piece.id);
      }
      if (!pointerSession.busy) {
        shownCursor.current = pieceHoverCursor(canHandleTable, interactionBlocked, Boolean(gestureBlocked));
        get().renderer.domElement.style.cursor = shownCursor.current;
      }
    },
    /* The table keeps a hovered piece hovered without a new enter, so the pointer coming back within the grace keeps its tag. */
    onPointerMove: () => hoverTag.show(piece.id),
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
  /*
   * The piece the viewer holds keeps its tag for as long as the button is down.
   * While something is held, the pieces it passes over show none, and a piece in someone else's hand shows none either.
   */
  return { handlers, hovered: locallyCarried || (tagged && !carrying && !remoteCarried) };
}

/* How long the table keeps looking under a still pointer after its pieces change, while a moved piece glides to its place. */
const PIECE_GLIDE_MS = 1000;

/*
 * The table looks for the piece under the pointer only when the pointer moves, so a camera that pans, or a piece that moves,
 * under a still pointer would leave the hover where it was. While the pointer is over the table, it looks again
 * on every frame the camera moved, and for a moment after the pieces changed: a stack set down under the pointer keeps its tag,
 * and one that slides away loses it.
 */
export function useHoverFollowsTable() {
  const { camera, renderer } = useThree();
  const events = useThree((state) => state.events);
  /*
   * The pointer's own last move, replayed as it was: the table's remembered event can be a wheel turn, which carries no pointer id
   * and would hover a second piece for a pointer that is not there.
   */
  const lastMove = useRef<PointerEvent | null>(null);
  const seen = useRef(new Matrix4());
  const pieces = useTabletopSelector((table) => table.renderedPieces);
  const lookUntil = useRef(0);
  useEffect(() => {
    lookUntil.current = performance.now() + PIECE_GLIDE_MS;
  }, [pieces]);
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
    const cameraMoved = !seen.current.equals(camera.matrixWorld);
    if (!cameraMoved && performance.now() > lookUntil.current) {
      return;
    }
    seen.current.copy(camera.matrixWorld);
    if (lastMove.current) {
      events.handlers?.onPointerMove?.(lastMove.current);
    }
  });
}
