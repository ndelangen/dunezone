/* @vitest-environment jsdom */
import { freshTableState } from '@shared/play/model';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { TableKeyboard } from './TableKeyboard';
import type { DigitSource } from './TableKeyboard';

const stops: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
  vi.useRealTimers();
});

function table(digits: DigitSource) {
  const keyboard = new TableKeyboard();
  const controls = {
    canInteract: true,
    digits,
    state: freshTableState(),
    hoveredPieceId: null,
    deckControls: undefined,
    flipSelected: vi.fn(),
    rotateSelected: vi.fn(),
    spawnSpice: vi.fn(),
    splitSelected: vi.fn(),
    stackSelected: vi.fn(),
    takeAdditionalFromTarget: vi.fn(),
    toggleLockSelected: vi.fn(),
  };
  stops.push(keyboard.bind({ events: window, read: () => controls }));
  return { keyboard, controls };
}

function tap(key: string, code: string, shiftKey = false) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, code, shiftKey }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key, code, shiftKey }));
}

/* Each press over the hovered disc as its layout reports it. */
const PRESSES = [
  ['QWERTY 1', '1', 'Digit1', false],
  ['QWERTY Shift+1, which types !', '!', 'Digit1', true],
  ['AZERTY Shift+&, which types 1', '1', 'Digit1', true],
  ['AZERTY &', '&', 'Digit1', false],
  ['keypad 1', '1', 'Numpad1', false],
] as const;

describe.each([
  ['key', [true, false, true, false, true]],
  ['code', [true, true, true, true, true]],
] as const)('over the hovered spice disc, reading the %s', (digits, spawns) => {
  test.each(
    PRESSES.map(
      ([name, key, code, shift], index) => [name, spawns[index] ? 'one spice' : 'nothing', key, code, shift] as const
    )
  )('%s spawns %s', (_name, spawned, key, code, shift) => {
    const { keyboard, controls } = table(digits);
    keyboard.hoverSupply(true);
    tap(key, code, shift);
    expect(controls.spawnSpice.mock.calls).toEqual(spawned === 'one spice' ? [[1]] : []);
    vi.advanceTimersByTime(1000);
    expect(controls.splitSelected).not.toHaveBeenCalled();
  });
});

/* AZERTY's Shift is often let go before the & key, so the key-up names & and not 1. */
test.each([
  ['key', 1],
  ['code', 0],
] as const)('reading the %s, a tapped Shift+& released Shift first draws %s', (digits, draws) => {
  const { controls } = table(digits);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Digit1', shiftKey: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key: '&', code: 'Digit1' }));
  vi.advanceTimersByTime(1000);
  expect(controls.splitSelected).toHaveBeenCalledTimes(draws);
});
