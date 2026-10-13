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

/* Lets the release queued by a commit's effects run. */
const settle = () => Promise.resolve();

/* Opens a table on the faces, lets its effects settle, and closes it. */
async function visit(faces: string[]) {
  const table = renderHook(() => usePreloadedCardFaces(faces));
  await settle();
  table.unmount();
}

test('a game left keeps its faces until a table asks for others', async () => {
  const started = trackImages();
  const left = ['https://dune.zone/c.jpg'];
  const other = ['https://dune.zone/d.jpg'];
  await visit(left);
  /* Going back to the game just left finds its faces. */
  await visit(left);
  expect(started).toEqual(left);
  /* Another game's table lets them go, so going back asks for them again. */
  await visit(other);
  await visit(left);
  expect(started).toEqual([...left, ...other, ...left]);
});

test('two open tables keep the faces of both', async () => {
  const started = trackImages();
  const first = ['https://dune.zone/e.jpg'];
  const second = ['https://dune.zone/f.jpg'];
  const one = renderHook(() => usePreloadedCardFaces(first));
  const two = renderHook(() => usePreloadedCardFaces(second));
  await settle();
  await visit(first);
  expect(started).toEqual([...first, ...second]);
  one.unmount();
  two.unmount();
});

test('tables handed the same faces again in one commit keep them', async () => {
  const started = trackImages();
  const first = 'https://dune.zone/g.jpg';
  const second = 'https://dune.zone/h.jpg';
  /* Each render hands both tables fresh arrays, so React replaces both effects in the same commit. */
  const tables = renderHook(() => {
    usePreloadedCardFaces([first]);
    usePreloadedCardFaces([second]);
  });
  await settle();
  tables.rerender();
  await settle();
  expect(started).toEqual([first, second]);
  tables.unmount();
});

test('a table closed before its release runs still leaves its faces for the next visit', async () => {
  const started = trackImages();
  const faces = ['https://dune.zone/i.jpg'];
  renderHook(() => usePreloadedCardFaces(faces)).unmount();
  await settle();
  await visit(faces);
  expect(started).toEqual(faces);
});
