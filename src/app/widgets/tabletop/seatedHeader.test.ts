/* @vitest-environment jsdom */
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { watchTableChrome } from './seatedHeader';

const observers: { callback: () => void; watched: Element[]; disconnected: boolean }[] = [];

class FakeResizeObserver {
  readonly entry: (typeof observers)[number];
  constructor(callback: () => void) {
    this.entry = { callback, watched: [], disconnected: false };
    observers.push(this.entry);
  }
  observe(element: Element) {
    this.entry.watched.push(element);
  }
  disconnect() {
    this.entry.disconnected = true;
  }
}

afterEach(() => {
  observers.splice(0);
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

test('measures again when the canvas or the chrome over it resizes, until stopped', () => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  document.body.innerHTML = `
    <div class="dune-play-shell">
      <div class="seated-header"><span class="seated-chip"></span></div>
      <div class="seated-camera"></div>
      <canvas></canvas>
      <div data-compass-bar></div>
    </div>`;
  const canvas = document.querySelector('canvas')!;
  const onChange = vi.fn();
  const stop = watchTableChrome(canvas, onChange);
  const [observer] = observers;
  expect(observer.watched).toEqual([
    canvas,
    document.querySelector('.seated-header'),
    document.querySelector('.seated-camera'),
    document.querySelector('[data-compass-bar]'),
  ]);
  observer.callback();
  expect(onChange).toHaveBeenCalledTimes(1);
  stop();
  expect(observer.disconnected).toBe(true);
});

test('watches only the canvas outside a seated table', () => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  const canvas = document.createElement('canvas');
  watchTableChrome(canvas, () => {});
  expect(observers[0].watched).toEqual([canvas]);
});
