/* @jsxImportSource @app/widgets/tabletop/three-jsx */
import { factionTokenFaceUp, factionTokenStackKey } from '@shared/play/factionToken';
import { handCountGrid } from '@shared/play/handCounts';
import { stormOrder } from '@shared/play/stormSector';
import { CARD_SLOT_OUTER_SIZE, cardBaySlotPositions } from '@shared/play/tableFurnitureLayout';
import { useEffect, useMemo, useState } from 'react';
import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';

import { loadTableLabelFont, TABLE_LABEL_FONT_FAMILY } from '@app/widgets/tabletop/TableLabel';

import type { TableProjection } from '../../../../db/tabletop/TableSession';

/* The left card bay leaves its outer bottom slot empty: the counts fill exactly the space a card well would. */
const [, SURFACE_Y, SLOT_Z] = cardBaySlotPositions('left').at(-1)!;
const [OUTER_X] = cardBaySlotPositions('left')[1]!;
const SPOT: [number, number, number] = [OUTER_X, SURFACE_Y + 0.004, SLOT_Z];
const WIDTH = CARD_SLOT_OUTER_SIZE.width;
const DEPTH = CARD_SLOT_OUTER_SIZE.depth;
/* Texture pixels per table unit. */
const PX = 1024 / DEPTH;
/* The space kept clear around the whole cluster, as a share of the slot's width (Norbert, #1007). */
const PADDING = 0.12;
/* A cell is a logo with its count beside it. */
const CELL_ASPECT = 1.75;
const GOLD = '#d2ae68';

type Row = { id: string; count: number; out: boolean; front: string | null; color: string; initials: string };

function loadImage(href: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = href;
  });
}

/** The faction token's face in a gold ring, or its initials on its colour when the face cannot load. */
function drawLogo(
  context: CanvasRenderingContext2D,
  row: Row,
  image: HTMLImageElement | null,
  cx: number,
  cy: number,
  radius: number
) {
  context.save();
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.clip();
  if (image) {
    context.drawImage(image, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    context.fillStyle = row.color;
    context.fill();
    context.fillStyle = GOLD;
    context.font = `${radius}px "${TABLE_LABEL_FONT_FAMILY}"`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(row.initials, cx, cy);
  }
  context.restore();
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.lineWidth = Math.max(2, radius * 0.06);
  context.strokeStyle = GOLD;
  context.stroke();
}

/** A count pressed into the table: a dark lip above the gold. */
function drawCount(context: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  context.font = `${size}px "${TABLE_LABEL_FONT_FAMILY}"`;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillStyle = 'rgba(0, 0, 0, 0.55)';
  context.fillText(text, x, y - size * 0.03);
  context.fillStyle = GOLD;
  context.fillText(text, x, y);
}

function paint(canvas: HTMLCanvasElement, rows: readonly Row[], images: ReadonlyMap<string, HTMLImageElement | null>) {
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const padding = canvas.width * PADDING;
  const areaWidth = canvas.width - padding * 2;
  const areaHeight = canvas.height - padding * 2;
  const { cols, rows: lines } = handCountGrid(rows.length, CELL_ASPECT, areaWidth, areaHeight);
  const cellWidth = areaWidth / cols;
  const cellHeight = areaHeight / lines;
  rows.forEach((row, index) => {
    const col = index % cols;
    const line = Math.floor(index / cols);
    /* A short last line is centred. */
    const lineCount = line === lines - 1 ? rows.length - line * cols : cols;
    const x = padding + (cols - lineCount) * (cellWidth / 2) + col * cellWidth;
    const cy = padding + line * cellHeight + cellHeight / 2;
    context.save();
    if (row.out) {
      context.filter = 'grayscale(1)';
      context.globalAlpha = 0.4;
    }
    const radius = Math.min(cellHeight * 0.4, cellWidth * 0.27);
    const cx = x + cellWidth * 0.08 + radius;
    drawLogo(context, row, row.front ? (images.get(row.front) ?? null) : null, cx, cy, radius);
    drawCount(context, String(row.count), cx + radius * 1.3, cy + radius * 0.08, radius * 2);
    context.restore();
  });
}

/**
 * Every seated faction's Treachery card count, in storm order, painted into the left card bay's empty slot where bidding is watched (#1007).
 * A faction whose token lies face down sits out the round, so its count is greyed out as the bidder greys it.
 */
export function HandCountsScene({ table }: { table: TableProjection }) {
  const roster = table.snapshot.roster;
  const counts = table.snapshot.handCounts;
  const order = useMemo(() => stormOrder(table.state.stormSectorIndex, roster), [table.state.stormSectorIndex, roster]);
  const rows = useMemo<Row[]>(
    () =>
      order.map((id) => {
        const token = table.state.pieces.find((piece) => piece.stackKey === factionTokenStackKey(id));
        const name = table.state.factionNames[id] ?? id;
        return {
          id,
          count: counts?.[id] ?? 0,
          out: !factionTokenFaceUp(table.state.pieces, id),
          front: token?.items[0]?.artwork?.front ?? null,
          color: token?.color ?? '#3a2a22',
          initials: name.slice(0, 2).toUpperCase(),
        };
      }),
    [order, counts, table.state.pieces, table.state.factionNames]
  );
  /* The pieces change on every move; the texture is painted again only when what it shows changes. */
  const content = JSON.stringify(rows);
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    const shown: Row[] = JSON.parse(content);
    let live = true;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(WIDTH * PX);
    canvas.height = Math.round(DEPTH * PX);
    const fronts = [...new Set(shown.flatMap((row) => (row.front ? [row.front] : [])))];
    void Promise.all([loadTableLabelFont(), ...fronts.map(loadImage)]).then(([, ...loaded]) => {
      if (!live) {
        return;
      }
      paint(canvas, shown, new Map(fronts.map((front, index) => [front, loaded[index] as HTMLImageElement | null])));
      const next = new CanvasTexture(canvas);
      next.colorSpace = SRGBColorSpace;
      next.anisotropy = 8;
      next.minFilter = LinearMipmapLinearFilter;
      setTexture(next);
    });
    return () => {
      live = false;
    };
  }, [content]);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!roster || !counts || !texture) {
    return null;
  }
  return (
    <mesh position={SPOT} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[WIDTH, DEPTH]} />
      <meshStandardMaterial
        map={texture}
        transparent
        alphaTest={0.02}
        depthWrite={false}
        roughness={0.85}
        metalness={0.1}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}
