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

/* The slider reads the pointer on the next frame and reports the end of a drag a tick after letting go. */
const settle = (ms = 40) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

/*
 * Drags the row's slider, its track `width` px wide, through each pointer position in turn, `pause` ms apart, and lets go
 * on the last; answers what the row sent and the count it shows afterwards.
 */
async function drag(
  row: { start?: number; max?: number; stops?: number[] },
  { width = 200, at, pause = 40 }: { width?: number; at: number[]; pause?: number }
) {
  const onChange = vi.fn();
  const { container } = render(<Row onChange={onChange} {...row} />);
  const track = container.querySelector<HTMLElement>('.mantine-Slider-trackContainer')!;
  track.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width, height: 10 });
  const [first, ...rest] = at;
  fireEvent.mouseDown(track, { clientX: first, clientY: 5 });
  await settle(pause);
  for (const clientX of rest) {
    fireEvent.mouseMove(document, { clientX, clientY: 5 });
    await settle(pause);
  }
  fireEvent.mouseUp(document, { clientX: at.at(-1), clientY: 5 });
  await settle(200);
  return {
    sent: onChange.mock.calls.map(([value]) => value as number),
    shown: screen.getByRole('textbox', { name: 'Fedaykin' }),
  };
}

test('dragging the slider out and back sends the step it comes back to', async () => {
  /* Over 0 to 20, every 10 px is one troop. */
  const { sent, shown } = await drag({}, { at: [20, 50, 20] });
  expect(sent).toEqual([5, 2]);
  expect(shown).toHaveProperty('value', '2');
});

test('a slider with stops sends only stops as it is dragged, and the one it is let go on', async () => {
  /* Over 0 to 8, every 25 px is one unit of spice. */
  const { sent, shown } = await drag({ start: 0, max: 8, stops: [0, 4, 8] }, { at: [25, 175, 125] });
  expect(sent).toEqual([8, 4]);
  expect(shown).toHaveProperty('value', '4');
});

test('a steady drag up through troops that cost 3 spice each never falls back to none', async () => {
  /* Over 0 to 6 on 300 px, every 50 px is one spice. */
  const { sent, shown } = await drag({ start: 0, max: 6, stops: [0, 3, 6] }, { width: 300, at: [50, 100, 150, 100] });
  expect(sent).toEqual([3]);
  expect(shown).toHaveProperty('value', '3');
});

test('a fast scrub sends a few live steps, not every one, and still ends where the thumb is let go', async () => {
  /* Back and forth across the track, a step every 20 ms. */
  const { sent, shown } = await drag({}, { at: [20, 40, 80, 120, 160, 200, 160, 120, 80, 40, 80, 120, 70], pause: 20 });
  /* About 260 ms of scrubbing allows three live steps; the release sends the endpoint. */
  expect(sent.length).toBeLessThanOrEqual(5);
  expect(sent.at(-1)).toBe(7);
  expect(shown).toHaveProperty('value', '7');
});
