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

test('the faces are let go once the last table closes', () => {
  const started = trackImages();
  const faces = ['https://dune.zone/c.jpg'];
  const first = renderHook(() => usePreloadedCardFaces(faces));
  const second = renderHook(() => usePreloadedCardFaces(faces));
  first.unmount();
  /* Another table still holds the face. */
  renderHook(() => usePreloadedCardFaces(faces)).unmount();
  expect(started).toEqual(faces);
  second.unmount();
  /* No table is open any more, so the next one asks for it again. */
  renderHook(() => usePreloadedCardFaces(faces)).unmount();
  expect(started).toEqual([...faces, ...faces]);
});
