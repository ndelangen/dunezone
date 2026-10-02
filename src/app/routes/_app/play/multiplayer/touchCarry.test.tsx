/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { initialSnapshot } from '@shared/play/commands';
import { cleanup, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vitest';

import { PointerSession } from '../PointerSession';
import { PointerSessionContext } from '../PointerSessionContext';
import { HandControls } from './BattleControls';
import type { TableProjection, TableSession } from './TableSession';
import { startTouchCarry } from './touchCarry';

/* The hand renders outside the canvas; the scene pieces BattleControls also exports cannot load in jsdom. */
vi.mock('@react-three/drei/webgpu', () => ({ Html: () => null }));
vi.mock('@react-three/fiber/webgpu', () => ({ useFrame: vi.fn(), useThree: vi.fn() }));

window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
  cleanup();
});

function pointer(type: string, x: number, pointerType: string) {
  const event = Object.assign(new MouseEvent(type, { clientX: x, clientY: 10, button: 0, bubbles: true }), {
    pointerId: 7,
    pointerType,
  });
  return event;
}

function boundSession() {
  const session = new PointerSession();
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  canvas.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 100, height: 100 });
  const controls = {
    canHandleTable: true,
    hasDraft: false,
    piece: () => undefined,
    point: () => null,
    isPublicPoint: () => true,
    beginGesture: vi.fn(),
    updateGesture: vi.fn(),
    finishGesture: vi.fn(),
    cancelDraft: vi.fn(),
    publishPointer: vi.fn(),
    onActiveChange: vi.fn(),
  };
  stops.push(session.bind({ events: window, canvas, read: () => controls }));
  const receiver = vi.fn();
  stops.push(session.receive(receiver));
  return { session, receiver };
}

function renderHand(session: PointerSession) {
  const piece = initialSnapshot().table.pieces[0];
  const table = {
    canHandleTable: true,
    snapshot: { ...initialSnapshot(), stage: 'playing' },
    state: { selectedPieceId: null },
  } as unknown as TableProjection;
  const client = { command: vi.fn() } as unknown as TableSession;
  render(
    <MantineProvider theme={appContentTheme}>
      <PointerSessionContext value={session}>
        <HandControls client={client} table={table} hand={[piece]} />
      </PointerSessionContext>
    </MantineProvider>
  );
  return piece;
}

test('a finger on a hand piece carries it onto the table as the same hand parcel a mouse drop reads', () => {
  const { session, receiver } = boundSession();
  const piece = renderHand(session);
  const button = screen.getByRole('button', { name: /from hand/ });
  button.dispatchEvent(pointer('pointerdown', 20, 'touch'));
  expect(session.busy).toBe(true);
  expect(document.querySelector('[data-touch-carry-ghost]')).not.toBeNull();
  window.dispatchEvent(pointer('pointerup', 50, 'touch'));
  expect(receiver).toHaveBeenCalledExactlyOnceWith({ type: 'application/dune-hand', data: piece.id }, 50, 10);
  expect(document.querySelector('[data-touch-carry-ghost]')).toBeNull();
});

test('a mouse press on a hand piece leaves the HTML5 drag alone', () => {
  const { session } = boundSession();
  renderHand(session);
  const button = screen.getByRole('button', { name: /from hand/ });
  button.dispatchEvent(pointer('pointerdown', 20, 'mouse'));
  expect(session.busy).toBe(false);
  expect(button.getAttribute('draggable')).toBe('true');
});

test('a touch carry that the session refuses leaves no ghost behind', () => {
  const session = new PointerSession();
  const source = document.createElement('button');
  document.body.append(source);
  const press = { pointerId: 1, pointerType: 'touch', button: 0, clientX: 5, clientY: 5, timeStamp: 0 };
  expect(startTouchCarry(session, press, source, { type: 'application/dune-battle', data: 'marker' })).toBe(false);
  expect(document.querySelector('[data-touch-carry-ghost]')).toBeNull();
  source.remove();
});

test('the ghost follows the finger centred under it', () => {
  const { session } = boundSession();
  const source = document.createElement('button');
  source.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 40, height: 20 });
  document.body.append(source);
  const press = { pointerId: 7, pointerType: 'touch', button: 0, clientX: 5, clientY: 5, timeStamp: 0 };
  expect(startTouchCarry(session, press, source, { type: 'application/dune-battle', data: 'marker' })).toBe(true);
  window.dispatchEvent(pointer('pointermove', 60, 'touch'));
  const ghost = document.querySelector<HTMLElement>('[data-touch-carry-ghost]');
  expect(ghost?.style.transform).toBe('translate(40px, 0px)');
  expect(ghost?.style.pointerEvents).toBe('none');
  session.cancel();
  expect(document.querySelector('[data-touch-carry-ghost]')).toBeNull();
  source.remove();
});
