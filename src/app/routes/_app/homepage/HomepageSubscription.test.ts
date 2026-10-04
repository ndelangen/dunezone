import { homepageSnapshot } from '@shared/homepage/setup';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { requestHomepageTicket } from '@db/homepage';
import type { GameRuntime, GameSocket } from '@db/tabletop/runtime';

import { HomepageSubscription } from './HomepageSubscription';

class Socket {
  readyState: GameSocket['readyState'] = 0;
  bufferedAmount = 0;
  send = vi.fn<(data: string) => void>();
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  view() {
    this.onmessage?.({
      data: JSON.stringify({
        type: 'view',
        epoch: 'hour-one',
        sequence: 1,
        serverNow: Date.now(),
        viewer: {
          connectionId: 'visitor',
          userId: 'visitor',
          viewerSeat: SPECTATOR_SEAT,
          displayName: '',
          color: '#888888',
        },
        snapshot: homepageSnapshot('https://dune.zone'),
        carries: [],
        pointers: [],
      }),
    });
  }
}

let sockets: Socket[];
let stop: (() => void) | undefined;
const runtime: GameRuntime = {
  openSocket() {
    const socket = new Socket();
    sockets.push(socket);
    return socket;
  },
  monotonicNow: () => performance.now(),
  onHidden: () => () => {},
  onVisible: () => () => {},
  onOnline: () => () => {},
};
beforeEach(() => {
  vi.useFakeTimers();
  sockets = [];
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
});

function connect(request: typeof requestHomepageTicket | null = null) {
  const subscription = new HomepageSubscription(runtime, request);
  stop = subscription.subscribe(() => {});
  return subscription;
}

describe('the homepage table connection', () => {
  it('retries a connection that never supplies its first table', async () => {
    const subscription = connect();
    sockets[0]!.open();
    await vi.advanceTimersByTimeAsync(11_000);
    expect(sockets[0]!.readyState).toBe(3);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    sockets[1]!.view();
    expect(subscription.ready).toBe(true);
    expect(subscription.getSnapshot()?.snapshot.table.pieces).toHaveLength(23);
  });

  it('does not put a ticket from a disconnected attempt on its replacement connection', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof requestHomepageTicket>>) => void;
    const request = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof requestHomepageTicket>>>((done) => {
          resolve = done;
        })
    );
    connect(request);
    sockets[0]!.open();
    sockets[0]!.close();
    await vi.advanceTimersByTimeAsync(1000);
    sockets[1]!.open();
    sockets[1]!.view();
    resolve({ ticket: 'a'.repeat(64) });
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets[0]!.send).not.toHaveBeenCalled();
    expect(sockets[1]!.send).not.toHaveBeenCalled();
  });

  it('sends physical commands with the current epoch while refusing game lifecycle commands', () => {
    const subscription = connect();
    sockets[0]!.open();
    sockets[0]!.view();
    expect(subscription.supportsCommand('deck-draw')).toBe(false);
    expect(subscription.supportsCommand('flip')).toBe(true);
    const message = {
      type: 'command' as const,
      commandId: 'flip',
      expectedRevision: 0,
      action: { kind: 'flip' as const, pieceId: 'treachery-card-loose' },
    };
    expect(subscription.send(message)).toBe(true);
    expect(JSON.parse(sockets[0]!.send.mock.calls[0]![0])).toEqual({ type: 'act', epoch: 'hour-one', message });
    expect(subscription.send({ type: 'history', step: 0 })).toBe(false);
  });
});
