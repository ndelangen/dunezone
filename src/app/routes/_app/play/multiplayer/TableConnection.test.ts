import { initialSnapshot, nextSnapshot } from '@shared/play/commands';
import { clientMessageSchema, tableForViewer } from '@shared/play/protocol';
import type { ClientMessage, GameSnapshot, ServerMessage, Viewer } from '@shared/play/protocol';
import { flipPieceInState } from '@shared/play/tableState';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { TableConnection } from './TableConnection';

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  bufferedAmount = 0;
  sent: ClientMessage[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: URL) {
    Socket.instances.push(this);
  }

  open() {
    this.readyState = Socket.OPEN;
    this.onopen?.();
  }

  send(data: string) {
    this.sent.push(clientMessageSchema.parse(JSON.parse(data)));
  }

  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  deliver(message: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

let disconnect: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { location: { href: 'https://dune.zone/play/hosted' } });
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal('WebSocket', Socket);
  Socket.instances = [];
});

afterEach(() => {
  disconnect?.();
  disconnect = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function socket() {
  const current = Socket.instances.at(-1);
  if (!current) {
    throw new Error('The connection did not open a socket.');
  }
  return current;
}

const viewer: Viewer = {
  connectionId: 'connection-one',
  userId: 'user-one',
  viewerSeat: 'harkonnen',
  displayName: 'One',
  color: '#ed927c',
};

function ticket() {
  return Promise.resolve({ ok: true as const, ticket: 'a'.repeat(64), expiresAt: Date.now() + 30_000 });
}

function authorize(snapshot: GameSnapshot = initialSnapshot(), identity = viewer) {
  socket().deliver({ type: 'view', viewer: identity, epoch: 'epoch-one', snapshot, carries: [], pointers: [] });
}

function table(client: TableConnection) {
  const result = client.getSnapshot().table;
  if (!result) {
    throw new Error('The table is not authorized.');
  }
  return result;
}

function command() {
  const result = [...socket().sent].reverse().find((message) => message.type === 'command');
  if (!result) {
    throw new Error('No table command was sent.');
  }
  return result;
}

async function connected(identity = viewer) {
  const client = new TableConnection('fixture-one', ticket);
  disconnect = client.connect();
  await vi.advanceTimersByTimeAsync(0);
  socket().open();
  authorize(initialSnapshot(), identity);
  return client;
}

async function grantedWholeCarry() {
  const client = await connected();
  const snapshot = table(client).snapshot;
  const source = snapshot.table.pieces.find((piece) => piece.id === 'harkonnen-force-stack');
  if (!source) {
    throw new Error('Missing force fixture.');
  }
  client.beginGesture(source.id, 'whole');
  const begin = socket().sent.find((message) => message.type === 'begin');
  const draft = table(client).state.draftMove;
  if (!begin || !draft) {
    throw new Error('The carry did not start.');
  }
  socket().deliver({ type: 'carry', carryId: begin.carryId, draft });
  const view: Extract<ServerMessage, { type: 'view' }> = {
    type: 'view',
    viewer,
    epoch: 'epoch-one',
    snapshot,
    carries: [
      {
        ...viewer,
        id: begin.carryId,
        held: source,
        withdrawnCounts: { [source.id]: source.items.length },
        reservedIds: [source.id],
        expiresAt: Date.now() + 8000,
      },
    ],
    pointers: [],
  };
  return { client, source, view };
}

describe('hosted table admission', () => {
  test('keeps game data and commands unavailable until the server authorizes the connection', async () => {
    const client = new TableConnection('fixture-one', async () => ({
      ok: true,
      ticket: 'a'.repeat(64),
      expiresAt: Date.now() + 30_000,
    }));
    expect(client.getSnapshot().table).toBeNull();
    disconnect = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(socket().url.href).toBe('wss://dune.zone/__play/games/fixture-one/socket');
    socket().open();
    expect(socket().sent).toEqual([{ type: 'admit', ticket: 'a'.repeat(64) }]);
    client.moveStormBy(1);
    client.beginGesture('harkonnen-force-stack', 'whole');
    client.publishPointer([0, 0, 0]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(socket().sent).toHaveLength(1);
    expect(client.getSnapshot().status).toBe('connecting');
    expect(client.getSnapshot().table).toBeNull();
    authorize();
    await vi.advanceTimersByTimeAsync(1000);
    expect(socket().sent).toHaveLength(1);
  });

  test('uses only the server viewer and suspends data and all actions until a fresh view', async () => {
    const client = await connected();
    expect(client.getSnapshot().table?.state.viewerSeat).toBe('harkonnen');
    client.beginGesture('harkonnen-force-stack', 'whole');
    client.publishPointer([0, 0.38, 0]);
    socket().deliver({ type: 'admission', status: 'suspended' });
    const messages = socket().sent.length;
    expect(client.getSnapshot().table).toBeNull();
    client.moveStormBy(1);
    client.updateGesture([1, 0.38, 1]);
    client.rotateSelected(1);
    client.commitDraft();
    client.publishPointer([2, 0.38, 2]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(socket().sent).toHaveLength(messages);
    authorize();
    expect(client.getSnapshot().status).toBe('authorized');
    expect(client.getSnapshot().table?.state.draftMove).toBeNull();
    client.moveStormBy(1);
    expect(socket().sent.at(-1)).toMatchObject({ type: 'command', action: { kind: 'storm', direction: 1 } });
  });

  test('a definitive denial cannot be undone by a later view and never reconnects itself', async () => {
    const client = await connected();
    socket().deliver({ type: 'admission', status: 'denied' });
    authorize();
    socket().close(4401);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(client.getSnapshot().status).toBe('denied');
    expect(client.getSnapshot().table).toBeNull();
    expect(Socket.instances).toHaveLength(1);
  });

  test('an observer receives the table without publishing activity or commands', async () => {
    const client = await connected({ ...viewer, viewerSeat: 'neutral' });
    client.selectPiece('harkonnen-force-stack');
    client.beginGesture('harkonnen-force-stack', 'whole');
    client.moveStormBy(1);
    client.flipSelected('treachery-deck');
    client.publishPointer([0, 0.38, 0]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.getSnapshot().table?.state.viewerSeat).toBe('neutral');
    expect(socket().sent).toEqual([{ type: 'admit', ticket: 'a'.repeat(64) }]);
  });

  test('does not transmit a ticket that expired while the socket was opening', async () => {
    const client = new TableConnection('fixture-one', async () => ({
      ok: true,
      ticket: 'a'.repeat(64),
      expiresAt: Date.now() + 1000,
    }));
    disconnect = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1001);
    const original = socket();
    original.open();
    expect(original.sent).toEqual([]);
    expect(original.readyState).toBe(3);
    expect(client.getSnapshot().table).toBeNull();
  });

  test('retries a failed ticket request without opening an unauthorized socket', async () => {
    const issue = vi.fn(ticket).mockRejectedValueOnce(new Error('Network unavailable.'));
    const client = new TableConnection('fixture-one', issue);
    disconnect = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot().status).toBe('suspended');
    expect(Socket.instances).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(issue).toHaveBeenCalledTimes(2);
    expect(client.getSnapshot().table).toBeNull();
    socket().open();
    authorize();
    expect(client.getSnapshot().status).toBe('authorized');
  });

  test.each([
    { ok: false, reason: 'not_authorized' },
    { ok: false, reason: 'unavailable' },
    { ok: false, reason: 'rate_limited', retryAfterMs: 2000 },
  ] as const)('preserves the retry policy for a refused ticket: $reason', async (response) => {
    const { reason } = response;
    const retryDelay = reason === 'rate_limited' ? response.retryAfterMs : 1000;
    const issue = vi.fn(async () => response);
    const client = new TableConnection('fixture-one', issue);
    disconnect = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot().status).toBe(reason === 'not_authorized' ? 'denied' : 'suspended');
    await vi.advanceTimersByTimeAsync(retryDelay - 1);
    expect(issue).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(issue).toHaveBeenCalledTimes(reason === 'not_authorized' ? 1 : 2);
    expect(Socket.instances).toHaveLength(0);
  });

  test('renews a ticket already expired when the request completes', async () => {
    const issue = vi.fn(async () => ({ ok: true as const, ticket: 'a'.repeat(64), expiresAt: Date.now() }));
    const client = new TableConnection('fixture-one', issue);
    disconnect = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot().status).toBe('suspended');
    expect(Socket.instances).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(issue).toHaveBeenCalledTimes(2);
    expect(Socket.instances).toHaveLength(0);
  });

  test('each reconnect requests a new ticket and ignores the previous socket', async () => {
    let issued = 0;
    const issue = vi.fn(async () => ({
      ok: true as const,
      ticket: (++issued).toString().repeat(64),
      expiresAt: Date.now() + 30_000,
    }));
    const client = new TableConnection('fixture-one', issue);
    disconnect = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    socket().open();
    authorize();
    const old = socket();
    old.close(1006);
    await vi.advanceTimersByTimeAsync(1000);
    socket().open();
    old.deliver({ type: 'view', viewer, epoch: 'old', snapshot: initialSnapshot(), carries: [], pointers: [] });
    expect(client.getSnapshot().table).toBeNull();
    expect(issue).toHaveBeenCalledTimes(2);
    expect(socket().sent).toEqual([{ type: 'admit', ticket: '2'.repeat(64) }]);
    authorize(initialSnapshot(), { ...viewer, connectionId: 'connection-two' });
    expect(table(client).viewer.connectionId).toBe('connection-two');
  });

  test('retiring the route fences an unresolved ticket and every reconnect timer', async () => {
    let resolveTicket: (value: Awaited<ReturnType<typeof ticket>>) => void = () => {};
    const client = new TableConnection(
      'fixture-one',
      () =>
        new Promise((resolve) => {
          resolveTicket = resolve;
        })
    );
    disconnect = client.connect();
    disconnect();
    resolveTicket(await ticket());
    await vi.advanceTimersByTimeAsync(30_000);
    expect(Socket.instances).toHaveLength(0);
    expect(client.getSnapshot().table).toBeNull();
  });

  test('a retired ticket attempt cannot cancel the timeout of the next route connection', async () => {
    let resolveFirst: (value: Awaited<ReturnType<typeof ticket>>) => void = () => {};
    const issue = vi
      .fn<typeof ticket>(() => new Promise(() => {}))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      );
    const client = new TableConnection('fixture-one', issue);
    disconnect = client.connect();
    disconnect();
    disconnect = client.connect();
    resolveFirst(await ticket());
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot().status).toBe('connecting');
    await vi.advanceTimersByTimeAsync(3000);
    expect(client.getSnapshot().status).toBe('suspended');
    expect(Socket.instances).toHaveLength(0);
  });

  test.each([4401, 4408, 4413])(
    'handles server close %s without treating the transport as authorization',
    async (code) => {
      const client = await connected();
      socket().close(code);
      expect(client.getSnapshot().table).toBeNull();
      await vi.advanceTimersByTimeAsync(code === 4413 ? 4999 : 999);
      expect(Socket.instances).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(Socket.instances).toHaveLength(code === 4401 ? 1 : 2);
      expect(client.getSnapshot().table).toBeNull();
    }
  );

  test('closes an unanswered pending socket at the admission deadline', async () => {
    const client = new TableConnection('fixture-one', ticket);
    disconnect = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    socket().open();
    await vi.advanceTimersByTimeAsync(4999);
    expect(socket().readyState).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(socket().readyState).toBe(3);
    expect(client.getSnapshot().status).toBe('suspended');
  });

  test('malformed updates discard the table and require a refreshed client', async () => {
    const client = await connected();
    socket().onmessage?.({ data: '{"type":"view"}' });
    expect(client.getSnapshot().status).toBe('denied');
    expect(client.getSnapshot().table).toBeNull();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(Socket.instances).toHaveLength(1);
  });
});

