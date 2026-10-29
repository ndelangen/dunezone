/** @vitest-environment jsdom */

import { freshTableState } from '@shared/play/model';
import type { TablePiece } from '@shared/play/model';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { HandPieceCloseUp } from './PieceCloseUp';

vi.mock('./PieceArtwork', () => ({ PieceArtwork: () => <div /> }));
vi.mock('@ui/content/FormattedText', () => ({
  FormattedTextSource: ({ source }: { source: string }) => <p>{source}</p>,
}));

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function preview() {
  vi.stubGlobal('innerWidth', 1024);
  vi.stubGlobal('innerHeight', 768);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  const piece: TablePiece = {
    ...freshTableState().pieces.find((entry) => entry.id === 'treachery-deck')!,
    items: [{ id: 'prediction-1', faceUp: true, artwork: { type: 'card-prediction', front: '/front', back: '/back' } }],
  };
  const area = document.body.appendChild(document.createElement('div'));
  const result = render(<HandPieceCloseUp area={{ current: area }} piece={piece} />);
  fireEvent.keyDown(window, { key: 'Alt', altKey: true });
  const box = document.querySelector<HTMLElement>('[data-piece-close-up]')!;
  const scale = () => Number(box.style.transform.match(/scale\(([^)]+)\)/)?.[1] ?? 1);
  return { box, scale, unmount: result.unmount };
}

function scroll(deltaY: number, init: WheelEventInit = {}) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, altKey: true, deltaY, ...init });
  document.body.dispatchEvent(event);
  return event;
}

test('Alt scrolling resizes the preview without passing the scroll to the table', () => {
  const { scale } = preview();
  const tableWheel = vi.fn();
  document.body.addEventListener('wheel', tableWheel);
  const before = scale();
  expect(scroll(80).defaultPrevented).toBe(true);
  expect(scale()).toBeGreaterThan(before);
  scroll(-160);
  expect(scale()).toBeLessThan(before);
  expect(tableWheel).not.toHaveBeenCalled();
  document.body.removeEventListener('wheel', tableWheel);
});

test('the whole preview including its description stays inside the viewport after zoom and resize', () => {
  const { box, scale } = preview();
  scroll(100_000);
  expect(600 * scale()).toBeLessThanOrEqual(768 - 24);
  vi.stubGlobal('innerWidth', 240);
  vi.stubGlobal('innerHeight', 320);
  fireEvent(window, new Event('resize'));
  expect(300 * scale()).toBeLessThanOrEqual(240 - 24);
  expect(600 * scale()).toBeLessThanOrEqual(320 - 24);
  expect(box.getAttribute('data-piece-type')).toBe('card-prediction');
  expect(box.getAttribute('data-piece-item')).toBe('prediction-1');
});

test('browser pinch and scrolling after Alt is released are not captured', () => {
  const { scale } = preview();
  const before = scale();
  expect(scroll(80, { ctrlKey: true }).defaultPrevented).toBe(false);
  expect(scale()).toBe(before);
  fireEvent.keyUp(window, { key: 'Alt', altKey: false });
  expect(document.querySelector('[data-piece-close-up]')).toBeNull();
  expect(scroll(80, { altKey: false }).defaultPrevented).toBe(false);
});
