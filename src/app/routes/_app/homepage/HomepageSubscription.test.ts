import { homepageSnapshot } from '@shared/homepage/setup';
import { KEEPALIVE_PING, KEEPALIVE_PONG } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { requestHomepageTicket } from '@db/homepage';
import type { GameRuntime, GameSocket } from '@db/tabletop/runtime';
import { TableSession } from '@db/tabletop/TableSession';

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
  view(viewerSeat: string = SPECTATOR_SEAT) {
    this.onmessage?.({
      data: JSON.stringify({
        type: 'view',
        epoch: 'hour-one',
        sequence: 1,
        serverNow: Date.now(),
        viewer: {
          connectionId: 'visitor',
          userId: 'visitor',
          viewerSeat,
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

function handlingConnection(request: typeof requestHomepageTicket, admit = (socket: Socket) => socket.view('visitor')) {
  const subscription = new HomepageSubscription(runtime, request);
  const session = new TableSession('homepage', subscription, runtime);
  stop = session.connect();
  const socket = sockets[0]!;
  socket.send.mockImplementation((data) => {
    if (data === KEEPALIVE_PING) {
      socket.onmessage?.({ data: KEEPALIVE_PONG });
    } else if (JSON.parse(data).type === 'authenticate') {
      admit(socket);
    }
  });
  socket.open();
  socket.view();
  return { subscription, session, socket };
}

describe('the homepage table connection', () => {
  it.each(['refused', 'failed'] as const)(
    'restores handling after an initially %s ticket while the board stays available',
    async (failure) => {
      const request = vi.fn<typeof requestHomepageTicket>().mockResolvedValue({ ticket: 'a'.repeat(64) });
      if (failure === 'refused') {
        request.mockResolvedValueOnce(null);
      } else {
        request.mockRejectedValueOnce(new Error('Admission temporarily unavailable'));
      }
      const { session, socket } = handlingConnection(request);
      await vi.advanceTimersByTimeAsync(0);
      expect(session.getTable()?.snapshot.table.pieces).toHaveLength(23);
      expect(session.getTable()?.canHandleTable).toBe(false);
      /* Other visitors' table frames must not postpone the member's admission retry. */
      for (let update = 0; update < 8; update += 1) {
        await vi.advanceTimersByTimeAsync(500);
        socket.view();
      }
      await vi.advanceTimersByTimeAsync(1000);
      expect(sockets).toHaveLength(1);
      expect(session.getTable()?.snapshot.table.pieces).toHaveLength(23);
      expect(session.getTable()?.canHandleTable).toBe(true);
    }
  );

  it('recovers when a ticket reaches the socket but the server has not granted handling', async () => {
    const request = vi.fn<typeof requestHomepageTicket>().mockResolvedValue({ ticket: 'a'.repeat(64) });
    let attempts = 0;
    const { session } = handlingConnection(request, (socket) => {
      attempts += 1;
      socket.view(attempts === 1 ? SPECTATOR_SEAT : 'visitor');
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getTable()?.canHandleTable).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(session.getTable()?.canHandleTable).toBe(true);
    expect(attempts).toBe(2);
  });

  it('keeps admitted members on the normal renewal interval', async () => {
    const request = vi.fn<typeof requestHomepageTicket>().mockResolvedValue({ ticket: 'a'.repeat(64) });
    const { session } = handlingConnection(request);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(session.getTable()?.canHandleTable).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(sockets).toHaveLength(1);
  });

  it('backs off repeated refusals and retires recovery when the viewer signs out', async () => {
    const request = vi.fn<typeof requestHomepageTicket>().mockResolvedValue(null);
    const { subscription, session } = handlingConnection(request);
    await vi.advanceTimersByTimeAsync(64_999);
    expect(request).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(5);
    expect(session.getTable()?.canHandleTable).toBe(false);
    subscription.setViewer(null, null);
    sockets[1]!.open();
    sockets[1]!.view();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(request).toHaveBeenCalledTimes(5);
    expect(session.getTable()?.canHandleTable).toBe(false);
  });

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
    const requests: ((value: Awaited<ReturnType<typeof requestHomepageTicket>>) => void)[] = [];
    const request = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof requestHomepageTicket>>>((done) => {
          requests.push(done);
        })
    );
    connect(request);
    sockets[0]!.open();
    sockets[0]!.close();
    await vi.advanceTimersByTimeAsync(1000);
    sockets[1]!.open();
    sockets[1]!.view();
    requests[0]!({ ticket: 'a'.repeat(64) });
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets[0]!.send).not.toHaveBeenCalled();
    expect(sockets[1]!.send).not.toHaveBeenCalled();
    requests[1]!({ ticket: 'b'.repeat(64) });
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(sockets[1]!.send.mock.calls[0]![0])).toEqual({ type: 'authenticate', ticket: 'b'.repeat(64) });
  });

  it('replaces handling permission on a viewer change and ignores the previous viewer ticket', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof requestHomepageTicket>>) => void;
    const request = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof requestHomepageTicket>>>((done) => {
          resolve = done;
        })
    );
    const subscription = connect();
    sockets[0]!.open();
    sockets[0]!.view();
    subscription.setViewer('member', request);
    expect(sockets[0]!.readyState).toBe(3);
    expect(subscription.ready).toBe(false);
    sockets[1]!.open();
    sockets[1]!.view();
    subscription.setViewer(null, null);
    expect(sockets[1]!.readyState).toBe(3);
    sockets[2]!.open();
    sockets[2]!.view();
    resolve({ ticket: 'a'.repeat(64) });
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets[1]!.send).not.toHaveBeenCalled();
    expect(sockets[2]!.send).not.toHaveBeenCalled();
    expect(subscription.ready).toBe(true);
    expect(subscription.getSnapshot()?.viewer.viewerSeat).toBe(SPECTATOR_SEAT);
    subscription.setViewer(null, null);
    expect(sockets).toHaveLength(3);
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
