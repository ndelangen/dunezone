/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { emptyBattlePlan } from '@shared/play/battle';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { AdjustButton, DialRow } from './parts';

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
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(cleanup);

function Row({
  onChange,
  start = 2,
  max = 20,
  stops,
}: {
  onChange: (value: number) => void;
  start?: number;
  max?: number;
  stops?: number[];
}) {
  const [value, setValue] = useState(start);
  return (
    <MantineProvider theme={appContentTheme} forceColorScheme="dark">
      <DialRow
        name="Fedaykin"
        value={value}
        max={max}
        stops={stops}
        disabled={false}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
    </MantineProvider>
  );
}

test('an arrow key steps from the typed count, and the field shows what was sent', () => {
  const onChange = vi.fn();
  render(<Row onChange={onChange} />);
  const field = screen.getByRole('textbox', { name: 'Fedaykin' });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: '7' } });
  fireEvent.keyDown(field, { key: 'ArrowUp' });
  expect(onChange).toHaveBeenLastCalledWith(8);
  expect(field).toHaveProperty('value', '8');
  fireEvent.blur(field);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(field).toHaveProperty('value', '8');
});

test('the scroll wheel steps from the typed count too', () => {
  const onChange = vi.fn();
  render(<Row onChange={onChange} />);
  const field = screen.getByRole('textbox', { name: 'Fedaykin' });
  fireEvent.wheel(field, { deltaY: -1 });
  /* Scrolling past a stepper the player is not typing in leaves it alone. */
  expect(onChange).not.toHaveBeenCalled();
  field.focus();
  fireEvent.change(field, { target: { value: '7' } });
  fireEvent.wheel(field, { deltaY: -1 });
  expect(onChange).toHaveBeenLastCalledWith(8);
  fireEvent.blur(field);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(field).toHaveProperty('value', '8');
});

test('a typed adjustment stays as entered, while − and + move by halves', async () => {
  const onEdit = vi.fn();
  render(
    <MantineProvider theme={appContentTheme} forceColorScheme="dark">
      <AdjustButton plan={{ ...emptyBattlePlan([]), pieces: [] }} disabled={false} onEdit={onEdit} />
    </MantineProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: /^Adjust the strength by hand/ }));
  const field = await screen.findByRole('textbox', { name: 'Adjustment' });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: '-0.25' } });
  fireEvent.blur(field);
  expect(onEdit).toHaveBeenLastCalledWith({ adjustment: -0.25 });
  /* The popover's closing transition hides it from the accessibility tree in jsdom once the field blurs. */
  fireEvent.click(screen.getByRole('button', { name: 'More: Adjustment', hidden: true }));
  expect(onEdit).toHaveBeenLastCalledWith({ adjustment: 0.5 });
});

test('dragging the slider out and back sends the step it comes back to', async () => {
  const onChange = vi.fn();
  const { container } = render(<Row onChange={onChange} />);
  const track = container.querySelector<HTMLElement>('.mantine-Slider-trackContainer')!;
  /* A 200 px track over 0 to 20, so every 10 px is one troop. */
  track.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 200,
    height: 10,
    right: 200,
    bottom: 10,
    x: 0,
    y: 0,
    toJSON() {},
  });
  /* The slider reads the pointer on the next frame and reports the end of a drag a tick after letting go. */
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 40)));
  fireEvent.mouseDown(track, { clientX: 20, clientY: 5 });
  await settle();
  fireEvent.mouseMove(document, { clientX: 50, clientY: 5 });
  await settle();
  fireEvent.mouseMove(document, { clientX: 20, clientY: 5 });
  await settle();
  fireEvent.mouseUp(document, { clientX: 20, clientY: 5 });
  await settle();
  expect(onChange.mock.calls.map(([value]) => value)).toEqual([5, 2]);
  expect(screen.getByRole('textbox', { name: 'Fedaykin' })).toHaveProperty('value', '2');
});

test('a slider with stops sends only stops as it is dragged, and the one it is let go on', async () => {
  const onChange = vi.fn();
  const { container } = render(<Row onChange={onChange} start={0} max={8} stops={[0, 4, 8]} />);
  const track = container.querySelector<HTMLElement>('.mantine-Slider-trackContainer')!;
  /* A 200 px track over 0 to 8, so every 25 px is one unit of spice. */
  track.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 200,
    height: 10,
    right: 200,
    bottom: 10,
    x: 0,
    y: 0,
    toJSON() {},
  });
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 40)));
  fireEvent.mouseDown(track, { clientX: 25, clientY: 5 });
  await settle();
  fireEvent.mouseMove(document, { clientX: 175, clientY: 5 });
  await settle();
  fireEvent.mouseMove(document, { clientX: 125, clientY: 5 });
  await settle();
  fireEvent.mouseUp(document, { clientX: 125, clientY: 5 });
  await settle();
  expect(onChange.mock.calls.map(([value]) => value)).toEqual([8, 4]);
  expect(screen.getByRole('textbox', { name: 'Fedaykin' })).toHaveProperty('value', '4');
});

test('a steady drag up through troops that cost 3 spice each never falls back to none', async () => {
  const onChange = vi.fn();
  const { container } = render(<Row onChange={onChange} start={0} max={6} stops={[0, 3, 6]} />);
  const track = container.querySelector<HTMLElement>('.mantine-Slider-trackContainer')!;
  /* A 300 px track over 0 to 6, so every 50 px is one spice. */
  track.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 300,
    height: 10,
    right: 300,
    bottom: 10,
    x: 0,
    y: 0,
    toJSON() {},
  });
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 40)));
  fireEvent.mouseDown(track, { clientX: 50, clientY: 5 });
  await settle();
  for (const clientX of [100, 150, 100]) {
    fireEvent.mouseMove(document, { clientX, clientY: 5 });
    await settle();
  }
  fireEvent.mouseUp(document, { clientX: 100, clientY: 5 });
  await settle();
  expect(onChange.mock.calls.map(([value]) => value)).toEqual([3]);
  expect(screen.getByRole('textbox', { name: 'Fedaykin' })).toHaveProperty('value', '3');
});
