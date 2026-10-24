import { pieceCount } from '@shared/play/model';
import { tokenBoxRatio } from '@shared/play/tableGeometry';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';

import { cardWidthFor, TOKEN_SIZE_PX } from './faceSize';
import { PieceArtwork } from './PieceArtwork';
import { topFaceHref, topItem } from './pieceFaceHref';
import { seatedHeaderOf } from './seatedHeader';
import { useTabletopSelector } from './TabletopContext';
import styles from './TabletopScene.module.css';

const CARD_HEIGHT_PX = 380;
const CURSOR_GAP_PX = 28;
const EDGE_PX = 12;

type Point = { x: number; y: number };

/*
 * Whether Alt is held, and a ref to where the pointer is; a lost window or hidden page lets go of Alt.
 * Only Alt renders: the pointer is followed in a ref, so moving it costs no React render.
 */
function useAltPointer(): Readonly<{ alt: boolean; pointer: RefObject<Point> }> {
  const [alt, setAlt] = useState(false);
  const pointer = useRef<Point>({ x: 0, y: 0 });

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      setAlt(event.altKey);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        /* Alt alone would otherwise focus the browser's menu bar on Windows and Linux. */
        event.preventDefault();
      }
      setAlt(event.altKey);
    };
    const release = () => setAlt(false);
    const hidden = () => {
      if (document.visibilityState === 'hidden') {
        release();
      }
    };
    window.addEventListener('pointermove', onPointer);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);

  return { alt, pointer };
}

type Bounds = Readonly<{ left: number; top: number; right: number; bottom: number }>;

/** The close-up's box beside the pointer within the bounds, turned to the pointer's other side where the area would cut it off. */
function placeBeside(pointer: Point, width: number, height: number, bounds: Bounds) {
  const right = pointer.x + CURSOR_GAP_PX;
  const left = right + width + EDGE_PX > bounds.right ? pointer.x - CURSOR_GAP_PX - width : right;
  const top = Math.min(pointer.y - height / 2, bounds.bottom - height - EDGE_PX);
  return { left: Math.max(bounds.left + EDGE_PX, left), top: Math.max(bounds.top + EDGE_PX, top) };
}

/*
 * The window below the seated header, which lies over the canvas's top: the close-up may spill over the controls panel and the dock
 * when the table's own area is too small to hold it beside the pointer.
 */
function closeUpBounds(area: HTMLElement | null): Bounds {
  const header = area ? seatedHeaderOf(area)?.getBoundingClientRect() : undefined;
  return { left: 0, top: Math.max(0, header?.bottom ?? 0), right: window.innerWidth, bottom: window.innerHeight };
}

/*
 * Keeps the close-up beside the pointer: each pointer move asks for one placement on the next frame, written as a transform so the
 * browser moves the box on the compositor without laying out or repainting it, however often the pointer reports.
 */
function useFollowPointer(
  box: RefObject<HTMLDivElement | null>,
  pointer: RefObject<Point>,
  area: RefObject<HTMLElement | null>,
  size: Readonly<{ width: number; height: number }> | null
) {
  const width = size?.width;
  const height = size?.height;
  useLayoutEffect(() => {
    if (width == null || height == null) {
      return;
    }
    const place = () => {
      const position = placeBeside(pointer.current, width, height, closeUpBounds(area.current));
      box.current?.style.setProperty('transform', `translate3d(${position.left}px, ${position.top}px, 0)`);
    };
    place();
    let frame = 0;
    const onPointer = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          place();
        });
      }
    };
    window.addEventListener('pointermove', onPointer);
    return () => {
      window.removeEventListener('pointermove', onPointer);
      cancelAnimationFrame(frame);
    };
  }, [box, pointer, area, width, height]);
}

/*
 * Holding Alt over a card or token shows its face flat and large beside the pointer, out of the table's perspective, the way it is printed.
 * It shows the face the table shows, so a face-down card shows its back.
 */
export function PieceCloseUp({ area }: Readonly<{ area: RefObject<HTMLElement | null> }>) {
  const { alt, pointer } = useAltPointer();
  const box = useRef<HTMLDivElement>(null);
  const piece = useTabletopSelector((table) =>
    table.hoveredPieceId ? (table.renderedPieces.find((entry) => entry.id === table.hoveredPieceId) ?? null) : null
  );
  const href = piece ? topFaceHref(piece) : undefined;
  const top = piece ? topItem(piece) : undefined;
  const shown = alt && piece && href && top ? piece : null;
  const isCard = shown?.kind === 'card';
  /* A disc token stays a disc, as it lies on the table. */
  const round = shown != null && !isCard && tokenBoxRatio(shown) == null;
  const width = isCard ? cardWidthFor(CARD_HEIGHT_PX) : TOKEN_SIZE_PX;
  const height = isCard ? CARD_HEIGHT_PX : TOKEN_SIZE_PX;
  const count = shown ? pieceCount(shown) : 0;
  useFollowPointer(box, pointer, area, shown ? { width, height: height + (count > 1 && !round ? 40 : 16) } : null);
  if (!shown || !href || !top) {
    return null;
  }
  /* On the page's body, so the table's own stacking cannot slide it under a panel it spills over. */
  return createPortal(
    <div ref={box} className={styles.closeUp} data-round={round || undefined} data-piece-close-up aria-hidden>
      {/* Only the top item, so a stack of prediction cards that share one front shows the top card's prediction. */}
      <PieceArtwork
        piece={{ ...shown, items: [top] }}
        src={href}
        name={shown.label}
        width={width}
        height={height}
        radius="10px"
      />
      {count > 1 ? <div className={styles.closeUpCount}>×{count}</div> : null}
    </div>,
    document.body
  );
}
