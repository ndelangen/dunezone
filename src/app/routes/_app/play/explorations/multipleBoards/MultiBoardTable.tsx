import { Tooltip } from '@mantine/core';
import { coreColors } from '@shared/uiPalette';
import { HelpMark } from '@ui/content/HelpMark';
import { KeyedText } from '@ui/content/Kbd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { useMotionAllowed } from '@app/styles/motion';
import arrakisMapUrl from '@app/widgets/tabletop/assets/arrakis-map.svg?url';

import type { BoardLayout, LayoutBoard, LayoutPiece, PieceColor, PiecePlace } from './layouts';
import styles from './MultiBoardTable.module.css';

/*
 * A top-down prototype of a table with several boards (Norbert, 2026-10-29). It draws the layout's table, boards and
 * trays, lets pieces be dragged between boards, and moves a camera over them: wheel to zoom at the pointer, drag the
 * table to pan, arrows or WASD to pan, number keys to fly to a board and 0 for all of them.
 */

type View = { x: number; y: number; w: number; h: number };
type Drag = { id: string; dx: number; dy: number; x: number; y: number };
type Pan = { startX: number; startY: number; view: View; scale: number };
type Target =
  | { kind: 'board'; board: string }
  | { kind: 'gate'; gate: string; end: number }
  | { kind: 'dock'; board: string };

const PIECE_FILL: Record<PieceColor, string> = {
  green: coreColors.positiveFill,
  blue: coreColors.progressFill,
  violet: coreColors.publishFill,
  orange: coreColors.cautionFill,
  red: coreColors.negativeFill,
};
const TROOP_RADIUS = 6;
const LEADER_RADIUS = 10;
const RIM = 1.07;
const WELL_RADIUS = 7;
const GATE_RADIUS = 9;
const CAMERA_MS = 450;
/* Margin round everything when the camera frames all boards, and round one board when it flies there. */
const FRAME_MARGIN = 18;
const FOCUS_MARGIN = 1.35;

function boardById(layout: BoardLayout, id: string | null): LayoutBoard | undefined {
  return layout.boards.find((board) => board.id === id);
}

function polar(board: LayoutBoard, angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: board.x + Math.cos(radians) * radius, y: board.y + Math.sin(radians) * radius };
}

function rimWellSpots(board: LayoutBoard) {
  const count = board.rimWells ?? 0;
  return Array.from({ length: count }, (_, index) => polar(board, -90 + (index * 360) / count, board.r * RIM));
}

/* Everything the table covers, so the camera can frame it. */
function tableBounds(layout: BoardLayout): View {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const shape of layout.table) {
    const [x0, y0, x1, y1] =
      shape.kind === 'circle'
        ? [shape.x - shape.r, shape.y - shape.r, shape.x + shape.r, shape.y + shape.r]
        : [shape.x, shape.y, shape.x + shape.w, shape.y + shape.h];
    left = Math.min(left, x0);
    top = Math.min(top, y0);
    right = Math.max(right, x1);
    bottom = Math.max(bottom, y1);
  }
  return {
    x: left - FRAME_MARGIN,
    y: top - FRAME_MARGIN,
    w: right - left + FRAME_MARGIN * 2,
    h: bottom - top + FRAME_MARGIN * 2,
  };
}

function boardView(board: LayoutBoard): View {
  const size = board.r * 2 * FOCUS_MARGIN;
  return { x: board.x - size / 2, y: board.y - size / 2, w: size, h: size };
}

