/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, it, vi } from 'vitest';

import { MemberCountInput } from './MemberCountInput';

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

afterEach(cleanup);

function renderInput(onCommit: (count: number) => void, value = 7) {
  return render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <MemberCountInput label="Copies of Lasgun" value={value} min={1} max={99} disabled={false} onCommit={onCommit} />
    </MantineProvider>
  );
}

it('re-seeds the field when the committed count changes underneath an untouched edit', () => {
  /* The reset happens during render rather than in an effect, so a value arriving from elsewhere is
     never shown stale for a paint first. Nothing else covered this branch. */
  const onCommit = vi.fn();
  const view = renderInput(onCommit, 7);
  const field = () => screen.getByRole('textbox', { name: 'Copies of Lasgun' });
  expect(field()).toHaveProperty('value', '7');

  fireEvent.change(field(), { target: { value: '12' } });
  expect(field()).toHaveProperty('value', '12');

  view.rerender(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <MemberCountInput label="Copies of Lasgun" value={3} min={1} max={99} disabled={false} onCommit={onCommit} />
    </MantineProvider>
  );
  expect(field()).toHaveProperty('value', '3');
  expect(onCommit).not.toHaveBeenCalled();
});

it('commits a typed count once, not once per keystroke', () => {
  const onCommit = vi.fn();
  renderInput(onCommit);
  const field = screen.getByRole('textbox', { name: 'Copies of Lasgun' });

  fireEvent.change(field, { target: { value: '1' } });
  fireEvent.change(field, { target: { value: '12' } });
  expect(onCommit).not.toHaveBeenCalled();

  fireEvent.blur(field);
  expect(onCommit).toHaveBeenCalledExactlyOnceWith(12);
});

it('does not commit an emptied field, so an interrupted edit cannot persist the minimum', () => {
  const onCommit = vi.fn();
  renderInput(onCommit);
  const field = screen.getByRole('textbox', { name: 'Copies of Lasgun' });

  fireEvent.change(field, { target: { value: '' } });
  expect(onCommit).not.toHaveBeenCalled();
});
