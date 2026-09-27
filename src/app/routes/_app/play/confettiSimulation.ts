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
/* Physics moves in steps no longer than this, so a slow frame does not throw discs through the board. */
const MAX_PHYSICS_STEP = 1 / 30;
/* A frame longer than this, such as a backgrounded tab's first one back, emits only this much; the stream's clock still keeps real time. */
const MAX_EMIT_STEP = 0.25;

/* The pile grid: a square over the visible table, holding how much foil has piled up in each cell above what lies under it. */
const GRID_CELL = 0.06;
const GRID_HALF = TABLE_VISIBLE_RADIUS + GRID_CELL;
const GRID_SIZE = Math.ceil((GRID_HALF * 2) / GRID_CELL);

export const FOIL_COLORS = ['#f4cf6a', '#dfe3ea', '#e9a1b6', '#7ed6cb', '#b79cf2', '#f2a45a'] as const;

const FREE = 0;
const AIRBORNE = 1;
const SETTLED = 2;

/**
 * Something discs can land on beyond the board, a game piece's top.
 * `reach` bounds its footprint around `x`, `z`, so most discs skip the exact test.
 */
export type ConfettiSupport = Readonly<{
  x: number;
  z: number;
  reach: number;
  top: number;
  contains(x: number, z: number): boolean;
}>;

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

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

function gridIndex(column: number, row: number): number | null {
  const inside = column >= 0 && row >= 0 && column < GRID_SIZE && row < GRID_SIZE;
  return inside ? row * GRID_SIZE + column : null;
}

function gridCoordinates(x: number, z: number): [column: number, row: number] {
  return [Math.floor((x + GRID_HALF) / GRID_CELL), Math.floor((z + GRID_HALF) / GRID_CELL)];
}

/* A support catches a disc only over its footprint, and only when the disc came down onto it rather than drifting in from the side. */
function catches(support: ConfettiSupport, x: number, z: number, fromY: number): boolean {
  const dx = x - support.x;
  const dz = z - support.z;
  return fromY >= support.top && dx * dx + dz * dz <= support.reach * support.reach && support.contains(x, z);
}

export class ConfettiField {
  readonly capacity: number;
  /** How many instances are in use, always the first `count`. */
  count = 0;
  /** How many discs are in the air. */
  airborne = 0;
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
  private spawned = false;
  private next = 0;
  private streams: Stream[] = [];
  private piles = new Float32Array(GRID_SIZE * GRID_SIZE);
  private random: () => number;

  constructor(capacity = CONFETTI_CAPACITY, seed = randomSeed()) {
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
    this.airborne = 0;
    this.next = 0;
    this.changed.clear();
  }