function worldOf(layout: BoardLayout, at: PiecePlace) {
  const board = boardById(layout, at.board);
  return board ? { x: board.x + at.x, y: board.y + at.y } : { x: at.x, y: at.y };
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** The camera: a view box that eases to where it is sent while motion is allowed, and jumps there when it is not. */
function useCamera(initial: View) {
  const motion = useMotionAllowed();
  const [view, setView] = useState(initial);
  const frame = useRef<number | null>(null);
  const current = useRef(view);
  useEffect(() => {
    current.current = view;
  }, [view]);
  const flyTo = useCallback(
    (target: View) => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
      if (!motion) {
        setView(target);
        return;
      }
      const from = current.current;
      const start = performance.now();
      const step = (now: number) => {
        const t = ease(Math.min(1, (now - start) / CAMERA_MS));
        setView({
          x: from.x + (target.x - from.x) * t,
          y: from.y + (target.y - from.y) * t,
          w: from.w + (target.w - from.w) * t,
          h: from.h + (target.h - from.h) * t,
        });
        frame.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      frame.current = requestAnimationFrame(step);
    },
    [motion]
  );
  useEffect(() => () => void (frame.current !== null && cancelAnimationFrame(frame.current)), []);
  return { view, setView, flyTo };
}

export function MultiBoardTable({ layout }: Readonly<{ layout: BoardLayout }>) {
  const motion = useMotionAllowed();
  const svg = useRef<SVGSVGElement>(null);
  const all = useMemo(() => tableBounds(layout), [layout]);
  const { view, setView, flyTo } = useCamera(all);
  const [pieces, setPieces] = useState<readonly LayoutPiece[]>(layout.pieces);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pan, setPan] = useState<Pan | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  /* In a one-at-a-time layout, the board on the table; the others wait in the dock. */
  const [shown, setShown] = useState(layout.boards[0]?.id ?? '');
  const [arrival, setArrival] = useState<{ id: string; note: string } | null>(null);

  const visibleBoards = useMemo(
    () => (layout.view === 'one' ? layout.boards.filter((board) => board.id === shown) : layout.boards),
    [layout, shown]
  );
  const docked = useMemo(
    () => (layout.view === 'one' ? layout.boards.filter((board) => board.id !== shown) : []),
    [layout, shown]
  );

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const element = svg.current;
    const matrix = element?.getScreenCTM();
    if (!element || !matrix) {
      return { x: 0, y: 0 };
    }
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }, []);

  const focusBoard = useCallback(
    (id: string | null) => {
      setFocus(id);
      if (layout.view === 'one' && id) {
        setShown(id);
        flyTo(all);
        return;
      }
      const board = boardById(layout, id);
      flyTo(board ? boardView(board) : all);
    },
    [all, flyTo, layout]
  );

  /* What lies under a point while a piece is carried: a gate, a docked board, or a board. */
  const targetAt = useCallback(
    (x: number, y: number): Target | null => {
      for (const gate of layout.gates ?? []) {
        for (const [end, spot] of gate.ends.entries()) {
          const board = boardById(layout, spot.board);
          if (board) {
            const at = polar(board, spot.angle, board.r * RIM);
            if (Math.hypot(at.x - x, at.y - y) <= GATE_RADIUS + 4) {
              return { kind: 'gate', gate: gate.id, end };
            }
          }
        }
      }
      if (layout.dock) {
        const { dock } = layout;
        for (const [index, board] of docked.entries()) {
          if (Math.hypot(dock.x - x, dock.y + index * dock.r * 2.4 - y) <= dock.r + 6) {
            return { kind: 'dock', board: board.id };
          }
        }
      }
      for (const board of visibleBoards) {
        if (Math.hypot(board.x - x, board.y - y) <= board.r * RIM + WELL_RADIUS) {
          return { kind: 'board', board: board.id };
        }
      }
      return null;
    },
    [docked, layout, visibleBoards]
  );

  const place = useCallback(
    (id: string, x: number, y: number) => {
      const target = targetAt(x, y);
      let at: PiecePlace = { board: null, x, y };
      let note: string | null = null;
      if (target?.kind === 'gate') {
        const gate = layout.gates?.find((candidate) => candidate.id === target.gate);
        const exit = gate?.ends[1 - target.end];
        const board = exit && boardById(layout, exit.board);
        if (gate && exit && board) {
          /* The piece comes out just inside the other gate, on that board's map. */
          const out = polar(board, exit.angle, board.r * 0.82);
          at = { board: board.id, x: out.x - board.x, y: out.y - board.y };
          note = `Through gate ${gate.label} to ${board.name}`;
        }
      } else if (target?.kind === 'dock') {
        const from = boardById(layout, shown);
        const board = boardById(layout, target.board);
        const piece = pieces.find((candidate) => candidate.id === id);
        if (board && piece) {
          /* Sent to the same spot on the other map: where it was on the shown board, or the middle from a tray. */
          const local = piece.at.board === from?.id ? piece.at : { x: 0, y: 0 };
          at = { board: board.id, x: local.x, y: local.y };
          note = `Sent to ${board.name}`;
        }
      } else if (target?.kind === 'board') {
        const board = boardById(layout, target.board);
        if (board) {
          const well = rimWellSpots(board).find((spot) => Math.hypot(spot.x - x, spot.y - y) <= WELL_RADIUS + 3);
          const spot = well ?? { x, y };
          at = { board: board.id, x: spot.x - board.x, y: spot.y - board.y };
        }
      }
      setPieces((current) => current.map((piece) => (piece.id === id ? { ...piece, at } : piece)));
      setArrival(note ? { id, note } : null);
    },
    [layout, pieces, shown, targetAt]
  );

  /* Keys move the camera, as at today's table: arrows or WASD pan, numbers fly to a board, 0 frames them all. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('input, textarea, [contenteditable="true"]') ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      const pans: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        KeyA: [-1, 0],
        ArrowRight: [1, 0],
        KeyD: [1, 0],
        ArrowUp: [0, -1],
        KeyW: [0, -1],
        ArrowDown: [0, 1],
        KeyS: [0, 1],
      };
      const step = pans[event.code];
      if (step) {
        event.preventDefault();
        setView((current) => ({
          ...current,
          x: current.x + step[0] * current.w * 0.08,
          y: current.y + step[1] * current.h * 0.08,
        }));
        return;
      }
      if (event.key === '0') {
        focusBoard(null);
        return;
      }
      const index = Number(event.key) - 1;
      const board = Number.isInteger(index) ? layout.boards[index] : undefined;
      if (board) {
        focusBoard(board.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusBoard, layout.boards, setView]);

  /* The wheel zooms at the pointer: the point under it stays put. A native listener, so the page does not scroll. */
  useEffect(() => {
    const element = svg.current;
    if (!element) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = toWorld(event.clientX, event.clientY);
      const factor = Math.exp(event.deltaY * 0.0015);
      setView((current) => {
        const w = Math.min(all.w * 2, Math.max(60, current.w * factor));
        const scale = w / current.w;
        return {
          x: point.x - (point.x - current.x) * scale,
          y: point.y - (point.y - current.y) * scale,
          w,
          h: current.h * scale,
        };
      });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [all.w, setView, toWorld]);

  useEffect(() => {
    if (!arrival) {
      return;
    }
    const timer = setTimeout(() => setArrival(null), 1800);
    return () => clearTimeout(timer);
  }, [arrival]);

  const onPiecePointerDown = (event: ReactPointerEvent, piece: LayoutPiece) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    svg.current?.setPointerCapture(event.pointerId);
    const point = toWorld(event.clientX, event.clientY);
    const at = worldOf(layout, piece.at);
    setDrag({ id: piece.id, dx: at.x - point.x, dy: at.y - point.y, x: at.x, y: at.y });
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) {
      return;
    }
    svg.current?.setPointerCapture(event.pointerId);
    setPan({ startX: event.clientX, startY: event.clientY, view, scale: 1 / matrix.a });
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drag) {
      const point = toWorld(event.clientX, event.clientY);
      setDrag({ ...drag, x: point.x + drag.dx, y: point.y + drag.dy });
    } else if (pan) {
      setView({
        ...pan.view,
        x: pan.view.x - (event.clientX - pan.startX) * pan.scale,
        y: pan.view.y - (event.clientY - pan.startY) * pan.scale,
      });
    }
  };

  const onPointerUp = () => {
    if (drag) {
      place(drag.id, drag.x, drag.y);
    }
    setDrag(null);
    setPan(null);
  };

  const hovered = drag ? targetAt(drag.x, drag.y) : null;
  const shownPieces = pieces.filter(
    (piece) => piece.at.board === null || visibleBoards.some((board) => board.id === piece.at.board)
  );

  return (
    <div className={styles.root}>
      <svg
        ref={svg}
        className={styles.scene}
        data-panning={pan ? '' : undefined}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label={`${layout.name}: a table with ${layout.boards.length} boards`}
      >
        <defs>
          {layout.boards.map((board) => (
            <clipPath key={board.id} id={`clip-${layout.id}-${board.id}`}>
              <circle r={board.r} />
            </clipPath>
          ))}
        </defs>
        <TableTop layout={layout} />
        {layout.furniture.map((item) => (
          <FurnitureItem key={`${item.kind}-${item.label}`} item={item} />
        ))}
        {visibleBoards.map((board) => (
          <Board
            key={board.id}
            layoutId={layout.id}
            board={board}
            hot={hovered?.kind === 'board' && hovered.board === board.id}
            turning={layout.view === 'one' && motion}
          />
        ))}
        {layout.gates?.map((gate) =>
          gate.ends.map((end, index) => {
            const board = boardById(layout, end.board);
            if (!board) {
              return null;
            }
            const at = polar(board, end.angle, board.r * RIM);
            const hot = hovered?.kind === 'gate' && hovered.gate === gate.id;
            return (
              <g
                key={`${gate.id}-${index}`}
                transform={`translate(${at.x} ${at.y})`}
                className={styles.gate}
                data-hot={hot || undefined}
              >
                <circle r={GATE_RADIUS} />
                <text dy="0.35em">{gate.label}</text>
              </g>
            );
          })
        )}
        {layout.dock
          ? docked.map((board, index) => (
              <DockedBoard
                key={board.id}
                layoutId={layout.id}
                board={board}
                x={layout.dock!.x}
                y={layout.dock!.y + index * layout.dock!.r * 2.4}
                r={layout.dock!.r}
                count={pieces.filter((piece) => piece.at.board === board.id).length}
                hot={hovered?.kind === 'dock' && hovered.board === board.id}
                onOpen={() => focusBoard(board.id)}
              />
            ))
          : null}
        {shownPieces.map((piece) => {
          const carried = drag?.id === piece.id;
          const at = carried ? { x: drag.x, y: drag.y } : worldOf(layout, piece.at);
          return (
            <Piece
              key={piece.id}
              piece={piece}
              x={at.x}
              y={at.y}
              carried={carried}
              glide={motion && !carried}
              onPointerDown={(event) => onPiecePointerDown(event, piece)}
            />
          );
        })}
      </svg>

      <div className={styles.header}>
        <div className={styles.chip}>
          <strong>{layout.name}</strong>
          <HelpMark
            text={`${layout.summary}\n\nWhere the boards come from: ${layout.source}\n\nMoving pieces: ${layout.movementHelp}`}
          />
        </div>
        {arrival ? (
          <div className={styles.chip} role="status">
            {arrival.note}
          </div>
        ) : null}
      </div>

      <div className={styles.dial} role="group" aria-label="Boards">
        <Tooltip label="All boards (0)">
          <button
            type="button"
            className={styles.dialButton}
            aria-pressed={focus === null}
            onClick={() => focusBoard(null)}
          >
            All
          </button>
        </Tooltip>
        {layout.boards.map((board, index) => (
          <Tooltip key={board.id} label={`${board.name}${board.role === 'primary' ? ', primary' : ''} (${index + 1})`}>
            <button
              type="button"
              className={styles.dialButton}
              aria-pressed={layout.view === 'one' ? shown === board.id : focus === board.id}
              onClick={() => focusBoard(board.id)}
            >
              {board.role === 'primary' ? <span className={styles.primaryMark} aria-label="Primary" /> : null}
              {board.name}
            </button>
          </Tooltip>
        ))}
      </div>

      <p className={styles.hint}>
        <KeyedText>{`Drag pieces between boards. {1}–{${layout.boards.length}} fly to a board, {0} shows all; wheel zooms, drag the table to pan.`}</KeyedText>
      </p>
    </div>
  );
}

