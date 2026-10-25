import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { PLAY_DEBUGGER_EVENTS } from './events';

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

const { beginDebugging, traffic } = await import('./preview');

const ask = () => {
  emitted.length = 0;
  listeners.get(PLAY_DEBUGGER_EVENTS.request)?.();
  return emitted.map(([event]) => event);
};

describe('Play debugger preview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('replays the open session to a panel that asks', () => {
    const end = beginDebugging({ title: 'First', description: '' });
    traffic('received', JSON.stringify({ type: 'view' }));
    expect(ask()).toEqual([PLAY_DEBUGGER_EVENTS.reset, PLAY_DEBUGGER_EVENTS.traffic, PLAY_DEBUGGER_EVENTS.state]);
    end();
  });

  it('shows nothing of a story whose transport was disposed', () => {
    const end = beginDebugging({ title: 'First', description: '' });
    traffic('received', JSON.stringify({ type: 'view' }));
    end();
    traffic('received', JSON.stringify({ type: 'view' }));
    expect(ask()).toEqual([PLAY_DEBUGGER_EVENTS.reset]);
    emitted.length = 0;
    vi.runAllTimers();
    expect(emitted).toEqual([]);
  });

  it('keeps a newer session when an older story ends late', () => {
    const endFirst = beginDebugging({ title: 'First', description: '' });
    const endSecond = beginDebugging({ title: 'Second', description: '' });
    endFirst();
    expect(ask()).toContain(PLAY_DEBUGGER_EVENTS.state);
    expect(emitted.at(-1)?.[1]).toMatchObject({ title: 'Second' });
    endSecond();
  });
});
