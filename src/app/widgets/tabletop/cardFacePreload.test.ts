// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { usePreloadedCardFaces } from './cardFacePreload';

/* Every image the preload starts, by the address it asked for. */
function trackImages() {
  const started: string[] = [];
  vi.spyOn(HTMLImageElement.prototype, 'src', 'set').mockImplementation(function (this: HTMLImageElement, value) {
    started.push(value);
    this.dispatchEvent(new Event('load'));
  });
  return started;
}

afterEach(() => {
  vi.restoreAllMocks();
});

test('a face already held by an open table is not fetched again', () => {
  const started = trackImages();
  const faces = ['https://dune.zone/a.jpg', 'https://dune.zone/b.jpg'];
  const first = renderHook(() => usePreloadedCardFaces(faces));
  const second = renderHook(() => usePreloadedCardFaces(faces));
  expect(started).toEqual(faces);
  second.unmount();
  first.unmount();
});

test('a game left keeps its faces until a table asks for others', () => {
  const started = trackImages();
  const left = ['https://dune.zone/c.jpg'];
  const other = ['https://dune.zone/d.jpg'];
  renderHook(() => usePreloadedCardFaces(left)).unmount();
  /* Going back to the game just left finds its faces. */
  renderHook(() => usePreloadedCardFaces(left)).unmount();
  expect(started).toEqual(left);
  /* Another game's table lets them go, so going back asks for them again. */
  renderHook(() => usePreloadedCardFaces(other)).unmount();
  renderHook(() => usePreloadedCardFaces(left)).unmount();
  expect(started).toEqual([...left, ...other, ...left]);
});

test('two open tables keep the faces of both', () => {
  const started = trackImages();
  const first = ['https://dune.zone/e.jpg'];
  const second = ['https://dune.zone/f.jpg'];
  const one = renderHook(() => usePreloadedCardFaces(first));
  const two = renderHook(() => usePreloadedCardFaces(second));
  renderHook(() => usePreloadedCardFaces(first)).unmount();
  expect(started).toEqual([...first, ...second]);
  one.unmount();
  two.unmount();
});
