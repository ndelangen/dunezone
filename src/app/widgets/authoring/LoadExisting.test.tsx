/** @vitest-environment jsdom */
import { MantineProvider } from '@mantine/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { LoadExisting } from './LoadExisting';

window.matchMedia = vi
  .fn()
  .mockImplementation(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Object.defineProperty(document, 'fonts', {
  value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  configurable: true,
});
afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
const choice = { name: 'Reviewed', draft: { name: 'Reviewed' } };
function view(validate: () => Promise<typeof choice>, onLoaded: (draft: { name: string }) => void, scope = 'one') {
  return (
    <MantineProvider theme={appContentTheme}>
      <LoadExisting noun="card" mode="replace" disabled={false} scopeKey={scope} raw={{ validate }} onLoaded={onLoaded}>
        {(load) => (
          <div>
            {load}
            <button>Save card</button>
          </div>
        )}
      </LoadExisting>
    </MantineProvider>
  );
}
async function start() {
  fireEvent.click(screen.getByRole('button', { name: 'Load existing card' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Writable JSON' }), { target: { value: '{}' } });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 430));
  });
}

test.each(['edit', 'cancel', 'save', 'account', 'route'])('late validation cannot load after %s', async (action) => {
  const pending = deferred<typeof choice>();
  const onLoaded = vi.fn();
  const rendered = render(view(() => pending.promise, onLoaded));
  await start();
  if (action === 'edit') {
    fireEvent.change(screen.getByRole('textbox', { name: 'Writable JSON' }), { target: { value: '{"new":true}' } });
  }
  if (action === 'cancel') {
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  }
  if (action === 'save') {
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
  }
  if (action === 'account' || action === 'route') {
    rendered.rerender(view(() => pending.promise, onLoaded, 'two'));
  }
  await act(async () => {
    pending.resolve(choice);
    await pending.promise;
  });
  expect(onLoaded).not.toHaveBeenCalled();
  const load = screen.queryByRole('button', { name: 'Load card' });
  if (load) {
    expect((load as HTMLButtonElement).disabled).toBe(true);
  }
});

test('only explicit Load commits the validated value', async () => {
  const onLoaded = vi.fn();
  render(view(async () => choice, onLoaded));
  await start();
  await act(async () => {});
  expect(onLoaded).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Load card' }));
  expect(onLoaded).toHaveBeenCalledWith(choice.draft);
});

test('rapid edits prepare only the latest text after a quiet period and wait for references before Load', async () => {
  vi.useFakeTimers();
  try {
    const pending = deferred<typeof choice>();
    const validate = vi.fn(() => pending.promise);
    const onLoaded = vi.fn();
    render(view(validate, onLoaded));
    fireEvent.click(screen.getByRole('button', { name: 'Load existing card' }));
    const input = screen.getByRole('textbox', { name: 'Writable JSON' });
    fireEvent.change(input, { target: { value: '{"old":true}' } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    fireEvent.change(input, { target: { value: '{"latest":true}' } });
    await act(() => vi.advanceTimersByTimeAsync(399));
    expect(validate).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(validate).toHaveBeenCalledExactlyOnceWith('{"latest":true}');
    expect((screen.getByRole('button', { name: 'Load card' }) as HTMLButtonElement).disabled).toBe(true);
    expect((input as HTMLTextAreaElement).value).toBe('{"latest":true}');
    expect(onLoaded).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve(choice);
      await pending.promise;
    });
    expect((screen.getByRole('button', { name: 'Load card' }) as HTMLButtonElement).disabled).toBe(false);
    expect(onLoaded).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
