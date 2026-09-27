import { BOARD_SURFACE_Y } from '@shared/play/tableGeometry';
import { tableSeatAngles } from '@shared/play/tableSettings';
import { describe, expect, it } from 'vitest';

import { CONFETTI_STREAM_SECONDS, ConfettiField, DISC_THICKNESS } from './confettiSimulation';

const FRAME = 1 / 60;

function run(field: ConfettiField, seconds: number, supports: Parameters<ConfettiField['step']>[1] = []) {
  for (let elapsed = 0; elapsed < seconds; elapsed += FRAME) {
    field.step(FRAME, supports);
  }
}

describe('ConfettiField', () => {
  it('streams 80 discs a second from every slot for sixteen seconds, then settles', () => {
    const field = new ConfettiField(10_000, 1);
    const angles = tableSeatAngles(6).slice(0, 2);
    field.launch(angles);
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
    const field = new ConfettiField(10_000, 2);
    field.launch([0], CONFETTI_STREAM_SECONDS - 1);
    run(field, 3);
    expect(field.count).toBeGreaterThanOrEqual(78);
    expect(field.count).toBeLessThanOrEqual(80);
    const late = new ConfettiField(100, 2);
    late.launch([0], CONFETTI_STREAM_SECONDS);
    expect(late.active).toBe(false);
  });

  it('lands on the board, on pieces, and on earlier piles', () => {
    const field = new ConfettiField(100, 3);
    expect(field.supportAt(0, 0)).toBeCloseTo(BOARD_SURFACE_Y);
    const piece = {
      top: 0.5,
      contains: (x: number, z: number) => Math.hypot(x, z) < 0.3,
    };
    expect(field.supportAt(0.1, 0, [piece])).toBe(0.5);
    expect(field.supportAt(1, 0, [piece])).toBeCloseTo(BOARD_SURFACE_Y);
    expect(field.supportAt(20, 0)).toBeNull();

    const angles = tableSeatAngles(4);
    const piles = new ConfettiField(20_000, 4);
    piles.launch(angles);
    run(piles, CONFETTI_STREAM_SECONDS + 6);
    const firstHeight = highestSettled(piles);
    piles.launch(angles);
    run(piles, CONFETTI_STREAM_SECONDS + 6);
    expect(highestSettled(piles)).toBeGreaterThan(firstHeight);
    expect(firstHeight).toBeGreaterThan(BOARD_SURFACE_Y + DISC_THICKNESS);
  });

  it('stops a stream and clears every disc', () => {
    const field = new ConfettiField(1000, 5);
    field.launch([0, Math.PI]);
    run(field, 2);
    expect(field.count).toBeGreaterThan(0);
    field.clear();
    expect(field.count).toBe(0);
    expect(field.active).toBe(false);
    run(field, 1);
    expect(field.count).toBe(0);
    expect(field.supportAt(0, 0)).toBeCloseTo(BOARD_SURFACE_Y);
  });

  it('reuses the oldest discs once full', () => {
    const field = new ConfettiField(100, 6);
    field.launch([0]);
    run(field, 3);
    expect(field.count).toBe(100);
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
