import { CENTER, RADIUS } from '@shared/boards/geometry';
import type { Board } from '@shared/boards/schema';
import { boardTerritories } from '@shared/boards/territories';
import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three';

/*
 * How far each point of the board lies from the nearest border, so a skin's patterns can follow the map:
 * red is the distance to a border between two terrain types (sand meeting rock), green to any territory border.
 * Both are in board units, capped at EDGE_FIELD_REACH and stored as 0..1; the board's rim is not a border.
 * The field is drawn once per retained board definition and shared by every material that skins it.
 */

const SIZE = 512;
export const EDGE_FIELD_REACH = 0.4;

const cache = new WeakMap<Board, DataTexture>();

/** One row's squared distance transform (Felzenszwalb and Huttenlocher), in place. */
function transform1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) {
      k++;
    }
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Euclidean distance, in pixels, from each pixel to the nearest pixel marked as a border. */
function distanceField(border: Uint8Array): Float32Array {
  const big = 1e12;
  const grid = new Float64Array(SIZE * SIZE);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = border[i] ? 0 : big;
  }
  const f = new Float64Array(SIZE),
    d = new Float64Array(SIZE),
    v = new Int32Array(SIZE),
    z = new Float64Array(SIZE + 1);
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {
      f[y] = grid[y * SIZE + x];
    }
    transform1d(f, SIZE, d, v, z);
    for (let y = 0; y < SIZE; y++) {
      grid[y * SIZE + x] = d[y];
    }
  }
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      f[x] = grid[y * SIZE + x];
    }
    transform1d(f, SIZE, d, v, z);
    for (let x = 0; x < SIZE; x++) {
      out[y * SIZE + x] = Math.sqrt(d[x]);
    }
  }
  return out;
}

/** Each pixel's territory, 0 outside every territory, found by painting each territory in its own colour. */
function territoryLabels(board: Board): { labels: Int32Array; faces: ReturnType<typeof boardTerritories> } {
  const faces = boardTerritories(board);
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
  const pixels = context.getImageData(0, 0, SIZE, SIZE).data;
  /* Antialiased pixels match no territory's colour; -1 marks them until a neighbour fills them in. */
  const labels = new Int32Array(SIZE * SIZE);
  for (let i = 0; i < labels.length; i++) {
    const alpha = pixels[i * 4 + 3];
    const label = pixels[i * 4] | (pixels[i * 4 + 1] << 8);
    labels[i] = alpha === 0 ? 0 : alpha === 255 && pixels[i * 4 + 2] === 0 && label <= faces.length ? label : -1;
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = y * SIZE + x;
        if (labels[i] !== -1) {
          continue;
        }
        const neighbours = [
          x > 0 ? i - 1 : -1,
          x < SIZE - 1 ? i + 1 : -1,
          y > 0 ? i - SIZE : -1,
          y < SIZE - 1 ? i + SIZE : -1,
        ];
        const found = neighbours.find((n) => n >= 0 && labels[n] > 0);
        if (found !== undefined) {
          labels[i] = labels[found];
        }
      }
    }
  }
  return { labels, faces };
}

/** The board's edge field as a texture, sampled at (x, z) / (2 × board radius) + 0.5 in the board's own plane. */
export function boardEdgeField(board: Board): DataTexture {
  const cached = cache.get(board);
  if (cached) {
    return cached;
  }
  const { labels, faces } = territoryLabels(board);
  const typeOf = (label: number) => (label > 0 ? board.properties[faces[label - 1].key]?.type : undefined);
  const typeBorder = new Uint8Array(SIZE * SIZE);
  const territoryBorder = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const here = labels[i];
      if (here <= 0) {
        continue;
      }
      for (const n of [x < SIZE - 1 ? i + 1 : -1, y < SIZE - 1 ? i + SIZE : -1]) {
        /* The rim and unfilled seams are no border; only two territories meeting are. */
        if (n < 0 || labels[n] <= 0 || labels[n] === here) {
          continue;
        }
        territoryBorder[i] = territoryBorder[n] = 1;
        if (typeOf(labels[n]) !== typeOf(here)) {
          typeBorder[i] = typeBorder[n] = 1;
        }
      }
    }
  }
  const pixelSize = (2 * 3.98) / SIZE;
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
