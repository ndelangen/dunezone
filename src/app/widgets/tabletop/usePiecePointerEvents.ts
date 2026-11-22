import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { ThreeEvent } from '@react-three/fiber/webgpu';
import { gestureBlockReason } from '@shared/play/model';
import type { TablePiece } from '@shared/play/model';
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Matrix4 } from 'three';

import { HoverTagContext } from './hoverTag';
import type { HoverTag } from './hoverTag';
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
      /* Only while its tag is still up: once another piece took the tag, the keys are aimed at that one. */
      if (hovered.current && hoverTag.shows(piece.id)) {
        setHoveredPiece(null);
      }
    },
    [setHoveredPiece, hoverTag, piece.id]
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
    /* The keys stay aimed at the piece for as long as its tag stays up, so they act on the piece the tag names. */
    onPointerLeave: () => {
      hoverTag.leave(piece.id, () => {
        if (hovered.current) {
          hovered.current = false;
          setHoveredPiece(null);
        }
        /* Only the cursor this piece put up: something the pointer reached meanwhile, such as the spice bank, keeps its own. */
        const canvas = get().renderer.domElement;
        if (!pointerSession.busy && canvas.style.cursor === shownCursor.current) {
          canvas.style.cursor = 'default';
        }
      });
    },
  };
  const dragged = useDragged(locallyCarried, pointerSession);
  /*
   * The piece the viewer holds keeps its tag while the button is down, until it is dragged: a moving piece shows none.
   * While something is held, the pieces it passes over show none, and a piece in someone else's hand shows none either.
   */
  return { handlers, hovered: locallyCarried ? !dragged : tagged && !carrying && !remoteCarried };
}

/*
 * Whether the held piece is being dragged: moved past the drag threshold from where it was pressed, or carried out of a panel.
 * Read on every pointer move while held, and again whenever the hold begins.
 */
function useDragged(held: boolean, pointerSession: ReturnType<typeof usePointerSession>) {
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    if (!held) {
      return;
    }
    const move = () => {
      if (pointerSession.movedFromPress()) {
        setMoved(true);
      }
    };
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointermove', move);
      setMoved(false);
    };
  }, [held, pointerSession]);
  return held && (moved || pointerSession.movedFromPress());
}

/* How long the table keeps looking under a still pointer after its pieces change, while a moved piece glides to its place. */
const PIECE_GLIDE_MS = 1000;

/*
 * The table looks for the piece under the pointer only when the pointer moves, so a camera that pans, or a piece that moves,
 * under a still pointer would leave the hover where it was. While the pointer is over the table, it looks again
 * on every frame the camera moved, and for a moment after the pieces changed: a stack set down under the pointer keeps its tag,
 * and one that slides away loses it.
 */
export function useHoverFollowsTable(hoverTag: HoverTag) {
  const { camera, renderer } = useThree();
  const events = useThree((state) => state.events);
  /*
   * The pointer's own last move, replayed as it was: the table's remembered event can be a wheel turn, which carries no pointer id
   * and would hover a second piece for a pointer that is not there.
   */
  const lastMove = useRef<PointerEvent | null>(null);
  const seen = useRef(new Matrix4());
  /* Only where pieces lie counts: the table emits new pieces for changes, such as a hover, that move nothing. */
  const poses = useTabletopSelector((table) =>
    table.renderedPieces.map((piece) => `${piece.id}@${piece.position.join()}@${piece.orientation}`).join('|')
  );
  const lookUntil = useRef(0);
  useEffect(() => {
    lookUntil.current = performance.now() + PIECE_GLIDE_MS;
  }, [poses]);
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
    } else {
      /* No pointer the table can look with: a tag left up would ride its piece wherever it goes. */
      hoverTag.clear();
    }
  });
}
