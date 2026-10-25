/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { DialRow } from './parts';

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

function Row({ onChange }: { onChange: (value: number) => void }) {
  const [value, setValue] = useState(2);
  return (
    <MantineProvider theme={appContentTheme} forceColorScheme="dark">
      <DialRow
        name="Fedaykin"
        value={value}
        max={20}
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
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: '7' } });
  fireEvent.wheel(field, { deltaY: -1 });
  expect(onChange).toHaveBeenLastCalledWith(8);
  fireEvent.blur(field);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(field).toHaveProperty('value', '8');
});
