import { Menu, Text } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import {
  clampHiddenZoneSpot,
  HIDDEN_ZONE_DEPTH,
  HIDDEN_ZONE_WIDTH,
  hiddenZoneFootprint,
  hiddenZonePieces,
  hiddenZoneView,
} from '@shared/play/hiddenZone';
import type { TablePiece } from '@shared/play/model';
import { Section } from '@ui/block/Section';
import type { ComponentProps, MouseEvent, PointerEvent, ReactNode, RefObject } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
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
  at: { x: number; y: number };
  from: TablePiece['hiddenZone'];
}>;

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
  /* The carry in a ref as well, so a release that follows a move before React renders still sees where the pointer went. */
  const [carry, renderCarry] = useState<Carry | null>(null);
  const carrying = useRef<Carry | null>(null);
  const setCarry = (next: Carry | null | ((current: Carry | null) => Carry | null)) => {
    carrying.current = typeof next === 'function' ? next(carrying.current) : next;
    renderCarry(carrying.current);
  };
  const [landing, setLanding] = useState<Landing | null>(null);
  const [menu, setMenu] = useState<HandMenuAnchor | null>(null);
  const pieces = hiddenZonePieces(hand);
  const { scale, extent } = hiddenZoneView(width, height);
  const enabled = table.canHandleTable;
  const frame = useRef<HTMLDivElement>(null);
  const fitHeight = useScrollParentHeight(frame);
  const closeUp = useHandCloseUp(pieces);

  /* The spot a piece shows: where it was let go while the room has not answered yet, else where the room keeps it. */
  const spotOf = (piece: TablePiece) =>
    landing &&
    landing.pieceId === piece.id &&
    landing.from === piece.hiddenZone &&
    client.awaiting(landing.commandId)
      ? landing.at
      : piece.hiddenZone!;

  /* Escape puts a carried piece back where it was, as the browser's own drags do, and keeps Escape from the windows behind it. */
  const carryingPiece = carry?.pieceId ?? null;
  useEffect(() => {
    if (!carryingPiece) {
      return;
    }
    const cancel = (event: KeyboardEvent) => {
      const current = carrying.current;
      if (event.key !== 'Escape' || !current) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setCarry(null);
      if (current.holder.hasPointerCapture(current.pointerId)) {
        current.holder.releasePointerCapture(current.pointerId);
      }
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
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
    if (!inside || !zone) {
      dropOnTable(piece.id, event.clientX, event.clientY);
      return;
    }
    const footprint = hiddenZoneFootprint(piece);
    const at = clampHiddenZoneSpot(
      {
        x: (event.clientX - zone.left - current.grabX + (footprint.width * scale) / 2) / (HIDDEN_ZONE_WIDTH * scale),
        y: (event.clientY - zone.top - current.grabY + (footprint.depth * scale) / 2) / (HIDDEN_ZONE_DEPTH * scale),
      },
      extent
    );
    const commandId = client.command({ kind: 'hand-zone', pieceId: piece.id, at });
    setLanding(commandId ? { pieceId: piece.id, commandId, at, from: piece.hiddenZone } : null);
  };

  return (
    <Section hiddenHeading title="Hidden zone" description={HIDDEN_ZONE_HELP}>
      <div ref={frame}>
        <div
          ref={ref}
          className={styles.zone}
          style={fitHeight ? { height: fitHeight } : { aspectRatio: `${HIDDEN_ZONE_WIDTH} / ${HIDDEN_ZONE_DEPTH}` }}
        >
          {!pieces.length && (
            <Text size="sm" c="dimmed" className={styles.empty}>
              Right-click a piece in your hand and choose Move to hidden zone.
            </Text>
          )}
          {scale > 0 &&
            pieces.map((piece) => {
              const footprint = hiddenZoneFootprint(piece);
              const pieceWidth = footprint.width * scale;
              const pieceDepth = footprint.depth * scale;
              const spot = spotOf(piece);
              const carried = carry?.pieceId === piece.id && carry.moving ? carry : null;
              /* Kept whole in view: a piece laid out in a roomier tab sits at this one's edge until moved. */
              const left = inside(spot.x * HIDDEN_ZONE_WIDTH * scale - pieceWidth / 2, width - pieceWidth);
              const top = inside(spot.y * HIDDEN_ZONE_DEPTH * scale - pieceDepth / 2, height - pieceDepth);
              const box = { width: pieceWidth, height: pieceDepth };
              const handlers = {
                onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
                  if (!enabled || event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setCarry({
                    pieceId: piece.id,
                    holder: event.currentTarget,
                    pointerId: event.pointerId,
                    grabX: event.clientX - bounds.left,
                    grabY: event.clientY - bounds.top,
                    startX: event.clientX,
                    startY: event.clientY,
                    x: event.clientX,
                    y: event.clientY,
                    moving: false,
                  });
                },
                onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
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
                  aria-label={`Move ${pieceName(piece)} in hidden zone`}
                  role="button"
                  tabIndex={0}
                  style={{ left, top, ...box }}
                  onDragStart={(event) => event.preventDefault()}
                  onContextMenu={(event) => setMenu(handMenuAnchor(event, piece.id))}
                  {...handlers}
                  {...closeUp.hover(piece)}
                >
                  <PieceImage piece={piece} width={pieceWidth} height={pieceDepth} />
                  {/*
                   * The carried piece itself, on the page's body so neither the zone's edge nor a window's transform holds it back:
                   * it follows the pointer over the table too. Its place in the zone keeps the pointer, unseen, until it is let go.
                   */}
                  {carried &&
                    createPortal(
                      <div
                        className={styles.carried}
                        style={{ left: carried.x - carried.grabX, top: carried.y - carried.grabY, ...box }}
                        aria-hidden
                      >
                        <PieceImage piece={piece} width={pieceWidth} height={pieceDepth} />
                      </div>,
                      document.body
                    )}
                </div>
              );
            })}
        </div>
      </div>
      <HandPieceCloseUp area={frame} piece={closeUp.piece} />
      <HandPieceMenu anchor={menu} label="Hidden zone actions" onClose={() => setMenu(null)}>
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
