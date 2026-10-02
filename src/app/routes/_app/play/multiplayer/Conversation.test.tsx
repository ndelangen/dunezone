/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vitest';

import { Conversation } from './Conversation';
import type { ConversationView } from './ConversationSession';
import type { TableSession } from './TableSession';

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
  const snapshot = { conversations };
  return {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    conversations: { load: vi.fn(), read: vi.fn(), retry: vi.fn(), submit: vi.fn(() => true) },
  } as unknown as TableSession;
}

test('the history is a log, so arriving messages are announced, and a failed send is an alert', () => {
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
  const history = screen.getByRole('log', { name: 'Conversation history' });
  expect(history.textContent).toContain('Hi');
  expect(screen.getByRole('alert').textContent).toBe('The message could not be saved.');
});