function TableTop({ layout }: Readonly<{ layout: BoardLayout }>) {
  /* Every shape is drawn twice: the edges first, then the tops over them, so overlapping shapes read as one table. */
  const shape = (outline: boolean) =>
    layout.table.map((item, index) =>
      item.kind === 'circle' ? (
        <circle
          key={index}
          cx={item.x}
          cy={item.y}
          r={item.r}
          className={outline ? styles.tableEdge : styles.tableTop}
        />
      ) : (
        <rect
          key={index}
          x={item.x}
          y={item.y}
          width={item.w}
          height={item.h}
          rx={item.rx}
          className={outline ? styles.tableEdge : styles.tableTop}
        />
      )
    );
  return (
    <g aria-hidden>
      {shape(true)}
      {shape(false)}
    </g>
  );
}

function FurnitureItem({ item }: Readonly<{ item: BoardLayout['furniture'][number] }>) {
  switch (item.kind) {
    case 'tray':
      return (
        <g className={styles.tray}>
          <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={6} />
          <text x={item.x + item.w / 2} y={item.y - 4}>
            {item.label}
          </text>
        </g>
      );
    case 'disc':
      return (
        <g className={styles.phaseDisc}>
          <circle cx={item.x} cy={item.y} r={item.r} />
          <text x={item.x} y={item.y} dy="0.35em">
            {item.label}
          </text>
        </g>
      );
    case 'track': {
      const spots = Array.from({ length: item.count }, (_, index) => {
        const angle = ((item.from + ((item.to - item.from) * index) / (item.count - 1)) * Math.PI) / 180;
        return { x: item.x + Math.cos(angle) * item.radius, y: item.y + Math.sin(angle) * item.radius };
      });
      return (
        <g className={styles.track} aria-label={`${item.label} ${item.current} of ${item.count}`}>
          {spots.map((spot, index) => (
            <circle
              key={index}
              cx={spot.x}
              cy={spot.y}
              r={5.5}
              data-current={index + 1 === item.current || undefined}
            />
          ))}
        </g>
      );
    }
  }
}

