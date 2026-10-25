import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { PLAY_DEBUGGER_EVENTS } from './events';
import type { DebuggerState, TrafficEntry } from './events';

const listeners = new Map<string, (...args: unknown[]) => void>();
const emitted: [string, unknown][] = [];

vi.mock('storybook/preview-api', () => ({
  addons: {
    getChannel: () => ({
      on: (event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener),
      emit: (event: string, payload?: unknown) => emitted.push([event, payload]),
    }),
  },
}));

const { beginDebugging } = await import('./preview');

const view = (turn: number) => JSON.stringify({ type: 'view', turn });

/* What a panel opening now is sent. */
const ask = () => {
  emitted.length = 0;
  listeners.get(PLAY_DEBUGGER_EVENTS.request)?.();
  const traffic = emitted
    .filter(([event]) => event === PLAY_DEBUGGER_EVENTS.traffic)
    .flatMap(([, entries]) => entries as TrafficEntry[]);
  const state = emitted.findLast(([event]) => event === PLAY_DEBUGGER_EVENTS.state)?.[1] as DebuggerState | undefined;
  return { events: emitted.map(([event]) => event), traffic: traffic.map((entry) => entry.json), state };
};

describe('Play debugger preview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("replays the open session's traffic and state to a panel that asks", () => {
    const debugging = beginDebugging({ title: 'First', description: '' });
    debugging.traffic('received', view(1));
    const { events, traffic, state } = ask();
    expect(events[0]).toBe(PLAY_DEBUGGER_EVENTS.reset);
    expect(traffic).toEqual([view(1)]);
    expect(state).toMatchObject({ title: 'First', inspect: { 'Page view': view(1) } });
    debugging.end();
  });

  it('shows nothing of a story whose transport was disposed', () => {
    const debugging = beginDebugging({ title: 'First', description: '' });
    debugging.traffic('received', view(1));
    debugging.end();
    debugging.traffic('received', view(2));
    expect(ask().events).toEqual([PLAY_DEBUGGER_EVENTS.reset]);
    emitted.length = 0;
    vi.runAllTimers();
    expect(emitted).toEqual([]);
  });

  it('keeps an older story out of the session that replaced it', () => {
    const first = beginDebugging({ title: 'First', description: '' });
    const second = beginDebugging({ title: 'Second', description: '' });
    first.traffic('received', view(1));
    first.end();
    second.traffic('received', view(2));
    const { traffic, state } = ask();
    expect(traffic).toEqual([view(2)]);
    expect(state).toMatchObject({ title: 'Second' });
    second.end();
  });
});
