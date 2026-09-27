import { BOARD_RIM_SURFACE_Y, surfaceHeightAt, TABLE_VISIBLE_RADIUS } from '@shared/play/tableGeometry';
import { PLAYER_RING_RADIUS } from '@shared/play/tableSettings';

/*
 * The Foil cannons celebration (#1038): thin circular foil discs stream from the winning players' slots for sixteen seconds, tumble, bounce, and settle into piles on the board and the pieces.
 * Piles stay until cleared, and a later stream lands on top of them.
 * This file is the simulation alone; `FoilConfetti` draws it.
 */

export const CONFETTI_STREAM_SECONDS = 16;
const DISCS_PER_SECOND_PER_SLOT = 80;
/* Enough for every slot of the largest table to stream once in full; beyond it the oldest discs are reused. */
const CONFETTI_CAPACITY = 24_000;

export const DISC_RADIUS = 0.045;
export const DISC_THICKNESS = 0.004;

const GRAVITY = 9.8;
const HORIZONTAL_DRAG = 0.9;
const FALLING_DRAG = 1.7;
const BOUNCE_SPEED = 0.9;
const BOUNCE_RESTITUTION = 0.35;
const MAX_BOUNCES = 2;
const LOST_BELOW_Y = -1.5;
const LOST_BEYOND_RADIUS = TABLE_VISIBLE_RADIUS + 3;

/* The pile grid: a square over the visible table, one height per cell. */
const GRID_CELL = 0.06;
const GRID_HALF = TABLE_VISIBLE_RADIUS + GRID_CELL;
const GRID_SIZE = Math.ceil((GRID_HALF * 2) / GRID_CELL);

export const FOIL_COLORS = ['#f4cf6a', '#dfe3ea', '#e9a1b6', '#7ed6cb', '#b79cf2', '#f2a45a'] as const;

const FREE = 0;
const AIRBORNE = 1;
const SETTLED = 2;

/** Something discs can land on beyond the board, a game piece's top: whether a point is over it, and how high it stands. */
export type ConfettiSupport = {
  top: number;
  contains(x: number, z: number): boolean;
};

type Stream = { angles: readonly number[]; elapsed: number; owed: number };

