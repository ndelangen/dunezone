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
function start() {
  fireEvent.click(screen.getByRole('button', { name: 'Load existing card' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Writable JSON' }), { target: { value: '{}' } });
  fireEvent.click(screen.getByRole('button', { name: 'Validate JSON' }));
}

test.each(['edit', 'cancel', 'save', 'account', 'route'])('late validation cannot load after %s', async (action) => {
  const pending = deferred<typeof choice>();
  const onLoaded = vi.fn();
  const rendered = render(view(() => pending.promise, onLoaded));
  start();
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
  start();
  await act(async () => {});
  expect(onLoaded).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Load card' }));
  expect(onLoaded).toHaveBeenCalledWith(choice.draft);
});
