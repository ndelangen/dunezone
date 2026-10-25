import { Menu, Text } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import {
  clampHiddenZoneSpot,
  HIDDEN_ZONE_DEPTH,
  HIDDEN_ZONE_WIDTH,
  hiddenZoneFootprint,
  hiddenZonePieces,
  hiddenZoneView,
  turnHiddenZoneSpot,
} from '@shared/play/hiddenZone';
import type { HiddenZoneSpot } from '@shared/play/hiddenZone';
import type { TablePiece } from '@shared/play/model';
import { HIDDEN_ZONE_TURNS } from '@shared/play/schema';
import { Section } from '@ui/block/Section';
import type { ComponentProps, MouseEvent, PointerEvent, ReactNode, RefObject } from 'react';
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { TableSession, TableProjection } from '../../../../db/tabletop/TableSession';
import { HandPieceCloseUp } from '../../../../widgets/tabletop/PieceCloseUp';
import { PieceImage, pieceName, useHandCloseUp } from './HandPiece';
import styles from './HiddenZone.module.css';
import { HIDDEN_ZONE_HELP } from './panelGuidance';

/* A piece's offset along one side, kept within the zone, or at its start where the piece is larger than the zone. */
const inside = (offset: number, max: number) => Math.max(0, Math.min(max, offset));

type Props = { client: TableSession; table: TableProjection; hand: TablePiece[] };

export type HandMenuAnchor = { pieceId: string; x: number; y: number };

/** Where a right-click opens a hand piece's menu: at the pointer, keeping the browser's own menu shut. */
export function handMenuAnchor(event: MouseEvent, pieceId: string): HandMenuAnchor {
  event.preventDefault();
  return { pieceId, x: event.clientX, y: event.clientY };
}

/*
 * An empty positioning anchor at the pointer, not a control, as the table's piece menu uses.
 * It lives on the body: fixed against the viewport only there, since a window with a transform or a backdrop filter
 * (the compass's) would otherwise be its containing block and put it off-screen, where the dropdown hides itself.
 */
function PointerAnchor({ x, y, style, ...target }: ComponentProps<'span'> & { x: number; y: number }) {
  return createPortal(
    <span
      aria-hidden
      {...target}
      style={{ ...style, position: 'fixed', left: x, top: y, width: 1, height: 1, pointerEvents: 'none' }}
    />,
    document.body
  );
}

/** A hand piece's right-click menu, opened at the pointer as the table's piece menu is. */
export function HandPieceMenu({
  anchor,
  label,
  onClose,
  children,
}: {
  anchor: HandMenuAnchor | null;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const labelId = useId();
  return (
    <Menu opened={!!anchor} onChange={(opened) => !opened && onClose()} withinPortal position="bottom-start">
      <Menu.Target>
        <PointerAnchor x={anchor?.x ?? 0} y={anchor?.y ?? 0} />
      </Menu.Target>
      <Menu.Dropdown aria-labelledby={labelId}>
        <span id={labelId} hidden>
          {label}
        </span>
        {children}
      </Menu.Dropdown>
    </Menu>
  );
}

/* The height the window scrolling the zone shows, so the zone fills the window without scrolling, whatever its height. */
function useScrollParentHeight(ref: RefObject<HTMLElement | null>) {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    let parent = ref.current?.parentElement ?? null;
    while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) {
      parent = parent.parentElement;
    }
    if (!parent) {
      return;
    }
    const scroller = parent;
    const measure = () => {
      const style = getComputedStyle(scroller);
      setHeight(scroller.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}

/* How far the pointer travels before a press on a piece becomes a carry, so a click stays a click. */
const CARRY_THRESHOLD_PX = 4;

/* A piece being carried: where it was grabbed within its box, and where the pointer is now. */
type Carry = Readonly<{
  pieceId: string;
  /** The piece's place in the zone, which holds the pointer while it is carried. */
  holder: HTMLElement;
  pointerId: number;
  grabX: number;
  grabY: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moving: boolean;
}>;

/*
 * A dropped piece stays where it was let go until the room's answer moves it, so it never jumps back first.
 * A move the room refuses brings no new spot, so the piece goes back to where the room keeps it once the answer is in.
 */
type Landing = Readonly<{
  pieceId: string;
  commandId: string;
  at: HiddenZoneSpot;
  from: TablePiece['hiddenZone'];
}>;

/* A turn the page shows at once and sends when Q or E comes up, as a held key on the table does: `by` 15° steps, clockwise when positive. */
type Turning = Readonly<{ pieceId: string; by: number }>;

/* The box a piece of `width` by `depth` covers once turned, so a turned card is kept whole in view by its turned size. */
function turnedReach(width: number, depth: number, spot: HiddenZoneSpot) {
  const angle = ((spot.turn ?? 0) * Math.PI) / 12;
  const [cos, sin] = [Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle))];
  return { across: width * cos + depth * sin, down: width * sin + depth * cos };
}

