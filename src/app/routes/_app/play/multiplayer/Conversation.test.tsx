/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { act, cleanup, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vitest';

import { Conversation } from './Conversation';
import type { ConversationView } from './ConversationSession';
import type { TableSession } from './TableSession';
import { ServerClockContext } from './useServerNow';

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

/* jsdom has no font loading, which the composer's autosize listens to. */
Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
});

afterEach(cleanup);

/* Only what the panel reads: a store of one view and the commands it may call. */
function clientWith(conversations: ConversationView) {
  let snapshot = { conversations };
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    publish: (next: ConversationView) => {
      snapshot = { conversations: next };
      listeners.forEach((listener) => listener());
    },
    conversations: { load: vi.fn(), read: vi.fn(), retry: vi.fn(), submit: vi.fn(() => true) },
  } as unknown as TableSession;
}

test('a failed send is an alert', () => {
  const client = clientWith({
    context: null,
    online: false,
    summaries: [],
    pages: { peer: { entries: [], more: false, load: { state: 'idle' } } },
    pending: [
      {
        request: { type: 'conversation-send', requestId: 'request-one', factionId: 'own', peerId: 'peer', text: 'Hi' },
        delivery: { state: 'failed', error: 'The message could not be saved.' },
      },
    ],
  });
  render(
    <MantineProvider theme={appContentTheme}>
      <Conversation client={client} peerId="peer" />
    </MantineProvider>
  );
  const history = screen.getByRole('region', { name: 'Conversation history' });
  expect(history.textContent).toContain('Hi');
  expect(screen.getByRole('alert').textContent).toBe('The message could not be saved.');
});

function message(sequence: number, author: string, senderFactionId: string, text: string) {
  return {
    sequence,
    author,
    senderFactionId,
    text,
    savedAt: 0,
  } as unknown as ConversationView['pages'][string]['entries'][number];
}

test('only messages from the other faction that arrive after the history loaded are announced', () => {
  const view = (entries: ReturnType<typeof message>[], state: 'idle' | 'loading' = 'idle'): ConversationView => ({
    context: { factionId: 'own' } as ConversationView['context'],
    online: true,
    summaries: [],
    pages: { peer: { entries, more: true, load: { state } } as ConversationView['pages'][string] },
    pending: [],
  });
  const client = clientWith(view([message(5, 'Atreides', 'peer', 'Hello')]));
  render(
    <MantineProvider theme={appContentTheme}>
      <ServerClockContext.Provider value={() => 0}>
        <Conversation client={client} peerId="peer" />
      </ServerClockContext.Provider>
    </MantineProvider>
  );
  const status = screen.getByRole('status');
  expect(status.textContent).toBe('');

  const publish = (client as unknown as { publish: (next: ConversationView) => void }).publish;
  act(() => publish(view([message(2, 'Atreides', 'peer', 'Older'), message(5, 'Atreides', 'peer', 'Hello')])));
  expect(status.textContent).toBe('');

  act(() => publish(view([message(5, 'Atreides', 'peer', 'Hello'), message(6, 'Fremen', 'own', 'Mine')])));
  expect(status.textContent).toBe('');

  act(() => publish(view([message(6, 'Fremen', 'own', 'Mine'), message(7, 'Atreides', 'peer', 'Deal?')])));
  expect(status.textContent).toBe('Atreides: Deal?');
});