/** A small seeded generator, so a test sees the same stream twice. */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export class ConfettiField {
  readonly capacity: number;
  /** How many instances are in use, always the first `count`. */
  count = 0;
  readonly position: Float32Array;
  readonly velocity: Float32Array;
  /** Orientation as a quaternion, x y z w. */
  readonly rotation: Float32Array;
  readonly spin: Float32Array;
  readonly state: Uint8Array;
  readonly bounces: Uint8Array;
  readonly color: Uint8Array;
  /** Indices whose drawn transform changed since the last `takeChanged`. */
  private changed = new Set<number>();
  private next = 0;
  private streams: Stream[] = [];
  private piles = new Float32Array(GRID_SIZE * GRID_SIZE);
  private random: () => number;

  constructor(capacity = CONFETTI_CAPACITY, seed = Math.floor(Math.random() * 4_294_967_296)) {
    this.capacity = capacity;
    this.position = new Float32Array(capacity * 3);
    this.velocity = new Float32Array(capacity * 3);
    this.rotation = new Float32Array(capacity * 4);
    this.spin = new Float32Array(capacity * 3);
    this.state = new Uint8Array(capacity);
    this.bounces = new Uint8Array(capacity);
    this.color = new Uint8Array(capacity);
    this.random = seededRandom(seed);
  }

  /** Starts a stream from the slots at these table angles, `elapsed` seconds into it for a viewer who arrives late. */
  launch(angles: readonly number[], elapsed = 0) {
    if (angles.length > 0 && elapsed < CONFETTI_STREAM_SECONDS) {
      this.streams.push({ angles, elapsed: Math.max(0, elapsed), owed: 0 });
    }
  }

  /** Stops every stream and removes every disc, airborne or settled. */
  clear() {
    this.streams = [];
    this.state.fill(FREE);
    this.piles.fill(0);
    this.count = 0;
    this.next = 0;
    this.changed.clear();
  }

  /** Whether anything still moves: a stream emitting or a disc in the air. */
  get active() {
    return this.streams.length > 0 || this.airborne > 0;
  }

  get airborne() {
    let total = 0;
    for (let index = 0; index < this.count; index++) {
      if (this.state[index] === AIRBORNE) {
        total++;
      }
    }
    return total;
  }

  get settled() {
    let total = 0;
    for (let index = 0; index < this.count; index++) {
      if (this.state[index] === SETTLED) {
        total++;
      }
    }
    return total;
  }

  isVisible(index: number) {
    return this.state[index] !== FREE;
  }

  /** The indices to redraw, emptied by reading. */
  takeChanged(): Set<number> {
    const changed = this.changed;
    this.changed = new Set();
    return changed;
  }

  step(seconds: number, supports: readonly ConfettiSupport[] = []) {
    this.emit(seconds);
    for (let index = 0; index < this.count; index++) {
      if (this.state[index] === AIRBORNE) {
        this.move(index, seconds, supports);
      }
    }
  }

  private emit(seconds: number) {
    for (const stream of this.streams) {
      const emitting = Math.min(seconds, CONFETTI_STREAM_SECONDS - stream.elapsed);
      stream.elapsed += seconds;
      stream.owed += emitting * DISCS_PER_SECOND_PER_SLOT;
      const discs = Math.floor(stream.owed);
      stream.owed -= discs;
      for (let disc = 0; disc < discs; disc++) {
        for (const angle of stream.angles) {
          this.spawn(angle);
        }
      }
    }
    this.streams = this.streams.filter((stream) => stream.elapsed < CONFETTI_STREAM_SECONDS);
  }

  private spawn(angle: number) {
    const random = this.random;
    const index = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.max(this.count, index + 1);
    const p = index * 3;
    const q = index * 4;
    /* The cannon's mouth sits just inside the slot, aimed across the board with some spread. */
    this.position[p] = Math.cos(angle) * (PLAYER_RING_RADIUS - 0.1);
    this.position[p + 1] = BOARD_RIM_SURFACE_Y + 0.08;
    this.position[p + 2] = Math.sin(angle) * (PLAYER_RING_RADIUS - 0.1);
    const heading = angle + Math.PI + (random() - 0.5) * 1.3;
    const speed = 1.8 + random() * 5.4;
    this.velocity[p] = Math.cos(heading) * speed;
    this.velocity[p + 1] = 4.4 + random() * 2.8;
    this.velocity[p + 2] = Math.sin(heading) * speed;
    const [x, y, z, w] = randomQuaternion(random);
    this.rotation[q] = x;
    this.rotation[q + 1] = y;
    this.rotation[q + 2] = z;
    this.rotation[q + 3] = w;
    for (let axis = 0; axis < 3; axis++) {
      this.spin[p + axis] = (random() - 0.5) * 22;
    }
    this.state[index] = AIRBORNE;
    this.bounces[index] = 0;
    this.color[index] = Math.floor(random() * FOIL_COLORS.length);
    this.changed.add(index);
  }

  private move(index: number, seconds: number, supports: readonly ConfettiSupport[]) {
    const p = index * 3;
    const velocity = this.velocity;
    const position = this.position;
    velocity[p + 1] -= GRAVITY * seconds;
    const horizontal = Math.exp(-HORIZONTAL_DRAG * seconds);
    velocity[p] *= horizontal;
    velocity[p + 2] *= horizontal;
    /* Foil falls slowly: it flutters toward a low terminal speed on the way down. */
    if (velocity[p + 1] < 0) {
      velocity[p + 1] *= Math.exp(-FALLING_DRAG * seconds);
    }
    position[p] += velocity[p] * seconds;
    position[p + 1] += velocity[p + 1] * seconds;
    position[p + 2] += velocity[p + 2] * seconds;
    this.turn(index, seconds);
    this.changed.add(index);

    const x = position[p];
    const z = position[p + 2];
    if (position[p + 1] < LOST_BELOW_Y || Math.hypot(x, z) > LOST_BEYOND_RADIUS) {
      this.state[index] = FREE;
      return;
    }
    const floor = this.supportAt(x, z, supports);
    if (floor === null || velocity[p + 1] > 0 || position[p + 1] > floor + DISC_THICKNESS / 2) {
      return;
    }
    if (-velocity[p + 1]! > BOUNCE_SPEED && this.bounces[index]! < MAX_BOUNCES) {
      this.bounces[index] = this.bounces[index]! + 1;
      position[p + 1] = floor + DISC_THICKNESS / 2;
      velocity[p + 1] = -velocity[p + 1] * BOUNCE_RESTITUTION;
      velocity[p] *= 0.5;
      velocity[p + 2] *= 0.5;
      for (let axis = 0; axis < 3; axis++) {
        this.spin[p + axis] = this.spin[p + axis]! * 0.6;
      }
      return;
    }
    this.settle(index, floor);
  }

  private turn(index: number, seconds: number) {
    const p = index * 3;
    const q = index * 4;
    const rotation = this.rotation;
    const [ax, ay, az] = [this.spin[p]! * seconds, this.spin[p + 1]! * seconds, this.spin[p + 2]! * seconds];
    const [x, y, z, w] = [rotation[q]!, rotation[q + 1]!, rotation[q + 2]!, rotation[q + 3]!];
    /* q' = q + ½·ω·q·dt, then normalised: exact enough for tumbling foil. */
    const nx = x + 0.5 * (ax * w + ay * z - az * y);
    const ny = y + 0.5 * (ay * w + az * x - ax * z);
    const nz = z + 0.5 * (az * w + ax * y - ay * x);
    const nw = w - 0.5 * (ax * x + ay * y + az * z);
    const length = Math.hypot(nx, ny, nz, nw) || 1;
    rotation[q] = nx / length;
    rotation[q + 1] = ny / length;
    rotation[q + 2] = nz / length;
    rotation[q + 3] = nw / length;
  }

  private settle(index: number, floor: number) {
    const p = index * 3;
    const q = index * 4;
    const x = this.position[p]!;
    const z = this.position[p + 2]!;
    this.position[p + 1] = floor + DISC_THICKNESS / 2;
    this.velocity.fill(0, p, p + 3);
    this.spin.fill(0, p, p + 3);
    /* A settled disc lies nearly flat, turned any way about the vertical, with the slight tilt of a pile. */
    const yaw = this.random() * Math.PI * 2;
    const tilt = (this.random() - 0.5) * 0.35;
    const [x1, y1, z1, w1] = [Math.sin(tilt / 2), 0, 0, Math.cos(tilt / 2)];
    const [x2, y2, z2, w2] = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
    this.rotation[q] = w2 * x1 + x2 * w1 + y2 * z1 - z2 * y1;
    this.rotation[q + 1] = w2 * y1 - x2 * z1 + y2 * w1 + z2 * x1;
    this.rotation[q + 2] = w2 * z1 + x2 * y1 - y2 * x1 + z2 * w1;
    this.rotation[q + 3] = w2 * w1 - x2 * x1 - y2 * y1 - z2 * z1;
    this.state[index] = SETTLED;
    this.deposit(x, z, floor + DISC_THICKNESS);
  }

  /** Where a disc over this point comes to rest, or null where there is nothing under it. */
  supportAt(x: number, z: number, supports: readonly ConfettiSupport[] = []): number | null {
    if (Math.hypot(x, z) > TABLE_VISIBLE_RADIUS) {
      return null;
    }
    let height = surfaceHeightAt([x, 0, z]);
    for (const support of supports) {
      if (support.top > height && support.contains(x, z)) {
        height = support.top;
      }
    }
    const cell = gridCell(x, z);
    return cell === null ? height : Math.max(height, this.piles[cell]!);
  }

  /* A settled disc raises its cell to its own top, and its neighbours a little, so piles slope instead of forming towers. */
  private deposit(x: number, z: number, top: number) {
    const column = Math.floor((x + GRID_HALF) / GRID_CELL);
    const row = Math.floor((z + GRID_HALF) / GRID_CELL);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = column + dx;
        const r = row + dz;
        if (c < 0 || r < 0 || c >= GRID_SIZE || r >= GRID_SIZE) {
          continue;
        }
        const cell = r * GRID_SIZE + c;
        const raised = dx === 0 && dz === 0 ? top : top - DISC_THICKNESS * 1.5;
        this.piles[cell] = Math.max(this.piles[cell]!, raised);
      }
    }
  }
}

function gridCell(x: number, z: number): number | null {
  const column = Math.floor((x + GRID_HALF) / GRID_CELL);
  const row = Math.floor((z + GRID_HALF) / GRID_CELL);
  if (column < 0 || row < 0 || column >= GRID_SIZE || row >= GRID_SIZE) {
    return null;
  }
  return row * GRID_SIZE + column;
}

function randomQuaternion(random: () => number): [number, number, number, number] {
  const u = random();
  const v = random() * Math.PI * 2;
  const w = random() * Math.PI * 2;
  const a = Math.sqrt(1 - u);
  const b = Math.sqrt(u);
  return [a * Math.sin(v), a * Math.cos(v), b * Math.sin(w), b * Math.cos(w)];
}
