/** @vitest-environment jsdom */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { setAutoClearChats, useAutoClearChatsAtNewTurn } from './autoClearChats';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  setAutoClearChats(false);
});

type Fake = TableSession & {
  conversations: { clearAllChats: ReturnType<typeof vi.fn>; clearChat: ReturnType<typeof vi.fn> };
  confirm: (cleared: number) => void;
  seat: (factionId: string) => void;
};

/* Only what the hook reads: the game, the chats' summaries, and the clears it may ask for. */
function client(game = 'game-1'): Fake {
  let snapshot = {
    conversations: {
      online: true,
      context: { userId: 'user', factionId: 'one' },
      summaries: [{ peerId: 'two', latest: 3, unread: 0, cleared: 0 }],
    },
  };
  const listeners = new Set<() => void>();
  return {
    game,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    conversations: { clearAllChats: vi.fn(() => ({ two: 3 })), clearChat: vi.fn() },
    /* The room's summaries after it has cleared this faction's chat through `cleared`. */
    confirm: (cleared: number) => {
      snapshot = {
        conversations: { ...snapshot.conversations, summaries: [{ ...snapshot.conversations.summaries[0], cleared }] },
      };
      listeners.forEach((listener) => listener());
    },
    /* The same browser now plays another faction at the table. */
    seat: (factionId: string) => {
      snapshot = { conversations: { ...snapshot.conversations, context: { userId: 'user', factionId } } };
      listeners.forEach((listener) => listener());
    },
  } as unknown as Fake;
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

test('asks again for a clear the room has not confirmed, until it does', () => {
  localStorage.setItem('dunezone-chat-auto-clear-turn:game-1', '1');
  setAutoClearChats(true);
  const session = client();
  const { unmount } = renderHook(() => useAutoClearChatsAtNewTurn(session, at(9)));
  expect(session.conversations.clearAllChats).toHaveBeenCalledTimes(1);
  unmount();
  /* The connection dropped before the room took the clear: the page that comes back asks for it again. */
  const again = renderHook(() => useAutoClearChatsAtNewTurn(session, at(9)));
  expect(session.conversations.clearChat).toHaveBeenLastCalledWith({ peerId: 'two', through: 3 });
  act(() => session.confirm(3));
  again.unmount();
  session.conversations.clearChat.mockClear();
  renderHook(() => useAutoClearChatsAtNewTurn(session, at(9)));
  expect(session.conversations.clearChat).not.toHaveBeenCalled();
});

test('still clears each new turn when the browser keeps no storage', () => {
  const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  try {
    setAutoClearChats(true);
    const session = client('game-without-storage');
    const { rerender } = renderHook(({ table }) => useAutoClearChatsAtNewTurn(session, table), {
      initialProps: { table: at(0) },
    });
    rerender({ table: at(9) });
    expect(session.conversations.clearAllChats).toHaveBeenCalledTimes(1);
  } finally {
    blocked.mockRestore();
    vi.restoreAllMocks();
  }
});

test('a clear owed by one faction is never replayed for another faction this browser plays', () => {
  localStorage.setItem('dunezone-chat-auto-clear-turn:game-seat', '1');
  setAutoClearChats(true);
  const session = client('game-seat');
  const { unmount } = renderHook(() => useAutoClearChatsAtNewTurn(session, at(9)));
  expect(session.conversations.clearAllChats).toHaveBeenCalledTimes(1);
  unmount();
  session.conversations.clearChat.mockClear();
  session.seat('three');
  setAutoClearChats(false);
  renderHook(() => useAutoClearChatsAtNewTurn(session, at(9)));
  expect(session.conversations.clearChat).not.toHaveBeenCalled();
});