describe('hosted table interaction', () => {
  test('a held carry survives unrelated views until its drop is acknowledged', async () => {
    const { client, source, view } = await grantedWholeCarry();
    const updatedView = {
      ...view,
      snapshot: nextSnapshot(
        view.snapshot,
        flipPieceInState(tableForViewer(view.snapshot, 'atreides'), 'treachery-deck')
      ),
    };
    socket().deliver(updatedView);
    expect(table(client).gestureActivePieceId).toBe(source.id);

    client.finishGesture([0, 0.38, 0]);
    const drop = socket().sent.find((message) => message.type === 'drop');
    if (!drop) {
      throw new Error('The drop was not sent.');
    }
    socket().deliver({ ...updatedView, completedCommandId: 'another-command' });
    expect(table(client).state.draftMove?.pieceId).toBe(source.id);
    socket().deliver({ ...updatedView, completedCommandId: drop.commandId });
    expect(table(client).state.draftMove).toBeNull();
  });

  test('ignores an older snapshot without reverting the saved revision or flip presentation', async () => {
    const client = await connected();
    const original = initialSnapshot();
    const changed = nextSnapshot(original, flipPieceInState(tableForViewer(original, 'harkonnen'), 'treachery-deck'));
    authorize(changed);
    const flips = table(client).flippingPieceIds;
    expect(flips.has('treachery-deck')).toBe(true);
    authorize(original);
    expect(table(client).snapshot).toEqual(changed);
    expect(table(client).flippingPieceIds).toEqual(flips);
  });

  test('playback is read-only, ignores a superseded response and returns to the newest live state', async () => {
    const client = await connected();
    client.requestHistory(0);
    expect(socket().sent.at(-1)).toEqual({ type: 'history', step: 0 });
    client.moveStormBy(1);
    expect(socket().sent.at(-1)).toEqual({ type: 'history', step: 0 });
    socket().deliver({ type: 'history', step: 0, lastStep: 2, snapshot: initialSnapshot() });
    expect(table(client).playback).toEqual({ step: 0, lastStep: 2 });
    authorize({ ...initialSnapshot(), revision: 4, phase: 2 });
    expect(table(client).snapshot.phase).toBe(0);
    expect(table(client).liveRevision).toBe(4);
    client.requestHistory(1);
    client.resumeLive();
    socket().deliver({ type: 'history', step: 1, lastStep: 2, snapshot: initialSnapshot() });
    expect(table(client).playback).toBeNull();
    expect(table(client).snapshot.phase).toBe(2);
    client.moveStormBy(1);
    expect(command().expectedRevision).toBe(4);
  });

  test('retains the pending flip gate through acceptance and animation completion', async () => {
    const client = await connected();
    const snapshot = table(client).snapshot;
    client.flipSelected('treachery-deck');
    client.finishPieceFlip('treachery-deck', 0);
    client.flipSelected('treachery-deck');
    expect(socket().sent.filter((message) => message.type === 'command')).toHaveLength(1);
    const committed = nextSnapshot(snapshot, flipPieceInState(tableForViewer(snapshot, 'harkonnen'), 'treachery-deck'));
    socket().deliver({
      type: 'view',
      viewer,
      epoch: 'epoch-one',
      snapshot: committed,
      carries: [],
      pointers: [],
      completedCommandId: command().commandId,
    });
    client.flipSelected('treachery-deck');
    expect(socket().sent.filter((message) => message.type === 'command')).toHaveLength(1);
    client.finishPieceFlip('treachery-deck', 1);
    client.flipSelected('treachery-deck');
    expect(socket().sent.filter((message) => message.type === 'command')).toHaveLength(2);
  });

  test('rejection releases a pending flip without changing saved state', async () => {
    const client = await connected();
    client.flipSelected('treachery-deck');
    socket().deliver({ type: 'rejected', requestId: command().commandId, message: 'The table changed.' });
    expect(table(client).snapshot.revision).toBe(0);
    client.flipSelected('treachery-deck');
    expect(socket().sent.filter((message) => message.type === 'command')).toHaveLength(2);
  });

  test('a competing carry replaces the optimistic projection and expires back to saved state', async () => {
    const client = await connected();
    const source = table(client).snapshot.table.pieces.find((piece) => piece.id === 'harkonnen-force-stack');
    if (!source) {
      throw new Error('Missing force fixture.');
    }
    client.beginGesture(source.id, 'whole');
    socket().deliver({
      type: 'activity',
      epoch: 'epoch-one',
      pointers: [],
      carries: [
        {
          ...viewer,
          connectionId: 'other',
          id: 'other-carry',
          held: { ...source, position: [1, 0.38, 1] },
          withdrawnCounts: { [source.id]: source.items.length },
          reservedIds: [source.id],
          expiresAt: Date.now() + 1000,
        },
      ],
    });
    expect(table(client).state.draftMove).toBeNull();
    expect(table(client).renderedPieces.filter((piece) => piece.id === source.id)).toHaveLength(1);
    expect(table(client).renderedPieces.find((piece) => piece.id === source.id)?.position).toEqual([1, 0.38, 1]);
    expect(table(client).reservedPieceIds.has(source.id)).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(table(client).reservedPieceIds.size).toBe(0);
    expect(table(client).renderedPieces.find((piece) => piece.id === source.id)?.position).toEqual(source.position);
  });

  test('a delayed number-key draw cannot interrupt a newer carry', async () => {
    const client = await connected();
    client.beginGesture('harkonnen-force-stack', 'whole');
    const draft = table(client).state.draftMove;
    client.splitSelected(2, 'treachery-deck');
    expect(table(client).state.draftMove).toEqual(draft);
    expect(socket().sent.some((message) => message.type === 'command')).toBe(false);
  });

  test('hiding the page clears its pointer and cancels an unfinished carry', async () => {
    const client = await connected();
    client.publishPointer([0, 0.38, 0]);
    client.beginGesture('harkonnen-force-stack', 'whole');
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(table(client).state.draftMove).toBeNull();
    expect(socket().sent).toContainEqual(expect.objectContaining({ type: 'pointer', position: null }));
    expect(socket().sent).toContainEqual(expect.objectContaining({ type: 'cancel' }));
  });
});