/* How the zone draws a piece turned in 15° steps. */
const turned = (spot: HiddenZoneSpot) => (spot.turn ? `rotate(${spot.turn * 15}deg)` : undefined);

/* A key typed into a text field belongs to that field. */
function typing(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
  );
}

/*
 * A carry let go over the table plays the piece there, through the same drop the hand's drags use,
 * so the table alone decides where on its plate the piece lands.
 */
function dropOnTable(pieceId: string, clientX: number, clientY: number) {
  const target = document.elementFromPoint(clientX, clientY);
  if (!(target instanceof HTMLCanvasElement)) {
    return;
  }
  const dataTransfer = new DataTransfer();
  dataTransfer.setData('application/dune-hand', pieceId);
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX, clientY, dataTransfer }));
}

/**
 * The faction's hidden zone: a private top-down patch of table where it lays out pieces from its hand, such as a token on a card's track.
 * Only the faction sees it.
 * Pieces move freely and may overlap, cards below tokens.
 * A carried piece follows the pointer itself, with no drag image, and a carry let go over the table plays the piece as the hand does.
 */
export function HiddenZone({ client, table, hand }: Props) {
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  /*
   * The carry lives in a ref, and React renders only when a piece is lifted or let go.
   * In between, each pointer move places the lifted piece itself, a compositor-only transform, so it keeps up with the pointer.
   */
  const [carry, renderCarry] = useState<Carry | null>(null);
  const carrying = useRef<Carry | null>(null);
  const lifted = useRef<HTMLDivElement | null>(null);
  const place = () => {
    const current = carrying.current;
    if (lifted.current && current) {
      lifted.current.style.transform = `translate3d(${current.x - current.grabX}px, ${current.y - current.grabY}px, 0)`;
    }
  };
  const setCarry = (next: Carry | null | ((current: Carry | null) => Carry | null)) => {
    const previous = carrying.current;
    carrying.current = typeof next === 'function' ? next(previous) : next;
    const current = carrying.current;
    const lifts = previous && current ? previous.moving !== current.moving : previous !== current;
    if (lifts) {
      renderCarry(current);
    }
    place();
  };
  /* Placed as it mounts, from wherever the pointer has gone since the render that lifted it. */
  const lift = (element: HTMLDivElement | null) => {
    lifted.current = element;
    place();
  };
  const [landing, setLanding] = useState<Landing | null>(null);
  /* The pending turn in a ref as well, so a key that comes up before React renders still sends the whole turn. */
  const [turning, renderTurning] = useState<Turning | null>(null);
  const turns = useRef<Turning | null>(null);
  const setTurning = (next: Turning | null) => {
    turns.current = next;
    renderTurning(next);
  };
  const [menu, setMenu] = useState<HandMenuAnchor | null>(null);
  const pieces = hiddenZonePieces(hand);
  const { scale, extent } = hiddenZoneView(width, height);
  const enabled = table.canHandleTable;
  const frame = useRef<HTMLDivElement>(null);
  const fitHeight = useScrollParentHeight(frame);
  const closeUp = useHandCloseUp(pieces);

  /* The spot a piece shows: where it was let go while the room has not answered yet, else where the room keeps it. */
  const spotOf = (piece: TablePiece) =>
    landing && landing.pieceId === piece.id && landing.from === piece.hiddenZone && client.awaiting(landing.commandId)
      ? landing.at
      : piece.hiddenZone!;
  /* The spot a piece shows with the turn this page has not sent yet. */
  const shownSpot = (piece: TablePiece) =>
    turning && turning.pieceId === piece.id ? turnHiddenZoneSpot(spotOf(piece), turning.by) : spotOf(piece);

  /* Lays a piece at a spot, showing it there until the room answers. */
  const lay = (piece: TablePiece, at: HiddenZoneSpot) => {
    const commandId = client.command({ kind: 'hand-zone', pieceId: piece.id, at });
    setLanding(commandId ? { pieceId: piece.id, commandId, at, from: piece.hiddenZone } : null);
  };
  const sendTurn = (pending: Turning | null) => {
    const piece = pending && pieces.find((candidate) => candidate.id === pending.pieceId);
    setTurning(null);
    if (piece && pending.by % HIDDEN_ZONE_TURNS !== 0) {
      lay(piece, turnHiddenZoneSpot(spotOf(piece), pending.by));
    }
  };

  /*
   * Q and E turn the piece under the pointer, or the one being carried, as they turn a piece on the table.
   * The table's own keys never hear them, so a piece selected there stays as it is.
   */
  const turnKey = useEffectEvent((event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const lifted = carrying.current;
    const carried = lifted && lifted.moving ? lifted.pieceId : null;
    const pieceId = carried ?? closeUp.piece?.id ?? null;
    /*
     * The turn goes out when its key comes up, wherever the pointer has gone since and whatever modifier is held by then
     * (Alt for a close look changes the letter a key types), unless the piece is still carried.
     */
    const pending = turns.current;
    if (event.type === 'keyup') {
      const turnKeyUp = key === 'q' || key === 'e' || event.code === 'KeyQ' || event.code === 'KeyE';
      if (turnKeyUp && pending && carried !== pending.pieceId) {
        event.preventDefault();
        event.stopPropagation();
        sendTurn(pending);
      }
      return;
    }
    if ((key !== 'q' && key !== 'e') || event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) {
      return;
    }
    if (!enabled || !pieceId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (pending && pending.pieceId !== pieceId) {
      sendTurn(pending);
    }
    const by = pending && pending.pieceId === pieceId ? pending.by : 0;
    setTurning({ pieceId, by: by + (key === 'q' ? -1 : 1) });
  });
  const finishTurn = useEffectEvent(() => {
    const pending = turns.current;
    const lifted = carrying.current;
    if (pending && !(lifted && lifted.pieceId === pending.pieceId)) {
      sendTurn(pending);
    }
  });
  useEffect(() => {
    const listen = (event: KeyboardEvent) => turnKey(event);
    /* A key let go in another window never comes up here, so leaving the window sends the turn it shows, as the table does. */
    const leave = () => finishTurn();
    window.addEventListener('keydown', listen, true);
    window.addEventListener('keyup', listen, true);
    window.addEventListener('blur', leave);
    return () => {
      window.removeEventListener('keydown', listen, true);
      window.removeEventListener('keyup', listen, true);
      window.removeEventListener('blur', leave);
    };
  }, []);

  /*
   * Escape puts a carried piece back where it was, as the browser's own drags do, and keeps Escape from the windows behind it.
   * Leaving the window does too, as the table's own carries do, so a release it never saw cannot move the piece later.
   */
  const carryingPiece = carry?.pieceId ?? null;
  useEffect(() => {
    if (!carryingPiece) {
      return;
    }
    const drop = () => {
      const current = carrying.current;
      setCarry(null);
      if (turns.current && turns.current.pieceId === current?.pieceId) {
        setTurning(null);
      }
      if (current?.holder.hasPointerCapture(current.pointerId)) {
        current.holder.releasePointerCapture(current.pointerId);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !carrying.current) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      drop();
    };
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', drop);
    return () => {
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', drop);
    };
  }, [carryingPiece]);

  const release = (event: PointerEvent<HTMLDivElement>, piece: TablePiece) => {
    const current = carrying.current;
    setCarry(null);
    if (!current || current.pointerId !== event.pointerId || !current.moving) {
      return;
    }
    /* The frame holds the zone alone, so its box is the zone's. */
    const zone = frame.current?.getBoundingClientRect();
    const inside =
      zone &&
      event.clientX >= zone.left &&
      event.clientX <= zone.right &&
      event.clientY >= zone.top &&
      event.clientY <= zone.bottom;
    const pending = turns.current && turns.current.pieceId === piece.id ? turns.current : null;
    const { turn } = pending ? turnHiddenZoneSpot(spotOf(piece), pending.by) : spotOf(piece);
    if (pending) {
      setTurning(null);
    }
    if (!inside || !zone) {
      dropOnTable(piece.id, event.clientX, event.clientY);
      return;
    }
    const footprint = hiddenZoneFootprint(piece);
    lay(
      piece,
      clampHiddenZoneSpot(
        {
          x: (event.clientX - zone.left - current.grabX + (footprint.width * scale) / 2) / (HIDDEN_ZONE_WIDTH * scale),
          y: (event.clientY - zone.top - current.grabY + (footprint.depth * scale) / 2) / (HIDDEN_ZONE_DEPTH * scale),
          ...(turn ? { turn } : {}),
        },
        extent
      )
    );
  };

  return (
    <Section hiddenHeading title="Private side-table" description={HIDDEN_ZONE_HELP}>
      <div ref={frame}>
        <div
          ref={ref}
          className={styles.zone}
          style={fitHeight ? { height: fitHeight } : { aspectRatio: `${HIDDEN_ZONE_WIDTH} / ${HIDDEN_ZONE_DEPTH}` }}
        >
          {!pieces.length && (
            <Text size="sm" c="dimmed" className={styles.empty}>
              Right-click a piece in your hand and choose Move to private side-table.
            </Text>
          )}
          {scale > 0 &&
            pieces.map((piece) => {
              const footprint = hiddenZoneFootprint(piece);
              const pieceWidth = footprint.width * scale;
              const pieceDepth = footprint.depth * scale;
              const spot = shownSpot(piece);
              const carried = carry?.pieceId === piece.id && carry.moving ? carry : null;
              /* Kept whole in view, as turned: a piece laid out in a roomier tab sits at this one's edge until moved. */
              const { across, down } = turnedReach(pieceWidth, pieceDepth, spot);
              const left =
                inside(spot.x * HIDDEN_ZONE_WIDTH * scale - across / 2, width - across) + (across - pieceWidth) / 2;
              const top =
                inside(spot.y * HIDDEN_ZONE_DEPTH * scale - down / 2, height - down) + (down - pieceDepth) / 2;
              const box = { width: pieceWidth, height: pieceDepth };
              const hover = closeUp.hover(piece);
              const handlers = {
                onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
                  if (!enabled || event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  /* The press keeps no default focus change, so the piece takes focus itself: a chat field focused before keeps Q and E no more. */
                  event.currentTarget.focus({ preventScroll: true });
                  event.currentTarget.setPointerCapture(event.pointerId);
                  /* Grabbed from the piece's upright box around its centre, the box a turned piece is carried and laid in. */
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setCarry({
                    pieceId: piece.id,
                    holder: event.currentTarget,
                    pointerId: event.pointerId,
                    grabX: event.clientX - (bounds.left + bounds.width / 2 - pieceWidth / 2),
                    grabY: event.clientY - (bounds.top + bounds.height / 2 - pieceDepth / 2),
                    startX: event.clientX,
                    startY: event.clientY,
                    x: event.clientX,
                    y: event.clientY,
                    moving: false,
                  });
                },
                onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
                  hover.onPointerMove();
                  setCarry((current) =>
                    current && current.pointerId === event.pointerId
                      ? {
                          ...current,
                          x: event.clientX,
                          y: event.clientY,
                          moving:
                            current.moving ||
                            Math.hypot(event.clientX - current.startX, event.clientY - current.startY) >
                              CARRY_THRESHOLD_PX,
                        }
                      : current
                  );
                },
                onPointerUp: (event: PointerEvent<HTMLDivElement>) => release(event, piece),
                onPointerCancel: () => setCarry(null),
                onLostPointerCapture: () => setCarry((current) => (current?.pieceId === piece.id ? null : current)),
              };
              return (
                <div
                  key={piece.id}
                  className={styles.piece}
                  data-carried={carried ? true : undefined}
                  aria-label={`Move ${pieceName(piece)} on private side-table`}
                  role="button"
                  tabIndex={0}
                  style={{ left, top, ...box, transform: turned(spot) }}
                  onDragStart={(event) => event.preventDefault()}
                  onContextMenu={(event) => setMenu(handMenuAnchor(event, piece.id))}
                  {...hover}
                  {...handlers}
                >
                  <PieceImage piece={piece} width={pieceWidth} height={pieceDepth} />
                  {/*
                   * The carried piece itself, on the page's body so neither the zone's edge nor a window's transform holds it back:
                   * it follows the pointer over the table too. Its place in the zone keeps the pointer, unseen, until it is let go.
                   */}
                  {carried &&
                    createPortal(
                      <div ref={lift} className={styles.carried} style={box} aria-hidden>
                        <div className={styles.turn} style={{ ...box, transform: turned(spot) }}>
                          <PieceImage piece={piece} width={pieceWidth} height={pieceDepth} />
                        </div>
                      </div>,
                      document.body
                    )}
                </div>
              );
            })}
        </div>
      </div>
      <HandPieceCloseUp area={frame} piece={closeUp.piece} />
      <HandPieceMenu anchor={menu} label="Private side-table actions" onClose={() => setMenu(null)}>
        {/* A quarter turn at a time from the menu; Q and E turn in 15° steps. */}
        {(
          [
            ['Turn left', -HIDDEN_ZONE_TURNS / 4],
            ['Turn right', HIDDEN_ZONE_TURNS / 4],
          ] as const
        ).map(([label, by]) => (
          <Menu.Item
            key={label}
            disabled={!enabled}
            onClick={() => {
              const piece = menu && pieces.find((candidate) => candidate.id === menu.pieceId);
              if (piece) {
                lay(piece, turnHiddenZoneSpot(spotOf(piece), by));
              }
              setMenu(null);
            }}
          >
            {label}
          </Menu.Item>
        ))}
        <Menu.Item
          disabled={!enabled}
          onClick={() => {
            if (menu) {
              client.command({ kind: 'hand-zone', pieceId: menu.pieceId, at: null });
            }
            setMenu(null);
          }}
        >
          Move to hand
        </Menu.Item>
      </HandPieceMenu>
    </Section>
  );
}
