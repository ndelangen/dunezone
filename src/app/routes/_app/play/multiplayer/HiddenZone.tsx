import { Menu, Text } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import {
  clampHiddenZoneSpot,
  HIDDEN_ZONE_DEPTH,
  HIDDEN_ZONE_WIDTH,
  hiddenZoneFootprint,
  hiddenZonePieces,
} from '@shared/play/hiddenZone';
import type { TablePiece } from '@shared/play/model';
import { Section } from '@ui/block/Section';
import type { DragEvent, MouseEvent, ReactNode, RefObject } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

import type { TableSession, TableProjection } from '../../../../db/tabletop/TableSession';
import { PieceImage, pieceName } from './HandPiece';
import styles from './HiddenZone.module.css';
import { HIDDEN_ZONE_HELP } from './panelGuidance';

type Props = { client: TableSession; table: TableProjection; hand: TablePiece[] };
/* A drag inside the zone carries this type beside the hand's own, so a drop on the table still plays the piece. */
const ZONE_DRAG = 'application/dune-zone';

export type HandMenuAnchor = { pieceId: string; x: number; y: number };

/** Where a right-click opens a hand piece's menu: at the pointer, keeping the browser's own menu shut. */
export function handMenuAnchor(event: MouseEvent, pieceId: string): HandMenuAnchor {
  event.preventDefault();
  return { pieceId, x: event.clientX, y: event.clientY };
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
        {/* An empty positioning anchor, not a control, as the table's piece menu uses. */}
        <span
          aria-hidden
          style={{
            position: 'fixed',
            left: anchor?.x ?? 0,
            top: anchor?.y ?? 0,
            width: 1,
            height: 1,
            pointerEvents: 'none',
          }}
        />
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

/* The height the panel scrolling the zone shows, so the whole zone fits in view without scrolling, whatever the dock's height. */
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

/**
 * The faction's hidden zone: a private top-down patch of table where it lays out pieces from its hand, such as a token on a card's track.
 * Only the faction sees it.
 * Pieces move freely and may overlap, cards below tokens;
 * a drag onto the table plays the piece as the hand does.
 */
export function HiddenZone({ client, table, hand }: Props) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  const [menu, setMenu] = useState<HandMenuAnchor | null>(null);
  const pieces = hiddenZonePieces(hand);
  const scale = width / HIDDEN_ZONE_WIDTH;
  const enabled = table.canHandleTable;
  const frame = useRef<HTMLDivElement>(null);
  const fitHeight = useScrollParentHeight(frame);

  const drop = (event: DragEvent<HTMLDivElement>) => {
    const pieceId = event.dataTransfer.getData('application/dune-hand');
    /* A grab only starts on a piece the zone drew, so the zone has its width by then. */
    const offset = grab.current;
    if (!pieceId || !offset) {
      return;
    }
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const at = clampHiddenZoneSpot({
      x: (event.clientX - bounds.left - offset.dx) / bounds.width,
      y: (event.clientY - bounds.top - offset.dy) / bounds.height,
    });
    grab.current = null;
    client.command({ kind: 'hand-zone', pieceId, at });
  };

  return (
    <Section hiddenHeading title="Hidden zone" description={HIDDEN_ZONE_HELP}>
      <div ref={frame}>
        <div
          ref={ref}
          className={styles.zone}
          style={{
            aspectRatio: `${HIDDEN_ZONE_WIDTH} / ${HIDDEN_ZONE_DEPTH}`,
            width: fitHeight ? `min(100%, ${(fitHeight * HIDDEN_ZONE_WIDTH) / HIDDEN_ZONE_DEPTH}px)` : '100%',
          }}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(ZONE_DRAG)) {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }
          }}
          onDrop={drop}
        >
          {!pieces.length && (
            <Text size="sm" c="dimmed" className={styles.empty}>
              Right-click a piece in your hand and choose Move to hidden zone.
            </Text>
          )}
          {!!width &&
            pieces.map((piece) => {
              const footprint = hiddenZoneFootprint(piece);
              const pieceWidth = footprint.width * scale;
              const pieceDepth = footprint.depth * scale;
              const spot = piece.hiddenZone!;
              return (
                <div
                  key={piece.id}
                  className={styles.piece}
                  draggable={enabled}
                  aria-label={`Drag ${pieceName(piece)} in hidden zone`}
                  role="button"
                  tabIndex={0}
                  style={{
                    left: spot.x * width - pieceWidth / 2,
                    top: spot.y * HIDDEN_ZONE_DEPTH * scale - pieceDepth / 2,
                    width: pieceWidth,
                    height: pieceDepth,
                  }}
                  onDragStart={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    grab.current = {
                      dx: event.clientX - bounds.left - bounds.width / 2,
                      dy: event.clientY - bounds.top - bounds.height / 2,
                    };
                    event.dataTransfer.setData('application/dune-hand', piece.id);
                    event.dataTransfer.setData(ZONE_DRAG, piece.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setDragImage(
                      event.currentTarget,
                      event.clientX - bounds.left,
                      event.clientY - bounds.top
                    );
                  }}
                  onDragEnd={() => {
                    grab.current = null;
                  }}
                  onContextMenu={(event) => setMenu(handMenuAnchor(event, piece.id))}
                >
                  <PieceImage piece={piece} width={pieceWidth} height={pieceDepth} />
                </div>
              );
            })}
        </div>
      </div>
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
