// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vite-plus/test';

import { setTerritoryBrush } from '../../widgets/tabletop/territoryBrush';
import type { CompassPlayer } from './compassTable';
import type { CompassPanel } from './panels';
import { useOpenPanels } from './useOpenPanels';
import { RememberedContext } from './useRemembered';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

const player: CompassPlayer = {
  seat: 'seat-4',
  name: 'Ridwan',
  factionName: 'Fremen',
  token: null,
  unread: 0,
  own: false,
  canConverse: true,
  attention: false,
  ally: false,
};
const panel = (key: string, extra: Partial<CompassPanel> = {}): CompassPanel => ({
  key,
  label: key,
  group: 'Game',
  topic: 'game',
  content: null,
  layout: 'stack',
  ...extra,
});
const panels = [panel('hand'), panel('battle'), panel('player:seat-4', { player })];

test('showing a panel opens it in the centre, and asking again closes it', () => {
  const { result } = renderHook(() => useOpenPanels(panels, false));
  act(() => result.current.show('hand'));
  expect(result.current.centre).toEqual({ key: 'hand' });
  act(() => result.current.show('hand'));
  expect(result.current.centre).toBeNull();
  act(() => result.current.show('player:seat-4'));
  expect(result.current.centre).toEqual({ key: 'player:seat-4' });
});

test('an event opens its panel in a free slot, beside the board, and lights it up when it is there already', () => {
  const { result } = renderHook(() => useOpenPanels(panels, false));
  act(() => result.current.reveal('battle'));
  expect(result.current.slots.left).toEqual({ key: 'battle' });
  expect(result.current.centre).toBeNull();
  expect(result.current.flash).toEqual({ side: 'left', at: 1 });
  act(() => result.current.reveal('battle'));
  expect(result.current.slots).toEqual({ left: { key: 'battle' }, right: null });
  expect(result.current.flash).toEqual({ side: 'left', at: 2 });
  act(() => result.current.reveal('player:seat-4'));
  expect(result.current.slots.right).toEqual({ key: 'player:seat-4' });
});

test('with both slots taken, an event opens its panel in the centre, and one already there stays', () => {
  const { result } = renderHook(() => useOpenPanels(panels, false));
  act(() => result.current.show('hand'));
  act(() => result.current.pin('left'));
  act(() => result.current.show('player:seat-4'));
  act(() => result.current.pin('right'));
  act(() => result.current.reveal('battle'));
  expect(result.current.centre).toEqual({ key: 'battle' });
  act(() => result.current.reveal('battle'));
  expect(result.current.centre).toEqual({ key: 'battle' });
  expect(result.current.slots.left?.key).toBe('hand');
});

test('a slot holding a panel the table no longer has, such as the last battle, is free for the next event', () => {
  const { result, rerender } = renderHook(({ list }) => useOpenPanels(list, false), {
    initialProps: { list: panels },
  });
  act(() => result.current.reveal('battle'));
  act(() => result.current.show('hand'));
  act(() => result.current.pin('right'));
  rerender({ list: [panel('hand'), panel('setup'), panel('player:seat-4', { player })] });
  act(() => result.current.reveal('setup'));
  expect(result.current.slots).toEqual({
    left: { key: 'setup' },
    right: { key: 'hand' },
  });
});

test('[ and ] pin the centre panel bottom left and right, but not from a text field or with a modifier', () => {
  const key = (key: string, target: EventTarget = document.body, extra: KeyboardEventInit = {}) =>
    act(
      () => void target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }))
    );
  const field = document.body.appendChild(document.createElement('textarea'));
  const { result } = renderHook(() => useOpenPanels(panels, false));
  act(() => result.current.show('hand'));
  key('[', field);
  key('[', document.body, { metaKey: true });
  expect(result.current.centre?.key).toBe('hand');
  key('[');
  expect(result.current.slots.left?.key).toBe('hand');
  act(() => result.current.show('battle'));
  key(']');
  expect(result.current.slots).toEqual({
    left: { key: 'hand' },
    right: { key: 'battle' },
  });
  expect(result.current.centre).toBeNull();
});

