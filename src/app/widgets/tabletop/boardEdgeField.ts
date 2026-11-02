import { CENTER, RADIUS } from '@shared/boards/geometry';
import type { Board } from '@shared/boards/schema';
import { boardTerritories } from '@shared/boards/territories';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three';

/*
 * How far each point of the board lies from the nearest border, so a skin's patterns can follow the map:
 * red is the distance to a border between two terrain types (sand meeting rock), green to any territory border.
 * Both are in board units, capped at EDGE_FIELD_REACH and stored as 0..1; the board's rim is not a border.
 * The field is drawn once per retained board definition and shared by every material that skins it.
 */

const SIZE = 512;
const EDGE_FIELD_REACH = 0.4;

const cache = new WeakMap<Board, DataTexture>();

/** Scratch rows for the distance transform, reused for every row and column of one field. */
type Rows = Readonly<{ f: Float64Array; d: Float64Array; v: Int32Array; z: Float64Array }>;

const rowsOf = (): Rows => ({
  f: new Float64Array(SIZE),
  d: new Float64Array(SIZE),
  v: new Int32Array(SIZE),
  z: new Float64Array(SIZE + 1),
});

/* Where the parabola rooted at q crosses the one rooted at v[k]. */
const crossing = ({ f, v }: Rows, q: number, k: number) =>
  (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);

/** Builds the lower envelope of the parabolas rooted at each sample. */
function lowerEnvelope(rows: Rows): void {
  const { v, z } = rows;
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < SIZE; q++) {
    let s = crossing(rows, q, k);
    while (s <= z[k]) {
      k--;
      s = crossing(rows, q, k);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
}

/** One row's squared distance transform (Felzenszwalb and Huttenlocher), from rows.f into rows.d. */
function transform1d(rows: Rows): void {
  lowerEnvelope(rows);
  const { f, d, v, z } = rows;
  let k = 0;
  for (let q = 0; q < SIZE; q++) {
    while (z[k + 1] < q) {
      k++;
    }
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Runs the 1D transform down every column (step SIZE) or along every row (step 1) of the grid, in place. */
function transformLines(grid: Float64Array, rows: Rows, along: 'columns' | 'rows'): void {
  const [step, stride] = along === 'columns' ? [SIZE, 1] : [1, SIZE];
  for (let line = 0; line < SIZE; line++) {
    const start = line * stride;
    for (let i = 0; i < SIZE; i++) {
      rows.f[i] = grid[start + i * step];
    }
    transform1d(rows);
    for (let i = 0; i < SIZE; i++) {
      grid[start + i * step] = rows.d[i];
    }
  }
}

/** Euclidean distance, in pixels, from each pixel to the nearest pixel marked as a border. */
function distanceField(border: Uint8Array): Float32Array {
  const grid = Float64Array.from(border, (marked) => (marked ? 0 : 1e12));
  const rows = rowsOf();
  transformLines(grid, rows, 'columns');
  transformLines(grid, rows, 'rows');
  return Float32Array.from(grid, Math.sqrt);
}

/** Paints each territory in its own colour, label n as rgb(n & 255, n >> 8, 0), and reads the pixels back. */
function paintTerritories(faces: ReturnType<typeof boardTerritories>): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('The board edge field needs a 2D canvas');
  }
  const scale = SIZE / (RADIUS * 2);
  context.setTransform(scale, 0, 0, scale, -(CENTER[0] - RADIUS) * scale, -(CENTER[1] - RADIUS) * scale);
  faces.forEach((face, index) => {
    const label = index + 1;
    context.fillStyle = `rgb(${label & 255},${(label >> 8) & 255},0)`;
    context.fill(new Path2D(face.path), 'evenodd');
  });
  return context.getImageData(0, 0, SIZE, SIZE).data;
}

/* A pixel's territory: 0 outside every territory, -1 for antialiased pixels that match no territory's colour. */
function labelOf(pixels: Uint8ClampedArray, i: number, count: number): number {
  const alpha = pixels[i * 4 + 3];
  if (alpha === 0) {
    return 0;
  }
  const label = pixels[i * 4] | (pixels[i * 4 + 1] << 8);
  return alpha === 255 && pixels[i * 4 + 2] === 0 && label <= count ? label : -1;
}

/* The territory of the first labelled pixel beside i, or -1 when none is labelled yet. */
function neighbourLabel(labels: Int32Array, i: number): number {
  const x = i % SIZE;
  const y = Math.floor(i / SIZE);
  const neighbours = [
    x > 0 ? i - 1 : -1,
    x < SIZE - 1 ? i + 1 : -1,
    y > 0 ? i - SIZE : -1,
    y < SIZE - 1 ? i + SIZE : -1,
  ];
  const found = neighbours.find((n) => n >= 0 && labels[n] > 0);
  return found === undefined ? -1 : labels[found];
}

/** Each pixel's territory, 0 outside every territory; antialiased seams take a neighbour's territory. */
function territoryLabels(board: Board): { labels: Int32Array; faces: ReturnType<typeof boardTerritories> } {
  const faces = boardTerritories(board);
  const pixels = paintTerritories(faces);
  const labels = Int32Array.from({ length: SIZE * SIZE }, (_, i) => labelOf(pixels, i, faces.length));
  for (let pass = 0; pass < 3; pass++) {
    labels.forEach((label, i) => {
      if (label === -1) {
        labels[i] = neighbourLabel(labels, i);
      }
    });
  }
  return { labels, faces };
}

/** Marks the pixels where two territories meet, and among them those where two terrain types meet. */
function borders(board: Board): { typeBorder: Uint8Array; territoryBorder: Uint8Array } {
  const { labels, faces } = territoryLabels(board);
  const typeOf = (label: number) => board.properties[faces[label - 1].key]?.type;
  const typeBorder = new Uint8Array(SIZE * SIZE);
  const territoryBorder = new Uint8Array(SIZE * SIZE);
  const mark = (i: number, n: number) => {
    /* The rim and unfilled seams are no border; only two territories meeting are. */
    if (n < 0 || labels[i] <= 0 || labels[n] <= 0 || labels[n] === labels[i]) {
      return;
    }
    territoryBorder[i] = territoryBorder[n] = 1;
    if (typeOf(labels[n]) !== typeOf(labels[i])) {
      typeBorder[i] = typeBorder[n] = 1;
    }
  };
  for (let i = 0; i < SIZE * SIZE; i++) {
    mark(i, i % SIZE < SIZE - 1 ? i + 1 : -1);
    mark(i, i < SIZE * (SIZE - 1) ? i + SIZE : -1);
  }
  return { typeBorder, territoryBorder };
}

/** The board's edge field as a texture, sampled at (x, z) / (2 × board radius) + 0.5 in the board's own plane. */
export function boardEdgeField(board: Board): DataTexture {
  const cached = cache.get(board);
  if (cached) {
    return cached;
  }
  const { typeBorder, territoryBorder } = borders(board);
  const pixelSize = (2 * BOARD_RADIUS) / SIZE;
  const toByte = (distance: number) => Math.round(Math.min(1, (distance * pixelSize) / EDGE_FIELD_REACH) * 255);
  const typeDistance = distanceField(typeBorder);
  const territoryDistance = distanceField(territoryBorder);
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    data[i * 4] = toByte(typeDistance[i]);
    data[i * 4 + 1] = toByte(territoryDistance[i]);
    data[i * 4 + 3] = 255;
  }
  const texture = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  cache.set(board, texture);
  return texture;
}
