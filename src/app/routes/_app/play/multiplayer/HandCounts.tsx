/* @jsxImportSource @app/widgets/tabletop/three-jsx */
import { factionTokenFaceUp, factionTokenStackKey } from '@shared/play/factionToken';
import { stormOrder } from '@shared/play/stormSector';
import { CARD_SLOT_OUTER_SIZE, cardBaySlotPositions } from '@shared/play/tableFurnitureLayout';
import { useEffect, useMemo, useState } from 'react';
import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';

import { loadTableLabelFont, TABLE_LABEL_FONT_FAMILY } from '@app/widgets/tabletop/TableLabel';

import type { TableProjection } from '../../../../db/tabletop/TableSession';

type Variant = '1' | '2' | '3' | '4';

/* PROTOTYPE: the look is picked from the page address while Norbert compares them. */
function variant(): Variant {
  const picked = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('ledger');
  return picked === '2' || picked === '3' || picked === '4' ? picked : '1';
}

/* The left card bay's empty slot (outer column, bottom row): the counts fill exactly the slot a card well would. */
const [, SURFACE_Y] = cardBaySlotPositions('left')[0]!;
const SPOT: [number, number, number] = [-6.72, SURFACE_Y + 0.004, 1.32];
const WIDTH = CARD_SLOT_OUTER_SIZE.width;
const DEPTH = CARD_SLOT_OUTER_SIZE.depth;
const PX = 1024 / DEPTH;
const GOLD = '#d2ae68';

type Row = { id: string; count: number; out: boolean; front: string | null; color: string; initials: string };

/** The columns that make each cell largest for a cell of this width-to-height ratio; six fills two by three. */
function gridFor(count: number, aspect: number, width: number, height: number) {
  let best = { cols: 1, rows: count, size: 0 };
  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    const size = Math.min(width / cols / aspect, height / rows);
    if (size > best.size + 1e-6) {
      best = { cols, rows, size };
    }
  }
  return best;
}

function loadImage(href: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = href;
  });
}

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
  context.closePath();
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

function drawNumber(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  align: CanvasTextAlign
) {
  context.font = `${size}px "${TABLE_LABEL_FONT_FAMILY}"`;
  context.textAlign = align;
  context.textBaseline = 'middle';
  /* Pressed into the table: a dark lip above and the gold below. */
  context.fillStyle = 'rgba(0, 0, 0, 0.55)';
  context.fillText(text, x, y - size * 0.03);
  context.fillStyle = GOLD;
  context.fillText(text, x, y);
}

function paint(
  canvas: HTMLCanvasElement,
  rows: readonly Row[],
  images: Map<string, HTMLImageElement | null>,
  look: Variant
) {
  const context = canvas.getContext('2d')!;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  let top = 0;
  let left = 0;
  let areaWidth = width;
  let areaHeight = height;
  if (look === '4') {
    /* An engraved frame with a title, inset like the card wells' rims. */
    const inset = width * 0.03;
    context.strokeStyle = GOLD;
    context.globalAlpha = 0.7;
    context.lineWidth = width * 0.012;
    context.beginPath();
    context.roundRect(inset, inset, width - inset * 2, height - inset * 2, width * 0.08);
    context.stroke();
    context.globalAlpha = 1;
    const titleSize = width * 0.085;
    context.font = `${titleSize}px "${TABLE_LABEL_FONT_FAMILY}"`;
    context.fillStyle = GOLD;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('TREACHERY', width / 2, inset + titleSize * 1.1);
    top = inset + titleSize * 2;
    left = inset * 2;
    areaWidth = width - left * 2;
    areaHeight = height - top - inset * 2;
  }
  const aspect = look === '2' ? 0.75 : look === '3' ? 1 : 1.75;
  const { cols, rows: rowCount } = gridFor(rows.length, aspect, areaWidth, areaHeight);
  const cellWidth = areaWidth / cols;
  const cellHeight = areaHeight / rowCount;
  rows.forEach((row, index) => {
    const col = index % cols;
    const line = Math.floor(index / cols);
    /* A short last line is centred. */
    const lineCount = line === rowCount - 1 ? rows.length - line * cols : cols;
    const x = left + (cols - lineCount) * (cellWidth / 2) + col * cellWidth;
    const y = top + line * cellHeight;
    context.save();
    if (row.out) {
      context.filter = 'grayscale(1)';
      context.globalAlpha = 0.4;
    }
    const image = row.front ? (images.get(row.front) ?? null) : null;
    const text = String(row.count);
    if (look === '2') {
      const radius = Math.min(cellWidth * 0.36, cellHeight * 0.27);
      drawLogo(context, row, image, x + cellWidth / 2, y + cellHeight * 0.33, radius);
      drawNumber(context, text, x + cellWidth / 2, y + cellHeight * 0.8, cellHeight * 0.36, 'center');
    } else if (look === '3') {
      const radius = Math.min(cellWidth, cellHeight) * 0.4;
      const cx = x + cellWidth / 2;
      const cy = y + cellHeight / 2;
      drawLogo(context, row, image, cx, cy, radius);
      const stampX = cx + radius * 0.72;
      const stampY = cy + radius * 0.72;
      const stamp = radius * 0.58;
      context.beginPath();
      context.arc(stampX, stampY, stamp, 0, Math.PI * 2);
      context.fillStyle = '#241a16';
      context.fill();
      context.lineWidth = Math.max(2, stamp * 0.12);
      context.strokeStyle = GOLD;
      context.stroke();
      drawNumber(context, text, stampX, stampY + stamp * 0.08, stamp * 1.5, 'center');
    } else {
      const radius = Math.min(cellHeight * 0.4, cellWidth * 0.27);
      const cx = x + cellWidth * 0.08 + radius;
      drawLogo(context, row, image, cx, y + cellHeight / 2, radius);
      drawNumber(context, text, cx + radius * 1.3, y + cellHeight / 2 + radius * 0.08, radius * 2, 'left');
    }
    context.restore();
  });
}

/** Every seated faction's Treachery card count, in storm order, painted into the left card bay's empty slot. */
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
  const look = variant();
  /* PROTOTYPE: `ledgerFactions=18` repeats the seated factions to show a larger table. */
  const demo = Number(typeof location === 'undefined' ? 0 : new URLSearchParams(location.search).get('ledgerFactions'));
  const shown =
    demo > rows.length
      ? Array.from({ length: demo }, (_, index) => ({ ...rows[index % rows.length]!, count: (index * 5) % 9 }))
      : rows;
  const key = JSON.stringify(shown);
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    let live = true;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(WIDTH * PX);
    canvas.height = Math.round(DEPTH * PX);
    const fronts = [...new Set(shown.flatMap((row) => (row.front ? [row.front] : [])))];
    void Promise.all([loadTableLabelFont(), ...fronts.map(loadImage)]).then(([, ...loaded]) => {
      if (!live) {
        return;
      }
      const images = new Map(fronts.map((front, index) => [front, loaded[index] as HTMLImageElement | null]));
      paint(canvas, shown, images, look);
      const next = new CanvasTexture(canvas);
      next.colorSpace = SRGBColorSpace;
      next.anisotropy = 8;
      next.minFilter = LinearMipmapLinearFilter;
      setTexture((previous) => {
        previous?.dispose();
        return next;
      });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the rows' content
  }, [key, look]);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!roster || !counts || !texture) {
    return null;
  }
  return (
    <mesh position={SPOT} rotation={[-Math.PI / 2, 0, 0]} receiveShadow data-hand-counts={look}>
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