test('pinning replaces what the slot held, and unpinning empties it', () => {
  const { result } = renderHook(() => useOpenPanels(panels, false));
  act(() => result.current.show('hand'));
  act(() => result.current.pin('right'));
  act(() => result.current.show('battle'));
  act(() => result.current.pin('right'));
  expect(result.current.slots.right?.key).toBe('battle');
  act(() => result.current.unpin('right'));
  expect(result.current.slots.right).toBeNull();
});

test('a press on the table blurs the focused field before the centre panel closes, so its draft commits', () => {
  const { result } = renderHook(() => useOpenPanels(panels, false));
  act(() => result.current.show('battle'));
  const field = document.body.appendChild(document.createElement('input'));
  const table = document.body.appendChild(document.createElement('canvas'));
  let openAtBlur: unknown;
  field.addEventListener('blur', () => {
    openAtBlur = result.current.centre;
  });
  field.focus();
  act(() => {
    table.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
  });
  expect(openAtBlur).toEqual({ key: 'battle' });
  expect(document.activeElement).not.toBe(field);
  expect(result.current.centre).toBeNull();
  field.remove();
  table.remove();
});

test('a select’s shut list, mounted but hidden, leaves Escape to close the panel, and an open list takes it', () => {
  const list = document.body.appendChild(document.createElement('div'));
  list.setAttribute('role', 'listbox');
  list.style.display = 'none';
  const escape = () => act(() => void globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  const { result } = renderHook(() => useOpenPanels(panels, false));
  act(() => result.current.show('hand'));
  list.style.display = '';
  escape();
  expect(result.current.centre?.key).toBe('hand');
  list.style.display = 'none';
  escape();
  expect(result.current.centre).toBeNull();
});

test('Escape in a field with an edit to drop keeps the panel; once the edit is gone, Escape closes it', () => {
  const field = document.body.appendChild(document.createElement('input'));
  field.dataset.takesEscape = '';
  const escape = () =>
    act(() => void field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  const { result } = renderHook(() => useOpenPanels(panels, false));
  act(() => result.current.show('hand'));
  escape();
  expect(result.current.centre?.key).toBe('hand');
  delete field.dataset.takesEscape;
  escape();
  expect(result.current.centre).toBeNull();
  field.remove();
});

test('Escape while painting territories stops the paintbrush and keeps the panel; the next Escape closes it', () => {
  const { result } = renderHook(() => useOpenPanels(panels, false));
  act(() => result.current.show('battle'));
  act(() => setTerritoryBrush({ tintId: 'tint-1', paint: () => {} }));
  const escape = () => act(() => void globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  escape();
  expect(result.current.centre).toEqual({ key: 'battle' });
  escape();
  expect(result.current.centre).toBeNull();
});

test('Escape that stops painting keeps the panel even when the paintbrush hears it first', () => {
  const { result, rerender } = renderHook(({ compassOpen }) => useOpenPanels(panels, compassOpen), {
    initialProps: { compassOpen: false },
  });
  act(() => result.current.show('battle'));
  act(() => setTerritoryBrush({ tintId: 'tint-1', paint: () => {} }));
  /* Opening and closing the compass registers the panel's Escape listener again, after the paintbrush's. */
  rerender({ compassOpen: true });
  rerender({ compassOpen: false });
  const escape = () => act(() => void globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  escape();
  expect(result.current.centre).toEqual({ key: 'battle' });
  escape();
  expect(result.current.centre).toBeNull();
});

test('a press on the table while painting territories keeps the panel that holds the brush', () => {
  const { result } = renderHook(() => useOpenPanels(panels, false));
  act(() => result.current.show('battle'));
  act(() => setTerritoryBrush({ tintId: 'tint-1', paint: () => {} }));
  const table = document.body.appendChild(document.createElement('canvas'));
  const press = () =>
    act(() => void table.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })));
  press();
  expect(result.current.centre).toEqual({ key: 'battle' });
  act(() => setTerritoryBrush(null));
  press();
  expect(result.current.centre).toBeNull();
  table.remove();
});

test('revealing a pinned panel lights its slot and leaves the centre panel open', () => {
  const { result } = renderHook(() => useOpenPanels(panels, false));
  act(() => result.current.show('hand'));
  act(() => result.current.pin('left'));
  act(() => result.current.show('player:seat-4'));
  act(() => result.current.reveal('hand'));
  expect(result.current.centre).toEqual({ key: 'player:seat-4' });
  expect(result.current.flash).toEqual({ side: 'left', at: 1 });
});

test('the faction information opens on the seat asked for, switches seats in place, and asking again closes it', () => {
  const list = [...panels, panel('faction-info')];
  const { result } = renderHook(() => useOpenPanels(list, false));
  act(() => result.current.show('faction-info', 'seat-4'));
  expect(result.current.centre).toEqual({ key: 'faction-info', seat: 'seat-4' });
  act(() => result.current.show('faction-info', 'seat-2'));
  expect(result.current.centre).toEqual({ key: 'faction-info', seat: 'seat-2' });
  act(() => result.current.showSeat('centre', 'faction-info', 'seat-1'));
  act(() => result.current.pin('left'));
  act(() => result.current.show('faction-info', 'seat-4'));
  expect(result.current.slots.left).toEqual({ key: 'faction-info', seat: 'seat-4' });
  expect(result.current.flash).toEqual({ side: 'left', at: 1 });
  act(() => result.current.unpin('left'));
  act(() => result.current.show('faction-info', 'seat-4'));
  act(() => result.current.show('faction-info', 'seat-4'));
  expect(result.current.centre).toBeNull();
});

test('a tutorial remembers nothing: it neither reads nor overwrites the game layout', () => {
  localStorage.setItem('dunezone-compass:slots', JSON.stringify({ left: { key: 'hand' }, right: null }));
  const { result } = renderHook(() => useOpenPanels(panels, false), {
    wrapper: ({ children }) => <RememberedContext value={false}>{children}</RememberedContext>,
  });
  expect(result.current.slots.left).toBeNull();
  act(() => result.current.show('battle'));
  act(() => result.current.pin('right'));
  expect(JSON.parse(localStorage.getItem('dunezone-compass:slots') ?? 'null')).toEqual({
    left: { key: 'hand' },
    right: null,
  });
});

test("a chat's faction token brings the faction information up on its seat without closing the chat", () => {
  const list = [...panels, panel('faction-info')];
  const { result } = renderHook(() => useOpenPanels(list, false));
  act(() => result.current.show('player:seat-4'));
  act(() => result.current.reveal('faction-info', 'seat-4'));
  expect(result.current.centre).toEqual({ key: 'player:seat-4' });
  expect(result.current.slots.left).toEqual({ key: 'faction-info', seat: 'seat-4' });
  expect(result.current.isOpen('faction-info', 'seat-4')).toBe(true);
  expect(result.current.isOpen('faction-info', 'seat-2')).toBe(false);
  act(() => result.current.reveal('faction-info', 'seat-2'));
  expect(result.current.slots.left).toEqual({ key: 'faction-info', seat: 'seat-2' });
  expect(result.current.centre).toEqual({ key: 'player:seat-4' });
});

test('the panel last brought up or pressed is in front, where the centre reaches over a slot', () => {
  const list = [...panels, panel('faction-info')];
  const { result } = renderHook(() => useOpenPanels(list, false));
  act(() => result.current.show('player:seat-4'));
  expect(result.current.front).toBe('centre');
  act(() => result.current.reveal('faction-info', 'seat-4'));
  expect(result.current.front).toBe('left');
  act(() => result.current.raise('centre'));
  expect(result.current.front).toBe('centre');
  act(() => result.current.reveal('faction-info', 'seat-2'));
  expect(result.current.front).toBe('left');
});

test('suspended controls keep their docked and floating panels through keys and board presses', () => {
  const canvas = document.body.appendChild(document.createElement('canvas'));
  const { result, rerender } = renderHook(({ active }) => useOpenPanels(panels, false, active), {
    initialProps: { active: true },
  });
  act(() => result.current.show('hand'));
  act(() => result.current.pin('left'));
  act(() => result.current.show('battle'));
  const before = { centre: result.current.centre, slots: result.current.slots };
  rerender({ active: false });
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
  });
  expect({ centre: result.current.centre, slots: result.current.slots }).toEqual(before);
  rerender({ active: true });
  expect({ centre: result.current.centre, slots: result.current.slots }).toEqual(before);
  act(() => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true })));
  expect(result.current.slots).toEqual({ left: { key: 'hand' }, right: { key: 'battle' } });
  expect(result.current.centre).toBeNull();
});