function Board({
  layoutId,
  board,
  hot,
  turning,
}: Readonly<{ layoutId: string; board: LayoutBoard; hot: boolean; turning: boolean }>) {
  return (
    <g transform={`translate(${board.x} ${board.y})`} className={styles.board} data-hot={hot || undefined}>
      <g className={turning ? styles.turnIn : undefined}>
        <circle r={board.r * RIM} className={styles.rim} />
        <g transform={`rotate(${board.rotation ?? 0})`}>
          <circle r={board.r} className={styles.mapGround} />
          <image
            href={arrakisMapUrl}
            x={-board.r}
            y={-board.r}
            width={board.r * 2}
            height={board.r * 2}
            clipPath={`url(#clip-${layoutId}-${board.id})`}
          />
        </g>
        <circle r={board.r * RIM} className={styles.hotRing} />
        {rimWellSpots({ ...board, x: 0, y: 0 }).map((spot, index) => (
          <circle key={index} cx={spot.x} cy={spot.y} r={WELL_RADIUS} className={styles.well} />
        ))}
      </g>
      <g transform={`translate(0 ${board.r * RIM + 10})`} className={styles.boardLabel}>
        <text dy="0.35em">
          {board.name}
          {board.role === 'primary' ? ' · primary' : ''}
        </text>
      </g>
    </g>
  );
}

