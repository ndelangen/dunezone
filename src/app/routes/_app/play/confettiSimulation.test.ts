import { BOARD_SURFACE_Y } from '@shared/play/tableGeometry';
import { tableSeatAngles } from '@shared/play/tableSettings';
import { describe, expect, it } from 'vitest';

import { CONFETTI_STREAM_SECONDS, ConfettiField, DISC_THICKNESS } from './confettiSimulation';
import type { ConfettiSupport } from './confettiSimulation';

const FRAME = 1 / 60;

function run(field: ConfettiField, seconds: number, supports: ConfettiSupport[] = []) {
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    field.step({ seconds: FRAME, supports });
  }
}

describe('ConfettiField', () => {
  it('streams 80 discs a second from every slot for sixteen seconds, then settles', () => {
    const field = new ConfettiField({ capacity: 10_000, seed: 1 });
    const angles = tableSeatAngles(6).slice(0, 2);
    field.launch({ angles });
    run(field, 1);
    expect(field.count).toBeGreaterThanOrEqual(158);
    expect(field.count).toBeLessThanOrEqual(162);
    run(field, CONFETTI_STREAM_SECONDS - 1 + 0.2);
    const emitted = field.count;
    expect(emitted).toBeGreaterThanOrEqual(2 * 80 * CONFETTI_STREAM_SECONDS - 4);
    expect(emitted).toBeLessThanOrEqual(2 * 80 * CONFETTI_STREAM_SECONDS);
    run(field, 6);
    expect(field.count).toBe(emitted);
    expect(field.active).toBe(false);
    /* Nearly every disc lands on the table rather than flying off it. */
    expect(field.settled).toBeGreaterThan(emitted * 0.95);
  });

  it('joins a stream part way for a viewer who arrives late', () => {
    const field = new ConfettiField({ capacity: 10_000, seed: 2 });
    field.launch({ angles: [0], elapsed: CONFETTI_STREAM_SECONDS - 1 });
    run(field, 3);
    expect(field.count).toBeGreaterThanOrEqual(78);
    expect(field.count).toBeLessThanOrEqual(80);
    const late = new ConfettiField({ capacity: 100, seed: 2 });
    late.launch({ angles: [0], elapsed: CONFETTI_STREAM_SECONDS });
    expect(late.active).toBe(false);
  });

  it('lands on the board, on pieces, and on earlier piles', () => {
    const field = new ConfettiField({ capacity: 100, seed: 3 });
    expect(field.supportAt({ x: 0, z: 0 })).toBeCloseTo(BOARD_SURFACE_Y);
    const piece = {
      x: 0,
      z: 0,
      reach: 0.3,
      top: 0.5,
      contains: (x: number, z: number) => Math.hypot(x, z) < 0.3,
    };
    expect(field.supportAt({ x: 0.1, z: 0 }, [piece])).toBe(0.5);
    expect(field.supportAt({ x: 1, z: 0 }, [piece])).toBeCloseTo(BOARD_SURFACE_Y);
    expect(field.supportAt({ x: 20, z: 0 })).toBeNull();
    /* A disc that drifts in low, beside the piece, stays on the board instead of jumping onto its top. */
    expect(field.supportAt({ x: 0.1, z: 0 }, [piece], 0.2)).toBeCloseTo(BOARD_SURFACE_Y);

    const angles = tableSeatAngles(4);
    const piles = new ConfettiField({ capacity: 20_000, seed: 4 });
    piles.launch({ angles });
    run(piles, CONFETTI_STREAM_SECONDS + 6);
    const firstHeight = highestSettled(piles);
    piles.launch({ angles });
    run(piles, CONFETTI_STREAM_SECONDS + 6);
    expect(highestSettled(piles)).toBeGreaterThan(firstHeight);
    expect(firstHeight).toBeGreaterThan(BOARD_SURFACE_Y + DISC_THICKNESS);
  });

  it('stops a stream and clears every disc', () => {
    const field = new ConfettiField({ capacity: 1000, seed: 5 });
    field.launch({ angles: [0, Math.PI] });
    run(field, 2);
    expect(field.count).toBeGreaterThan(0);
    field.clear();
    expect(field.count).toBe(0);
    expect(field.active).toBe(false);
    run(field, 1);
    expect(field.count).toBe(0);
    expect(field.supportAt({ x: 0, z: 0 })).toBeCloseTo(BOARD_SURFACE_Y);
  });

  it('keeps the stream on real time when frames are slow', () => {
    const field = new ConfettiField({ capacity: 10_000, seed: 7 });
    field.launch({ angles: [0] });
    for (let step = 0; step < CONFETTI_STREAM_SECONDS * 10; step++) {
      field.step({ seconds: 0.1 });
    }
    expect(field.count).toBeGreaterThanOrEqual(80 * CONFETTI_STREAM_SECONDS - 2);
    field.step({ seconds: 0.1 });
    expect(field.count).toBeLessThanOrEqual(80 * CONFETTI_STREAM_SECONDS);
  });

  it('reuses the oldest discs once full', () => {
    const field = new ConfettiField({ capacity: 100, seed: 6 });
    field.launch({ angles: [0] });
    run(field, 3);
    expect(field.count).toBe(100);
  });

  it('takes a reused disc back out of its pile', () => {
    const field = new ConfettiField({ capacity: 1, seed: 8 });
    /* A stream with one disc left to fire, so the only slot settles before anything reuses it. */
    const oneDisc = { angles: [0], elapsed: CONFETTI_STREAM_SECONDS - 0.015 };
    field.launch(oneDisc);
    run(field, 6);
    expect(field.settled).toBe(1);
    const landed = { x: field.position[0]!, z: field.position[2]! };
    const bare = field.supportAt(landed)! - DISC_THICKNESS;
    field.launch(oneDisc);
    field.step({ seconds: FRAME });
    expect(field.airborne).toBe(1);
    expect(field.supportAt(landed)).toBeCloseTo(bare, 6);
  });
});

function highestSettled(field: ConfettiField) {
  let highest = -Infinity;
  for (let index = 0; index < field.count; index++) {
    if (field.isVisible(index)) {
      highest = Math.max(highest, field.position[index * 3 + 1]!);
    }
  }
  return highest;
}
