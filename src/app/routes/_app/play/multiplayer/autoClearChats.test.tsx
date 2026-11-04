/** @vitest-environment jsdom */

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { setAutoClearChats, useAutoClearChatsAtNewTurn } from './autoClearChats';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  setAutoClearChats(false);
});

/* Only what the hook reads: the game, the chats' summaries, and the clear it may call. */
function client() {
  const snapshot = {
    conversations: { online: true, summaries: [{ peerId: 'two', latest: 3, unread: 0, cleared: 0 }] },
  };
  return {
    game: 'game-1',
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    conversations: { clearAllChats: vi.fn() },
  } as unknown as TableSession & { conversations: { clearAllChats: ReturnType<typeof vi.fn> } };
}
/* A live table in play at the given phase of the standard nine-phase turn. */
const at = (phase: number) => ({ snapshot: { stage: 'play', phase } }) as unknown as TableProjection;

test('clears every chat once a new turn begins while it is on, and never for turns played before it was', () => {
  const session = client();
  const { rerender } = renderHook(({ table }) => useAutoClearChatsAtNewTurn(session, table), {
    initialProps: { table: at(0) },
  });
  /* Off by default: the next turn leaves the chats alone. */
  rerender({ table: at(9) });
  expect(session.conversations.clearAllChats).not.toHaveBeenCalled();
  /* Turned on mid-turn, nothing clears until the turn after. */
  setAutoClearChats(true);
  rerender({ table: at(10) });
  expect(session.conversations.clearAllChats).not.toHaveBeenCalled();
  rerender({ table: at(18) });
  expect(session.conversations.clearAllChats).toHaveBeenCalledTimes(1);
  rerender({ table: at(19) });
  expect(session.conversations.clearAllChats).toHaveBeenCalledTimes(1);
});

test('a turn that began while the tab was shut clears once the table is back', () => {
  localStorage.setItem('dunezone-chat-auto-clear-turn:game-1', '1');
  setAutoClearChats(true);
  const session = client();
  renderHook(() => useAutoClearChatsAtNewTurn(session, at(9)));
  expect(session.conversations.clearAllChats).toHaveBeenCalledTimes(1);
});