  /** Whether anything still moves: a stream emitting or a disc in the air. */
  get active() {
    return this.streams.length > 0 || this.airborne > 0;
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

  /** Whether any disc was spawned, and so took a colour, since the last call. */
  takeSpawned(): boolean {
    const spawned = this.spawned;
    this.spawned = false;
    return spawned;
  }

  /** Advances by a frame of real time: the streams keep that time, and the physics follows in short steps. */
  step(seconds: number, supports: readonly ConfettiSupport[] = []) {
    this.emit(seconds);
    const moving = Math.min(seconds, MAX_EMIT_STEP);
    const steps = Math.ceil(moving / MAX_PHYSICS_STEP);
    for (let step = 0; step < steps; step++) {
      this.moveAll(moving / steps, supports);
    }
  }

  private moveAll(seconds: number, supports: readonly ConfettiSupport[]) {
    for (let index = 0; index < this.count; index++) {
      if (this.state[index] === AIRBORNE) {
        this.move(index, seconds, supports);
      }
    }
  }

  private emit(seconds: number) {
    for (const stream of this.streams) {
      const remaining = CONFETTI_STREAM_SECONDS - stream.elapsed;
      stream.elapsed += seconds;
      stream.owed += Math.min(seconds, remaining, MAX_EMIT_STEP) * DISCS_PER_SECOND_PER_SLOT;
      const discs = Math.floor(stream.owed);
      stream.owed -= discs;
      for (let disc = 0; disc < discs; disc++) {
        stream.angles.forEach((angle) => this.spawn(angle));
      }
    }
    this.streams = this.streams.filter((stream) => stream.elapsed < CONFETTI_STREAM_SECONDS);
  }

  private spawn(angle: number) {
    const random = this.random;
    const index = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.max(this.count, index + 1);
    if (this.state[index] !== AIRBORNE) {
      this.airborne++;
    }
    const p = index * 3;
    /* The cannon's mouth sits just inside the slot, aimed across the board with some spread. */
    this.position[p] = Math.cos(angle) * (PLAYER_RING_RADIUS - 0.1);
    this.position[p + 1] = BOARD_RIM_SURFACE_Y + 0.08;
    this.position[p + 2] = Math.sin(angle) * (PLAYER_RING_RADIUS - 0.1);
    const heading = angle + Math.PI + (random() - 0.5) * 1.3;
    const speed = 1.8 + random() * 5.4;
    this.velocity[p] = Math.cos(heading) * speed;
    this.velocity[p + 1] = 4.4 + random() * 2.8;
    this.velocity[p + 2] = Math.sin(heading) * speed;
    this.rotation.set(randomQuaternion(random), index * 4);
    for (let axis = 0; axis < 3; axis++) {
      this.spin[p + axis] = (random() - 0.5) * 22;
    }
    this.state[index] = AIRBORNE;
    this.bounces[index] = 0;
    this.color[index] = Math.floor(random() * FOIL_COLORS.length);
    this.changed.add(index);
    this.spawned = true;
  }

  private move(index: number, seconds: number, supports: readonly ConfettiSupport[]) {
    const p = index * 3;
    const fromY = this.position[p + 1]!;
    this.fly(p, seconds);
    this.turn(index, seconds);
    this.changed.add(index);
    const x = this.position[p]!;
    const z = this.position[p + 2]!;
    if (this.position[p + 1]! < LOST_BELOW_Y || Math.hypot(x, z) > LOST_BEYOND_RADIUS) {
      this.state[index] = FREE;
      this.airborne--;
      return;
    }
    const floor = this.supportAt(x, z, supports, fromY);
    if (floor !== null && this.touches(p, floor)) {
      this.land(index, floor);
    }
  }

  private fly(p: number, seconds: number) {
    const velocity = this.velocity;
    velocity[p + 1] -= GRAVITY * seconds;
    const horizontal = Math.exp(-HORIZONTAL_DRAG * seconds);
    velocity[p] *= horizontal;
    velocity[p + 2] *= horizontal;
    /* Foil falls slowly: it flutters toward a low terminal speed on the way down. */
    if (velocity[p + 1]! < 0) {
      velocity[p + 1] *= Math.exp(-FALLING_DRAG * seconds);
    }
    for (let axis = 0; axis < 3; axis++) {
      this.position[p + axis] += velocity[p + axis]! * seconds;
    }
  }

  private touches(p: number, floor: number): boolean {
    return this.velocity[p + 1]! <= 0 && this.position[p + 1]! <= floor + DISC_THICKNESS / 2;
  }

  private land(index: number, floor: number) {
    const p = index * 3;
    if (-this.velocity[p + 1]! <= BOUNCE_SPEED || this.bounces[index]! >= MAX_BOUNCES) {
      this.settle(index, floor);
      return;
    }
    this.bounces[index] = this.bounces[index]! + 1;
    this.position[p + 1] = floor + DISC_THICKNESS / 2;
    this.velocity[p + 1] = -this.velocity[p + 1]! * BOUNCE_RESTITUTION;
    this.velocity[p] *= 0.5;
    this.velocity[p + 2] *= 0.5;
    for (let axis = 0; axis < 3; axis++) {
      this.spin[p + axis] = this.spin[p + axis]! * 0.6;
    }
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
    rotation.set([nx / length, ny / length, nz / length, nw / length], q);
  }

  private settle(index: number, floor: number) {
    const p = index * 3;
    this.position[p + 1] = floor + DISC_THICKNESS / 2;
    this.velocity.fill(0, p, p + 3);
    this.spin.fill(0, p, p + 3);
    /* A settled disc lies nearly flat, turned any way about the vertical, with the slight tilt of a pile. */
    const yaw = this.random() * Math.PI * 2;
    const tilt = (this.random() - 0.5) * 0.35;
    const [sx, cx] = [Math.sin(tilt / 2), Math.cos(tilt / 2)];
    const [sy, cy] = [Math.sin(yaw / 2), Math.cos(yaw / 2)];
    /* The yaw applied after the tilt: q = yaw · tilt. */
    this.rotation.set([cy * sx, sy * cx, -sy * sx, cy * cx], index * 4);
    this.state[index] = SETTLED;
    this.airborne--;
    this.deposit(this.position[p]!, this.position[p + 2]!);
  }

  /** Where a disc over this point comes to rest, or null where there is nothing under it. */
  supportAt(x: number, z: number, supports: readonly ConfettiSupport[] = [], fromY = Infinity): number | null {
    if (Math.hypot(x, z) > TABLE_VISIBLE_RADIUS) {
      return null;
    }
    let base = surfaceHeightAt([x, 0, z]);
    for (const support of supports) {
      if (support.top > base && catches(support, x, z, fromY)) {
        base = support.top;
      }
    }
    const cell = gridIndex(...gridCoordinates(x, z));
    return base + (cell === null ? 0 : this.piles[cell]!);
  }

  /*
   * A settled disc adds its thickness to its cell, and lifts its neighbours to just below that, so piles slope instead of forming towers.
   * The pile is kept as depth above whatever is underneath, so once a piece moves away later foil lands on the board rather than at the piece's old height.
   */
  private deposit(x: number, z: number) {
    const [column, row] = gridCoordinates(x, z);
    const centre = gridIndex(column, row);
    if (centre === null) {
      return;
    }
    const depth = this.piles[centre]! + DISC_THICKNESS;
    this.piles[centre] = depth;
    for (const [dx, dz] of NEIGHBOURS) {
      const cell = gridIndex(column + dx, row + dz);
      if (cell !== null) {
        this.piles[cell] = Math.max(this.piles[cell]!, depth - DISC_THICKNESS * 1.5);
      }
    }
  }
}

const NEIGHBOURS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

function randomQuaternion(random: () => number): [number, number, number, number] {
  const u = random();
  const v = random() * Math.PI * 2;
  const w = random() * Math.PI * 2;
  const a = Math.sqrt(1 - u);
  const b = Math.sqrt(u);
  return [a * Math.sin(v), a * Math.cos(v), b * Math.sin(w), b * Math.cos(w)];
}