function DockedBoard({
  layoutId,
  board,
  x,
  y,
  r,
  count,
  hot,
  onOpen,
}: Readonly<{
  layoutId: string;
  board: LayoutBoard;
  x: number;
  y: number;
  r: number;
  count: number;
  hot: boolean;
  onOpen: () => void;
}>) {
  const scale = r / board.r;
  return (
    <g
      transform={`translate(${x} ${y})`}
      className={styles.dock}
      data-hot={hot || undefined}
      role="button"
      aria-label={`Switch to ${board.name}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onOpen}
    >
      <g transform={`scale(${scale})`}>
        <circle r={board.r * RIM} className={styles.rim} />
        <g transform={`rotate(${board.rotation ?? 0})`}>
          <circle r={board.r} className={styles.mapGround} />
          <image
            href={arrakisMapUrl}
            x={-board.r}
            y={-board.r}
            width={board.r * 2}
            height={board.r * 2}
            clipPath={`url(#clip-${layoutId}-${board.id})`}
          />
        </g>
        <circle r={board.r * RIM} className={styles.hotRing} />
      </g>
      <text y={r * RIM + 9} className={styles.dockLabel}>
        {board.name}
      </text>
      <g transform={`translate(${r * 0.75} ${-r * 0.75})`} className={styles.badge}>
        <circle r={8} />
        <text dy="0.35em">{count}</text>
      </g>
    </g>
  );
}

function Piece({
  piece,
  x,
  y,
  carried,
  glide,
  onPointerDown,
}: Readonly<{
  piece: LayoutPiece;
  x: number;
  y: number;
  carried: boolean;
  glide: boolean;
  onPointerDown: (event: ReactPointerEvent) => void;
}>) {
  const radius = piece.kind === 'leader' ? LEADER_RADIUS : TROOP_RADIUS;
  return (
    <g
      className={styles.piece}
      data-carried={carried || undefined}
      style={{ transform: `translate(${x}px, ${y}px)`, transition: glide ? 'transform 380ms ease-out' : undefined }}
      onPointerDown={onPointerDown}
    >
      <circle r={radius + 1.2} cy={1.4} className={styles.pieceShadow} />
      <circle r={radius} fill={PIECE_FILL[piece.color]} className={styles.pieceBody} />
      {piece.kind === 'troop' && (piece.count ?? 1) > 1 ? (
        <text dy="0.35em" className={styles.pieceCount}>
          {piece.count}
        </text>
      ) : null}
      {piece.kind === 'leader' ? <circle r={radius * 0.55} className={styles.leaderFace} /> : null}
    </g>
  );
}
