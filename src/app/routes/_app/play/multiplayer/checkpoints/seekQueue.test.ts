import { expect, test, vi } from 'vite-plus/test';

import { chooseSeek, landSeek, shownStep } from './seekQueue';
import type { SeekState } from './seekQueue';

const IDLE: SeekState = { sent: null, queued: null };

test('a choice made while a seek is in flight waits, and the latest goes once the answer lands', () => {
  const send = vi.fn(() => true);
  let state = chooseSeek(IDLE, 3, 4, send);
  state = chooseSeek(state, 2, 4, send);
  expect(send.mock.calls).toEqual([[3]]);
  expect(shownStep(state, 4)).toBe(2);
  state = landSeek(state, 3, send);
  expect(send.mock.calls).toEqual([[3], [2]]);
  expect(shownStep(state, 3)).toBe(2);
  state = landSeek(state, 2, send);
  expect(state).toEqual(IDLE);
  expect(shownStep(state, 2)).toBe(2);
});

test('choosing back the step in flight drops the waiting choice', () => {
  const send = vi.fn(() => true);
  let state = chooseSeek(IDLE, 3, 4, send);
  state = chooseSeek(state, 2, 4, send);
  state = chooseSeek(state, 3, 4, send);
  expect(shownStep(state, 4)).toBe(3);
  state = landSeek(state, 3, send);
  expect(send.mock.calls).toEqual([[3]]);
  expect(state).toEqual(IDLE);
});

test('a waiting choice the answer already reached is not sent again', () => {
  const send = vi.fn(() => true);
  let state = chooseSeek(IDLE, 3, 4, send);
  state = chooseSeek(state, 2, 4, send);
  state = landSeek(state, 2, send);
  expect(send.mock.calls).toEqual([[3]]);
  expect(state).toEqual(IDLE);
});

test('a seek that could not be sent leaves the table value shown and can be chosen again', () => {
  const send = vi.fn(() => false);
  let state = chooseSeek(IDLE, 3, 4, send);
  expect(state).toEqual(IDLE);
  expect(shownStep(state, 4)).toBe(4);
  state = chooseSeek(state, 3, 4, send);
  expect(send).toHaveBeenCalledTimes(2);
});
