import { emptyBattlePlan, fixtureBattleFaces } from '@shared/play/battle';
import { initialSnapshot, nextSnapshot } from '@shared/play/commands';
import { PHASE_CHANGE_COOLDOWN_MS } from '@shared/play/phases';
import { tableForViewer } from '@shared/play/protocol';
import type { ActivityChange, GameSnapshot, ServerMessage, Viewer } from '@shared/play/protocol';
import { flipPieceInState } from '@shared/play/tableState';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { hidden, runtime, Socket } from './gameRuntime.test.fixture';
import { TableSession } from './TableSession';

function connection(gameId: string, request: ConstructorParameters<typeof TableSession>[1]) {
  return new TableSession(gameId, request, runtime);
}

let disconnect: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
});

afterEach(() => {
  disconnect?.();
  disconnect = undefined;
  hidden.clear();
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
  return Promise.resolve({ ok: true as const, ticket: 'a'.repeat(64), expiresInMs: 30_000 });
}

type ViewFrame = Extract<ServerMessage, { type: 'view' }>;

function view(frame: Partial<ViewFrame> = {}): ViewFrame {
  return { type: 'view', viewer, epoch: 'epoch-one', snapshot: initialSnapshot(), carries: [], pointers: [], ...frame };
}

function authorize(snapshot: GameSnapshot = initialSnapshot(), identity = viewer) {
  socket().deliver(view({ snapshot, viewer: identity }));
}

const noActivity = {
  carries: [],
  carryMoves: [],
  removedCarries: [],
  pointers: [],
  pointerMoves: [],
  removedPointers: [],
};

/* The update names a frame the tab never held, so it cannot apply and the tab asks for a full view. */
function deliverGap(completedCommandId?: string) {
  socket().deliver({
    type: 'update',
    epoch: 'epoch-one',
    baseSequence: 7,
    sequence: 8,
    activity: noActivity,
    ...(completedCommandId ? { completedCommandId } : {}),
  });
}

/* A tab that lost its connection keeps the last table on screen, read-only, until a fresh view. */
function expectLocked(client: TableSession) {
  expect(table(client)).toMatchObject({ reconnecting: true, canInteract: false, affordances: [] });
  expect(client.getPointers()).toEqual([]);
  expect(table(client).state.draftMove).toBeNull();
}

/* The live table the scene reads, every move included; the panels' copy may lag behind a carry. */
function table(client: TableSession) {
  const result = client.getSnapshot().table && client.getTable();
  if (!result) {
    throw new Error('The table is not authorized.');
  }
  return result;
}

function renderedPiece(client: TableSession, pieceId: string) {
  return table(client).renderedPieces.find((piece) => piece.id === pieceId);
}

function command() {
  const result = [...socket().sent].reverse().find((message) => message.type === 'command');
  if (!result) {
    throw new Error('No table command was sent.');
  }
  return result;
}

async function connected(identity = viewer) {
  const client = connection('fixture-one', ticket);
  disconnect = client.connect();
  await vi.advanceTimersByTimeAsync(0);
  socket().open();
  authorize(initialSnapshot(), identity);
  return client;
}

describe('hosted public controls', () => {
  test('uses the server cooldown duration despite clock skew and refreshes when it expires', async () => {
    const client = await connected();
    const snapshot = {
      ...initialSnapshot(),
      phase: 1,
      controls: { seats: [], ready: [], requests: [], seatRequests: [], players: [], phaseChangedAt: 1 },
    };
    socket().deliver(view({ snapshot, phaseCooldownMs: PHASE_CHANGE_COOLDOWN_MS }));
    expect(table(client).phaseCooling).toBe(true);
    vi.setSystemTime(Date.now() - 3_600_000);
    await vi.advanceTimersByTimeAsync(PHASE_CHANGE_COOLDOWN_MS - 1);
    expect(table(client).phaseCooling).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(table(client).phaseCooling).toBe(false);
  });

  test('sends one catalogue read at a time and only the latest selection once the read in flight answers', async () => {
    const client = await connected();
    const sentReads = () =>
      socket().sent.flatMap((message) => (message.type === 'catalogue' ? [message.requestId] : []));
    const first = client.catalogue({ type: 'deck', slug: 'first' });
    client.catalogue({ type: 'deck', slug: 'skipped' });
    const current = client.catalogue({ type: 'token-disc', slug: 'current' });
    expect(sentReads()).toEqual([first]);
    socket().deliver({ type: 'catalogue', requestId: first, contents: null, error: 'Obsolete response' });
    expect(sentReads()).toEqual([first, current]);
    expect(client.getSnapshot().catalogue?.error).toBeUndefined();
    const contents = {
      assetId: 'current',
      name: 'Current token',
      type: 'token-disc' as const,
      members: [],
      definitions: [],
      pieces: [initialSnapshot().table.pieces[0]],
    };
    socket().deliver({ type: 'catalogue', requestId: current, contents });
    expect(client.getSnapshot().catalogue).toMatchObject({ requestId: current, contents });
  });
  test('keeps the capture occupied when a view changes the current seat and faction', async () => {
    const client = await connected();
    const sentReads = () =>
      socket().sent.flatMap((message) => (message.type === 'catalogue' ? [message.requestId] : []));
    const first = client.catalogue({ type: 'deck', slug: 'first' });
    const next = client.catalogue({ type: 'deck', slug: 'next' });
    authorize(
      { ...initialSnapshot(), bank: { factionId: 'atreides', balance: 20 } },
      { ...viewer, viewerSeat: 'atreides' }
    );
    expect(sentReads()).toEqual([first]);
    client.command({ kind: 'spawn-request', type: 'deck', slug: 'another' });
    expect(socket().sent.filter((message) => message.type === 'command')).toHaveLength(0);
    socket().deliver({ type: 'catalogue', requestId: first, contents: null });
    expect(sentReads()).toEqual([first, next]);
    socket().close();
    await vi.advanceTimersByTimeAsync(1000);
    socket().open();
    authorize();
    /* The read the drop cut off goes again, and a newer selection waits behind it as usual. */
    expect(sentReads()).toEqual([next]);
    const fresh = client.catalogue({ type: 'deck', slug: 'fresh' });
    expect(sentReads()).toEqual([next]);
    socket().deliver({ type: 'catalogue', requestId: next, contents: null });
    expect(sentReads()).toEqual([next, fresh]);
  });
  test('stops the locked table clock when the connection drops, not at the last update', async () => {
    const client = await connected();
    await vi.advanceTimersByTimeAsync(27_000);
    const dropped = Date.now();
    socket().close();
    expectLocked(client);
    expect(table(client).serverNow()).toBe(dropped);
    await vi.advanceTimersByTimeAsync(5000);
    expect(table(client).serverNow()).toBe(dropped);
  });
  test('keeps both public log pages through seat and faction changes and resets them on disconnect', async () => {
    const client = await connected();
    for (const tab of ['game', 'audit'] as const) {
      client.readLogHistory(tab, 20);
      socket().deliver({ type: 'log-history', tab, before: 20, entries: [], more: true });
    }
    const pages = client.getSnapshot().logHistory;
    for (const identity of [viewer, { ...viewer, viewerSeat: 'atreides' }]) {
      authorize({ ...initialSnapshot(), bank: { factionId: 'atreides', balance: 20 } }, identity);
      expect(client.getSnapshot().logHistory).toEqual(pages);
      for (const tab of ['game', 'audit'] as const) {
        client.readLogHistory(tab);
        expect(socket().sent.at(-1)).toEqual({ type: 'log-history', tab, before: 20 });
      }
    }
    socket().close();
    expect(client.getSnapshot().logHistory).toEqual({});
    await vi.advanceTimersByTimeAsync(1000);
    socket().open();
    authorize();
    for (const tab of ['game', 'audit'] as const) {
      client.readLogHistory(tab);
      expect(socket().sent.at(-1)).toEqual({ type: 'log-history', tab, before: Number.MAX_SAFE_INTEGER });
    }
  });
  test('releases the capture on a completion the tab could not apply', async () => {
    const client = await connected();
    const sentReads = () =>
      socket().sent.flatMap((message) => (message.type === 'catalogue' ? [message.requestId] : []));
    client.command({ kind: 'spawn-request', type: 'deck', slug: 'ready' });
    const request = socket().sent.find((message) => message.type === 'command');
    const next = client.catalogue({ type: 'deck', slug: 'next' });
    deliverGap(request!.commandId);
    /* The completion frees the slot even though the delta did not apply, so the read goes out before the resync. */
    expect(sentReads()).toEqual([next]);
    expect(socket().sent.some((message) => message.type === 'sync')).toBe(true);
    socket().deliver(view({ sequence: 9 }));
    expect(sentReads()).toEqual([next]);
  });
  test('refuses a second spawn request locally while the first is still capturing', async () => {
    const client = await connected();
    client.command({ kind: 'spawn-request', type: 'deck', slug: 'first' });
    client.command({ kind: 'spawn-request', type: 'deck', slug: 'second' });
    const requests = socket().sent.filter((message) => message.type === 'command');
    expect(requests).toHaveLength(1);
    expect(client.getSnapshot().error).toBe('A catalogue request is already in flight.');
    const next = client.catalogue({ type: 'deck', slug: 'next' });
    socket().deliver({ type: 'rejected', requestId: 'unrelated', message: 'Unrelated.' });
    expect(socket().sent.filter((message) => message.type === 'catalogue')).toHaveLength(0);
    socket().deliver(view({ sequence: 2, completedCommandId: requests[0]!.commandId }));
    expect(
      socket()
        .sent.filter((message) => message.type === 'catalogue')
        .map((message) => message.requestId)
    ).toEqual([next]);
  });
  test('holds a catalogue read behind the spawn request the Worker is still capturing', async () => {
    const client = await connected();
    const sentReads = () =>
      socket().sent.flatMap((message) => (message.type === 'catalogue' ? [message.requestId] : []));
    client.command({ kind: 'spawn-request', type: 'deck', slug: 'ready' });
    const request = socket().sent.find((message) => message.type === 'command');
    expect(request).toMatchObject({ action: { kind: 'spawn-request' } });
    const next = client.catalogue({ type: 'deck', slug: 'next' });
    expect(sentReads()).toEqual([]);
    socket().deliver(view({ sequence: 2, completedCommandId: request!.commandId }));
    expect(sentReads()).toEqual([next]);
  });
  test('shows a refused catalogue read in the picker instead of waiting for a reply that never comes', async () => {
    const client = await connected();
    const refused = client.catalogue({ type: 'deck', slug: 'second' });
    socket().deliver({ type: 'rejected', requestId: refused, message: 'A catalogue request is already in flight.' });
    expect(client.getSnapshot().catalogue).toMatchObject({
      requestId: refused,
      contents: null,
      error: 'A catalogue request is already in flight.',
    });
    socket().deliver({ type: 'rejected', requestId: 'unrelated', message: 'Unrelated.' });
    expect(client.getSnapshot().catalogue?.requestId).toBe(refused);
  });

  test('refreshes an expired cooldown when a suspended tab misses the deadline', async () => {
    const client = await connected();
    socket().deliver(view({ phaseCooldownMs: PHASE_CHANGE_COOLDOWN_MS }));
    expect(table(client).phaseCooling).toBe(true);
    const delayedClock = vi
      .spyOn(performance, 'now')
      .mockReturnValue(performance.now() + PHASE_CHANGE_COOLDOWN_MS + 4000);
    try {
      await vi.advanceTimersByTimeAsync(1000);
      expect(table(client).phaseCooling).toBe(false);
    } finally {
      delayedClock.mockRestore();
    }
  });
});

async function grantedWholeCarry() {
  const client = await connected();
  const snapshot = table(client).snapshot;
  const source = snapshot.table.pieces.find((piece) => piece.id === 'harkonnen-force-stack');
  if (!source) {
    throw new Error('Missing troop fixture.');
  }
  client.beginGesture(source.id, 'whole');
  const begin = socket().sent.find((message) => message.type === 'begin');
  const draft = table(client).state.draftMove;
  if (!begin || !draft) {
    throw new Error('The carry did not start.');
  }
  socket().deliver({ type: 'carry', carryId: begin.carryId, draft });
  const carried = view({
    snapshot,
    sequence: 1,
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
  });
  return { client, source, carried };
}

const dropPosition: [number, number, number] = [0.5, 0.38, 0.5];

/* Every drop any socket sent, so a drop that went out on a closed socket still counts. */
function sentDrops() {
  return Socket.instances
    .flatMap((instance) => instance.sent)
    .flatMap((message) => (message.type === 'drop' ? [message] : []));
}

/* The drop's completion arrives on an update the tab cannot apply, and the fresh view saves the stack where it landed. */
function dropThroughResync(client: TableSession, sourceId: string) {
  const rendered = () => table(client).renderedPieces.find((piece) => piece.id === sourceId)?.position;
  const saved = table(client).snapshot;
  client.finishGesture(dropPosition);
  const drop = socket().sent.find((message) => message.type === 'drop');
  if (!drop) {
    throw new Error('The drop was not sent.');
  }
  deliverGap(drop.commandId);
  const duringResync = rendered();
  const pieces = saved.table.pieces.map((piece) =>
    piece.id === sourceId ? { ...piece, position: dropPosition } : piece
  );
  const committed = { ...saved, revision: saved.revision + 1, table: { ...saved.table, pieces } };
  socket().deliver(view({ snapshot: committed, sequence: 9 }));
  return { duringResync, afterView: rendered(), draftMove: table(client).state.draftMove };
}

describe('hosted table admission', () => {
  test('clears cursor positions outside the table bounds before sending them', async () => {
    const client = await connected();
    client.publishPointer([1, 0.38, 1]);
    await vi.advanceTimersByTimeAsync(50);
    client.publishPointer([-31, 0.38, 1]);
    await vi.advanceTimersByTimeAsync(50);
    expect(socket().sent.at(-1)).toMatchObject({ type: 'pointer', position: null });
  });

  test('keeps game data and commands unavailable until the server authorizes the connection', async () => {
    const client = connection('fixture-one', async () => ({
      ok: true,
      ticket: 'a'.repeat(64),
      expiresInMs: 30_000,
    }));
    expect(client.getSnapshot().table).toBeNull();
    disconnect = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(socket().gameId).toBe('fixture-one');
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
    expectLocked(client);
    client.moveStormBy(1);
    client.updateGesture([1, 0.38, 1]);
    client.rotateSelected(1);
    client.finishGesture([1, 0.38, 1]);
    client.publishPointer([2, 0.38, 2]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(socket().sent).toHaveLength(messages);
    authorize();
    expect(client.getSnapshot().status).toBe('authorized');
    expect(client.getSnapshot().table?.state.draftMove).toBeNull();
    client.moveStormBy(1);
    expect(socket().sent.at(-1)).toMatchObject({ type: 'command', action: { kind: 'storm', direction: 1 } });
  });

  test('the locked table keeps one frozen clock and does not outlive the route', async () => {
    const client = await connected();
    socket().deliver({ type: 'admission', status: 'suspended' });
    const clock = table(client).serverNow;
    const before = client.getTable();
    client.setHoveredPiece('harkonnen-force-stack');
    expect(client.getTable()).not.toBe(before);
    expect(table(client).serverNow).toBe(clock);
    disconnect?.();
    disconnect = undefined;
    expect(client.getSnapshot().table).toBeNull();
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

  test('a clock 60 s fast still sends a ticket with 30 s left', async () => {
    const client = connection('fixture-one', ticket);
    vi.setSystemTime(Date.now() + 60_000);
    disconnect = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    socket().open();
    expect(socket().sent).toEqual([{ type: 'admit', ticket: 'a'.repeat(64) }]);
  });

  test('a clock 60 s slow reconnects instead of sending a ticket that expired while the socket was opening', async () => {
    const issue = vi.fn(async () => ({ ok: true as const, ticket: 'a'.repeat(64), expiresInMs: 1000 }));
    const client = connection('fixture-one', issue);
    vi.setSystemTime(Date.now() - 60_000);
    disconnect = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1001);
    const original = socket();
    original.open();
    expect(original.sent).toEqual([]);
    expect(original.readyState).toBe(3);
    expect(client.getSnapshot().table).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(issue).toHaveBeenCalledTimes(2);
    socket().open();
    expect(socket().sent).toEqual([{ type: 'admit', ticket: 'a'.repeat(64) }]);
  });

  test('counts the ticket lifetime from the request, not from the response', async () => {
    const client = connection('fixture-one', async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return { ok: true as const, ticket: 'a'.repeat(64), expiresInMs: 2500 };
    });
    disconnect = client.connect();
    await vi.advanceTimersByTimeAsync(2501);
    socket().open();
    expect(socket().sent).toEqual([]);
  });

  test('server time runs on from the freshest frame, whatever the wall clock or a late frame says', async () => {
    const serverNow = 1_800_000_000_000;
    const client = connection('fixture-one', ticket);
    disconnect = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    socket().open();
    socket().deliver(view({ sequence: 1 }), serverNow);
    vi.setSystemTime(Date.now() - 3_600_000);
    await vi.advanceTimersByTimeAsync(10_000);
    socket().deliver(
      { type: 'update', epoch: 'epoch-one', baseSequence: 1, sequence: 2, activity: noActivity },
      serverNow + 10_000
    );
    expect(table(client).serverNow()).toBe(serverNow + 10_000);
    await vi.advanceTimersByTimeAsync(2000);
    socket().deliver(
      { type: 'update', epoch: 'epoch-one', baseSequence: 2, sequence: 3, activity: noActivity },
      serverNow + 10_000
    );
    expect(table(client).serverNow()).toBe(serverNow + 12_000);
  });

  test('retries a failed ticket request without opening an unauthorized socket', async () => {
    const issue = vi.fn(ticket).mockRejectedValueOnce(new Error('Network unavailable.'));
    const client = connection('fixture-one', issue);
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
    const client = connection('fixture-one', issue);
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
    const issue = vi.fn(async () => ({ ok: true as const, ticket: 'a'.repeat(64), expiresInMs: 0 }));
    const client = connection('fixture-one', issue);
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
      expiresInMs: 30_000,
    }));
    const client = connection('fixture-one', issue);
    disconnect = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    socket().open();
    authorize();
    const old = socket();
    old.close(1006);
    await vi.advanceTimersByTimeAsync(1000);
    socket().open();
    old.deliver(view({ epoch: 'old' }));
    expectLocked(client);
    expect(issue).toHaveBeenCalledTimes(2);
    expect(socket().sent).toEqual([{ type: 'admit', ticket: '2'.repeat(64), replaces: 'connection-one' }]);
    authorize(initialSnapshot(), { ...viewer, connectionId: 'connection-two' });
    expect(table(client).viewer.connectionId).toBe('connection-two');
  });

  test('retiring the route fences an unresolved ticket and every reconnect timer', async () => {
    let resolveTicket: (value: Awaited<ReturnType<typeof ticket>>) => void = () => {};
    const client = connection(
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
    const client = connection('fixture-one', issue);
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
      const assertTable = () => (code === 4401 ? expect(client.getSnapshot().table).toBeNull() : expectLocked(client));
      assertTable();
      await vi.advanceTimersByTimeAsync(code === 4413 ? 4999 : 999);
      expect(Socket.instances).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(Socket.instances).toHaveLength(code === 4401 ? 1 : 2);
      assertTable();
    }
  );

  test('closes an unanswered pending socket at the admission deadline', async () => {
    const client = connection('fixture-one', ticket);
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
  test('phase changes preserve a carry and use the latest shared revision', async () => {
    const { client, source, carried } = await grantedWholeCarry();
    socket().deliver(carried);
    client.command({ kind: 'phase' });
    expect(command().action).toEqual({ kind: 'phase' });
    socket().deliver({ ...carried, snapshot: { ...carried.snapshot, phase: 54, revision: 1 } });
    expect(table(client).snapshot.phase).toBe(54);
    expect(table(client).gestureActivePieceId).toBe(source.id);
    client.command({ kind: 'phase' });
    expect(command().expectedRevision).toBe(1);
    client.finishGesture([0, 0.38, 0]);
    expect(socket().sent.at(-1)).toMatchObject({ type: 'drop', carryId: carried.carries[0].id });
  });

  test('a finished game keeps its table as it is: nothing picks up, selects or changes a piece, and Continue playing still goes', async () => {
    const client = await connected();
    const piece = initialSnapshot().table.pieces[0];
    socket().deliver(
      view({
        snapshot: {
          ...initialSnapshot(),
          stage: 'finished',
          result: { kind: 'none', factionIds: [], by: { seat: 'harkonnen', name: 'One' }, declaredAt: 1 },
        },
      })
    );
    const sent = socket().sent.length;
    client.selectPiece(piece.id);
    client.setHoveredPiece(piece.id);
    client.beginGesture(piece.id, 'whole');
    client.flipSelected(piece.id);
    client.rotateSelected(1, piece.id);
    client.toggleLockSelected();
    expect(table(client).state.selectedPieceId).toBeNull();
    expect(table(client).state.draftMove).toBeNull();
    expect(socket().sent).toHaveLength(sent);
    expect(table(client)).toMatchObject({ canInteract: true, canHandleTable: false });
    expect(table(client).deckControls).toBeUndefined();
    client.command({ kind: 'result-continue' });
    expect(command().action).toEqual({ kind: 'result-continue' });
  });

  test.each(['drafting', 'swapping', 'discarded'] as const)(
    'a game at the %s stage offers no table handling',
    async (stage) => {
      const client = await connected();
      const piece = initialSnapshot().table.pieces[0];
      socket().deliver(view({ snapshot: { ...initialSnapshot(), stage } }));
      const sent = socket().sent.length;
      client.selectPiece(piece.id);
      client.beginGesture(piece.id, 'whole');
      client.flipSelected(piece.id);
      expect(table(client).state.selectedPieceId).toBeNull();
      expect(table(client).state.draftMove).toBeNull();
      expect(socket().sent).toHaveLength(sent);
      expect(table(client)).toMatchObject({
        canHandleTable: false,
        spiceReserveControls: undefined,
        deckControls: undefined,
      });
    }
  );

  test('a selection made before the game finished is no longer shown, and clearing it still works', async () => {
    const client = await connected();
    const piece = initialSnapshot().table.pieces[0];
    client.selectPiece(piece.id);
    expect(table(client).state.selectedPieceId).toBe(piece.id);
    const finished = {
      ...initialSnapshot(),
      stage: 'finished' as const,
      result: { kind: 'none' as const, factionIds: [], by: { seat: 'harkonnen', name: 'One' }, declaredAt: 1 },
    };
    socket().deliver(view({ snapshot: finished }));
    expect(table(client).state.selectedPieceId).toBeNull();
    expect(table(client).selectedPiece).toBeNull();
    client.selectPiece(null);
    socket().deliver(view({ snapshot: { ...finished, stage: 'play', result: undefined } }));
    expect(table(client).state.selectedPieceId).toBeNull();
  });

  test('Spice Bank emits separate amount commands and observers cannot use trackers', async () => {
    const client = await connected();
    client.spawnSpice(10);
    expect(command().action).toEqual({ kind: 'spice-spawn', count: 10 });
    client.spawnSpice(2);
    expect(command().action).toEqual({ kind: 'spice-spawn', count: 2 });
    const commands = socket().sent.length;
    authorize(initialSnapshot(), { ...viewer, viewerSeat: 'neutral' });
    client.spawnSpice(1);
    client.command({ kind: 'phase' });
    expect(socket().sent).toHaveLength(commands);
  });

  test('phase commands and incoming phase changes preserve a held piece through its drop', async () => {
    const { client, source, carried } = await grantedWholeCarry();
    socket().deliver(carried);
    client.updateGesture([0, 0.38, 0]);
    const heldPosition = renderedPiece(client, source.id)?.position;
    expect(heldPosition).not.toEqual(source.position);
    client.command({ kind: 'phase' });
    const forward = command();
    expect(forward.action).toEqual({ kind: 'phase' });
    expect(forward.expectedRevision).toBe(0);
    client.command({ kind: 'flip', pieceId: 'treachery-deck' });
    expect(command()).toEqual(forward);

    socket().deliver({ ...carried, snapshot: { ...carried.snapshot, phase: 1, revision: 1 } });
    expect(table(client).snapshot.phase).toBe(1);
    expect(table(client).gestureActivePieceId).toBe(source.id);
    expect(renderedPiece(client, source.id)?.position).toEqual(heldPosition);

    client.command({ kind: 'phase', direction: -1 });
    expect(command().action).toEqual({ kind: 'phase', direction: -1 });
    expect(command().expectedRevision).toBe(1);
    socket().deliver({ ...carried, snapshot: { ...carried.snapshot, phase: 0, revision: 2 } });
    expect(table(client).snapshot.phase).toBe(0);
    expect(table(client).state.draftMove?.pieceId).toBe(source.id);

    client.finishGesture([0, 0.38, 0]);
    expect(socket().sent.at(-1)).toMatchObject({ type: 'drop', carryId: carried.carries[0].id });
  });

  test('the piece menu offers spice reserve and deck actions only to a viewer who can act, and spice reserve collect refuses a piece another player holds', async () => {
    const client = await connected();
    const harkonnen = { id: 'harkonnen', name: 'Harkonnen', color: '#ed927c' };
    const snapshot: GameSnapshot = {
      ...initialSnapshot(),
      bank: { factionId: 'harkonnen', balance: 20 },
      roster: {
        seatCount: 6,
        seats: [
          { id: 'harkonnen', position: 0, faction: harkonnen },
          { id: 'open', position: 1, faction: null },
        ],
      },
    };
    const held = snapshot.table.pieces[0];
    socket().deliver(
      view({
        snapshot,
        carries: [
          {
            ...viewer,
            connectionId: 'other',
            id: 'other-carry',
            held,
            withdrawnCounts: { [held.id]: held.items.length },
            reservedIds: [held.id],
            expiresAt: Date.now() + 8000,
          },
        ],
      })
    );
    const { spiceReserveControls, deckControls } = table(client);
    expect(deckControls?.recipients).toEqual([{ id: harkonnen.id, name: harkonnen.name }]);
    deckControls?.draw('treachery-deck', 'harkonnen');
    expect(command().action).toEqual({ kind: 'deck-draw', pieceId: 'treachery-deck', recipient: 'harkonnen' });
    deckControls?.shuffle('treachery-deck');
    expect(command().action).toEqual({ kind: 'deck-shuffle', pieceId: 'treachery-deck' });
    expect(spiceReserveControls?.canCollect(held.id)).toBe(false);
    expect(spiceReserveControls?.canCollect('treachery-card-loose')).toBe(true);
    spiceReserveControls?.collect('treachery-card-loose');
    expect(command().action).toEqual({ kind: 'bank-collect', pieceId: 'treachery-card-loose' });

    authorize(snapshot, { ...viewer, viewerSeat: 'neutral' });
    expect(table(client).spiceReserveControls).toBeUndefined();
    expect(table(client).deckControls).toBeUndefined();
  });

  test('a rejected phase correction does not cancel the active carry', async () => {
    const { client, source, carried } = await grantedWholeCarry();
    socket().deliver(carried);
    client.command({ kind: 'phase', direction: -1 });
    socket().deliver({ type: 'rejected', requestId: command().commandId, message: 'Already at Turn 1.' });
    expect(table(client).gestureActivePieceId).toBe(source.id);
    expect(table(client).state.draftMove?.pieceId).toBe(source.id);
    expect(client.getSnapshot().error).toBe('Already at Turn 1.');
  });

  test('counts only the Traitor gathers of this viewer that the table completed (#1635)', async () => {
    const client = await connected();
    const empty = initialSnapshot();
    const deck = empty.table.pieces.find((piece) => piece.id === 'treachery-deck')!;
    const snapshot = {
      ...empty,
      table: {
        ...empty.table,
        pieces: [...empty.table.pieces, { ...deck, id: 'traitors', stackKey: 'cards:traitor' }],
      },
    };
    client.command({ kind: 'traitors-gather' });
    socket().deliver(view({ sequence: 2, completedCommandId: command().commandId }));
    expect(table(client).traitorsGathered).toBe(0);

    authorize(snapshot);
    client.command({ kind: 'traitors-gather' });
    const first = command().commandId;
    client.command({ kind: 'traitors-gather' });
    socket().deliver({ type: 'rejected', requestId: command().commandId, message: 'The table changed.' });
    socket().deliver(view({ snapshot, sequence: 3, completedCommandId: 'another-command' }));
    expect(table(client).traitorsGathered).toBe(0);
    socket().deliver(view({ snapshot, sequence: 4, completedCommandId: first }));
    expect(table(client).traitorsGathered).toBe(1);
  });

  test('a held carry survives unrelated views until its drop is acknowledged', async () => {
    const { client, source, carried } = await grantedWholeCarry();
    const updatedView = {
      ...carried,
      snapshot: nextSnapshot(
        carried.snapshot,
        flipPieceInState(tableForViewer(carried.snapshot, 'atreides'), 'treachery-deck')
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

  test('a drop completed through a resync keeps its position until the fresh view', async () => {
    const { client, source, carried } = await grantedWholeCarry();
    socket().deliver(carried);
    expect(dropThroughResync(client, source.id)).toEqual({
      duringResync: dropPosition,
      afterView: dropPosition,
      draftMove: null,
    });
  });

  test('an ungranted drop completed through a resync keeps its position until the fresh view', async () => {
    const client = await connected();
    client.beginGesture('harkonnen-force-stack', 'whole');
    expect(dropThroughResync(client, 'harkonnen-force-stack')).toEqual({
      duringResync: dropPosition,
      afterView: dropPosition,
      draftMove: null,
    });
  });

  test('a drop released while the table resynchronizes goes out once the fresh view arrives', async () => {
    const { client, carried } = await grantedWholeCarry();
    socket().deliver(carried);
    deliverGap();
    client.finishGesture(dropPosition);
    expect(socket().sent.some((message) => message.type === 'drop')).toBe(false);
    socket().deliver({ ...carried, sequence: 9 });
    const drop = socket().sent.find((message) => message.type === 'drop');
    expect(drop).toMatchObject({ position: dropPosition });
    expect(table(client).gestureActivePieceId).toBeNull();
    socket().deliver({ ...carried, sequence: 10 });
    socket().deliver({ type: 'update', epoch: 'epoch-one', baseSequence: 10, sequence: 11, activity: noActivity });
    expect(sentDrops()).toHaveLength(1);
  });

  test('a drop released during a resync is not sent when the fresh view no longer holds its carry', async () => {
    const { client, carried } = await grantedWholeCarry();
    socket().deliver(carried);
    deliverGap();
    client.finishGesture(dropPosition);
    socket().deliver({ ...carried, sequence: 9, carries: [] });
    expect(sentDrops()).toHaveLength(0);
    expect(table(client).gestureActivePieceId).toBeNull();
    expect(client.getSnapshot().error).toBe('The table paused while you held a piece. Pick it up again to continue.');
  });

  test('a drop released during a resync is not sent when the fresh view comes from a resumed room', async () => {
    const { client, carried } = await grantedWholeCarry();
    socket().deliver(carried);
    deliverGap();
    client.finishGesture(dropPosition);
    socket().deliver({ ...carried, sequence: 9, epoch: 'epoch-two' });
    expect(sentDrops()).toHaveLength(0);
    expect(table(client).gestureActivePieceId).toBeNull();
    expect(client.getSnapshot().error).toBe('The room resumed. Pick up the piece again to continue.');
  });

  test('a drop flushed after a resync that the Worker rejects clears the carry and shows why', async () => {
    const { client, carried } = await grantedWholeCarry();
    socket().deliver(carried);
    deliverGap();
    client.finishGesture(dropPosition);
    socket().deliver({ ...carried, sequence: 9 });
    const [drop] = sentDrops();
    if (!drop) {
      throw new Error('The drop was not sent.');
    }
    socket().deliver({ type: 'rejected', requestId: drop.commandId, message: 'The table changed.' });
    expect(table(client).state.draftMove).toBeNull();
    expect(socket().sent.some((message) => message.type === 'cancel')).toBe(true);
    expect(client.getSnapshot().error).toBe('The table changed.');
  });

  test('a drop still waiting on a resync when the connection drops asks the player to pick the piece up again', async () => {
    const { client, carried } = await grantedWholeCarry();
    socket().deliver(carried);
    deliverGap();
    client.finishGesture(dropPosition);
    socket().close(1006);
    await vi.advanceTimersByTimeAsync(1000);
    socket().open();
    authorize();
    expect(sentDrops()).toHaveLength(0);
    expect(client.getSnapshot().error).toBe('The table paused while you held a piece. Pick it up again to continue.');
  });

  test('a piece put back while the table resynchronizes is released on the Worker too', async () => {
    const { client, carried } = await grantedWholeCarry();
    socket().deliver(carried);
    deliverGap();
    const begin = socket().sent.find((message) => message.type === 'begin');
    client.cancelDraft();
    expect(table(client).state.draftMove).toBeNull();
    expect(socket().sent.at(-1)).toEqual({ type: 'cancel', carryId: begin?.carryId });
  });

  test('hiding the page while the table resynchronizes releases the held piece on the Worker', async () => {
    const { carried } = await grantedWholeCarry();
    socket().deliver(carried);
    deliverGap();
    for (const listener of hidden) {
      listener();
    }
    expect(socket().sent.at(-1)).toMatchObject({ type: 'cancel' });
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

  test('playback offers the checkpoints the live game saves while a viewer sits at the last one', async () => {
    const client = await connected();
    client.requestHistory(2);
    socket().deliver({ type: 'history', step: 2, lastStep: 2, snapshot: initialSnapshot() });
    expect(table(client).playback).toEqual({ step: 2, lastStep: 2 });
    socket().deliver(view({ snapshot: { ...initialSnapshot(), revision: 4, phase: 2 }, historySteps: 3 }));
    expect(table(client).playback).toEqual({ step: 2, lastStep: 3 });
  });

  test('playback takes the live checkpoint total from updates, and an update without one keeps it', async () => {
    const client = await connected();
    socket().deliver(view({ sequence: 1 }));
    client.requestHistory(2);
    socket().deliver({ type: 'history', step: 2, lastStep: 2, snapshot: initialSnapshot() });
    socket().deliver({
      type: 'update',
      epoch: 'epoch-one',
      baseSequence: 1,
      sequence: 2,
      historySteps: 4,
      activity: noActivity,
    });
    expect(table(client).playback).toEqual({ step: 2, lastStep: 4 });
    socket().deliver({ type: 'update', epoch: 'epoch-one', baseSequence: 2, sequence: 3, activity: noActivity });
    expect(table(client).playback).toEqual({ step: 2, lastStep: 4 });
  });

  test('a refused history read stops loading and keeps the checkpoint the viewer was on', async () => {
    const client = await connected();
    client.requestHistory(1);
    socket().deliver({ type: 'history', step: 1, lastStep: 2, snapshot: initialSnapshot() });
    client.requestHistory(3);
    expect(table(client).historyPending).toBe(true);
    socket().deliver({ type: 'rejected', requestId: 'message', message: 'Unknown history step.' });
    expect(table(client).historyPending).toBe(false);
    expect(table(client).playback).toEqual({ step: 1, lastStep: 2 });
    expect(client.getSnapshot().error).toBe('Unknown history step.');
  });

  test('retains the pending flip gate through acceptance and animation completion', async () => {
    const client = await connected();
    const snapshot = table(client).snapshot;
    client.flipSelected('treachery-deck');
    client.finishPieceFlip('treachery-deck', 0);
    client.flipSelected('treachery-deck');
    expect(socket().sent.filter((message) => message.type === 'command')).toHaveLength(1);
    const committed = nextSnapshot(snapshot, flipPieceInState(tableForViewer(snapshot, 'harkonnen'), 'treachery-deck'));
    socket().deliver(view({ snapshot: committed, completedCommandId: command().commandId }));
    client.flipSelected('treachery-deck');
    expect(socket().sent.filter((message) => message.type === 'command')).toHaveLength(1);
    client.finishPieceFlip('treachery-deck', 1);
    client.flipSelected('treachery-deck');
    expect(socket().sent.filter((message) => message.type === 'command')).toHaveLength(2);
  });

  test('a flip holds only its own piece, and only the revision it animates releases it', async () => {
    const client = await connected();
    const flips = () =>
      socket().sent.flatMap((message) =>
        message.type === 'command' && message.action.kind === 'flip' ? [message.action.pieceId] : []
      );
    const snapshot = table(client).snapshot;
    client.selectPiece('treachery-deck');
    client.flipSelected();
    const deckFlip = command().commandId;
    client.flipSelected();
    client.flipSelected('harkonnen-force-stack');
    const stackFlip = command().commandId;
    expect(flips()).toEqual(['treachery-deck', 'harkonnen-force-stack']);
    const deckFlipped = nextSnapshot(
      snapshot,
      flipPieceInState(tableForViewer(snapshot, 'harkonnen'), 'treachery-deck')
    );
    socket().deliver(view({ snapshot: deckFlipped, completedCommandId: deckFlip }));
    const bothFlipped = nextSnapshot(
      deckFlipped,
      flipPieceInState(tableForViewer(deckFlipped, 'harkonnen'), 'harkonnen-force-stack')
    );
    socket().deliver(view({ snapshot: bothFlipped, completedCommandId: stackFlip }));
    for (const stale of [0, 2]) {
      client.finishPieceFlip('treachery-deck', stale);
    }
    client.finishPieceFlip('harkonnen-force-stack', 1);
    expect([...table(client).flippingPieceIds]).toEqual([['treachery-deck', 1]]);
    client.flipSelected();
    client.flipSelected('harkonnen-force-stack');
    expect(flips()).toEqual(['treachery-deck', 'harkonnen-force-stack', 'harkonnen-force-stack']);
  });

  test('rejection releases a pending flip without changing saved state', async () => {
    const client = await connected();
    client.flipSelected('treachery-deck');
    socket().deliver({ type: 'rejected', requestId: command().commandId, message: 'The table changed.' });
    expect(table(client).snapshot.revision).toBe(0);
    client.flipSelected('treachery-deck');
    expect(socket().sent.filter((message) => message.type === 'command')).toHaveLength(2);
  });

  test('a flip completed through a resync releases its gate', async () => {
    const client = await connected();
    const snapshot = table(client).snapshot;
    client.flipSelected('treachery-deck');
    deliverGap(command().commandId);
    const committed = nextSnapshot(snapshot, flipPieceInState(tableForViewer(snapshot, 'harkonnen'), 'treachery-deck'));
    socket().deliver(view({ snapshot: committed, sequence: 9 }));
    client.finishPieceFlip('treachery-deck', 1);
    expect(table(client).flippingPieceIds.has('treachery-deck')).toBe(false);
    client.flipSelected('treachery-deck');
    expect(socket().sent.filter((message) => message.type === 'command')).toHaveLength(2);
  });

  test('a held piece does not hold back a seat command', async () => {
    const { client, carried } = await grantedWholeCarry();
    socket().deliver(carried);
    client.command({ kind: 'seat-depart' });
    const first = command();
    expect(first.action).toEqual({ kind: 'seat-depart' });
    client.command({ kind: 'seat-depart' });
    expect(command()).toBe(first);
    socket().deliver({ ...carried, completedCommandId: first.commandId });
    client.command({ kind: 'seat-depart' });
    expect(command()).not.toBe(first);
  });

  test('an approval refused because its request is settled approves nothing else', async () => {
    const client = await connected();
    client.command({ kind: 'seat-approve', requestId: 'seat-request-1' });
    const sent = command();
    expect(sent.action).toEqual({ kind: 'seat-approve', requestId: 'seat-request-1' });
    socket().deliver({
      type: 'rejected',
      requestId: sent.commandId,
      message: 'That seat request has already been resolved.',
    });
    expect(socket().sent.filter((message) => message.type === 'command')).toHaveLength(1);
    expect(table(client).seatCommandPending).toBe(false);
    expect(client.getSnapshot().error).toBe('That seat request has already been resolved.');
  });

  test('a competing carry and a pointer stay on a clock 9 s fast until the Worker removes them', async () => {
    const client = await connected();
    socket().deliver(view({ sequence: 1 }));
    const source = table(client).snapshot.table.pieces.find((piece) => piece.id === 'harkonnen-force-stack');
    if (!source) {
      throw new Error('Missing troop fixture.');
    }
    client.beginGesture(source.id, 'whole');
    socket().deliver({
      type: 'update',
      epoch: 'epoch-one',
      baseSequence: 1,
      sequence: 2,
      activity: {
        ...noActivity,
        pointers: [{ ...viewer, connectionId: 'other', position: [0, 0.38, 0], updatedAt: Date.now() }],
        carries: [
          {
            ...viewer,
            connectionId: 'other',
            id: 'other-carry',
            held: { ...source, position: [1, 0.38, 1] },
            withdrawnCounts: { [source.id]: source.items.length },
            reservedIds: [source.id],
            expiresAt: Date.now() + 8000,
          },
        ],
      },
    });
    expect(table(client).state.draftMove).toBeNull();
    vi.setSystemTime(Date.now() + 9000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(table(client).renderedPieces.filter((piece) => piece.id === source.id)).toHaveLength(1);
    expect(table(client).renderedPieces.find((piece) => piece.id === source.id)?.position).toEqual([1, 0.38, 1]);
    expect(table(client).reservedPieceIds.has(source.id)).toBe(true);
    expect(client.getPointers()).toHaveLength(1);
    socket().deliver({
      type: 'update',
      epoch: 'epoch-one',
      baseSequence: 2,
      sequence: 3,
      activity: { ...noActivity, removedPointers: ['other'], removedCarries: ['other-carry'] },
    });
    expect(table(client).reservedPieceIds.size).toBe(0);
    expect(table(client).renderedPieces.find((piece) => piece.id === source.id)?.position).toEqual(source.position);
    expect(client.getPointers()).toHaveLength(0);
  });

  test('a clock 60 s fast keeps the own granted carry until a Worker frame no longer holds it', async () => {
    const { client, source, carried } = await grantedWholeCarry();
    socket().deliver(carried);
    vi.setSystemTime(Date.now() + 60_000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(table(client).gestureActivePieceId).toBe(source.id);
    expect(socket().sent.filter((message) => message.type === 'renew')).toHaveLength(3);
    expect(socket().sent.some((message) => message.type === 'cancel')).toBe(false);
    socket().deliver({
      type: 'update',
      epoch: 'epoch-one',
      baseSequence: 1,
      sequence: 2,
      activity: { ...noActivity, removedCarries: carried.carries.map((carry) => carry.id) },
    });
    expect(table(client).gestureActivePieceId).toBeNull();
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
    for (const listener of hidden) {
      listener();
    }
    expect(table(client).state.draftMove).toBeNull();
    expect(socket().sent).toContainEqual(expect.objectContaining({ type: 'pointer', position: null }));
    expect(socket().sent).toContainEqual(expect.objectContaining({ type: 'cancel' }));
  });
});

test('compact update gaps pause commands until a full resync restores the table', async () => {
  const client = await connected();
  const snapshot = initialSnapshot();
  socket().deliver(view({ sequence: 1, snapshot }));
  /* A view asks for nothing, so the admission is the only message before the gap. */
  expect(socket().sent).toEqual([{ type: 'admit', ticket: 'a'.repeat(64) }]);
  deliverGap();
  expect(socket().sent.at(-1)).toEqual({ type: 'sync' });
  expect(table(client).canInteract).toBe(false);
  const sent = socket().sent.length;
  client.command({ kind: 'phase' });
  expect(socket().sent).toHaveLength(sent);
  socket().deliver(view({ sequence: 5, snapshot }));
  expect(table(client).canInteract).toBe(true);
  socket().deliver({
    type: 'update',
    epoch: 'epoch-one',
    baseSequence: 5,
    sequence: 6,
    activity: {
      ...noActivity,
      pointers: [
        {
          connectionId: 'other',
          viewerSeat: 'neutral',
          displayName: 'Observer',
          color: '#000',
          position: [1, 0, 0],
          updatedAt: Date.now(),
        },
      ],
    },
  });
  expect(client.getPointers()).toHaveLength(1);
  expect(table(client).snapshot).toEqual(snapshot);

  const spectator = { ...viewer, viewerSeat: 'neutral' };
  socket().deliver(view({ sequence: 1, snapshot, viewer: spectator }));
  deliverGap();
  const paused = socket().sent.length;
  client.command({ kind: 'seat-request' });
  expect(socket().sent).toHaveLength(paused);
  expect(client.getSnapshot().error).toBeNull();
  socket().deliver(view({ sequence: 9, snapshot, viewer: spectator }));
  client.command({ kind: 'seat-request' });
  expect(command().action).toEqual({ kind: 'seat-request' });
});

describe('private spice reserves and public transfers', () => {
  test('applies own-spice-reserve deltas and discards private playback when the current faction changes', async () => {
    const client = await connected();
    const initial = { ...initialSnapshot(), bank: { factionId: 'harkonnen', balance: 37 } };
    socket().deliver(view({ sequence: 0, snapshot: initial }));
    client.command({ kind: 'bank-withdraw', amount: 1 });
    expect(command().action).toEqual({ kind: 'bank-withdraw', amount: 1 });
    socket().deliver({
      type: 'update',
      epoch: 'epoch-one',
      baseSequence: 0,
      sequence: 1,
      activity: noActivity,
      snapshot: {
        baseRevision: 0,
        revision: 1,
        phase: 0,
        bank: { factionId: 'harkonnen', balance: 36 },
        table: {},
        pieces: [],
        removedPieces: [],
        versions: {},
        removedVersions: [],
      },
    });
    expect(table(client).snapshot.bank?.balance).toBe(36);
    client.requestHistory(0);
    socket().deliver({ type: 'history', step: 0, lastStep: 1, snapshot: initial });
    expect(table(client).snapshot.bank?.balance).toBe(37);
    authorize({ ...initialSnapshot(), revision: 1 }, { ...viewer, viewerSeat: 'neutral' });
    expect(table(client).snapshot).not.toHaveProperty('bank');
    expect(table(client).canInteract).toBe(false);
    socket().deliver({ type: 'history', step: 0, lastStep: 1, snapshot: initial });
    expect(table(client).snapshot).not.toHaveProperty('bank');
  });

  test('ignores old transfer pages after changing the requested page or returning to live', async () => {
    const client = await connected({ ...viewer, viewerSeat: 'neutral' });
    client.readSpiceHistory(20);
    expect(socket().sent.at(-1)).toEqual({ type: 'spice-history', before: 20 });
    client.readSpiceHistory(10);
    socket().deliver({ type: 'spice-history', before: 20, entries: [], more: true });
    expect(client.getSnapshot().spiceHistory).toBeUndefined();
    socket().deliver({ type: 'spice-history', before: 10, entries: [], more: false });
    expect(client.getSnapshot().spiceHistory?.before).toBe(10);
    client.readSpiceHistory();
    socket().deliver({ type: 'spice-history', before: 10, entries: [], more: false });
    expect(client.getSnapshot().spiceHistory).toBeUndefined();
  });
});

function battleTable() {
  const plan = emptyBattlePlan(fixtureBattleFaces('harkonnen'));
  const snapshot: GameSnapshot = {
    ...initialSnapshot(),
    phase: 6,
    battlePlan: plan,
    battle: {
      id: 'battle-one',
      anchor: [0, 0, 0],
      territory: 'Marked territory',
      stage: 'preparing',
      deadline: null,
      sides: [{ factionId: 'harkonnen', ready: false, choice: null }, null],
    },
  };
  return { plan, snapshot };
}

test('serializes quick private plan edits and waits for their acknowledgment before Ready', async () => {
  const client = await connected();
  const { plan, snapshot } = battleTable();
  authorize(snapshot);
  const index = socket().sent.length;
  client.editBattlePlan({ adjustment: -0.25 });
  const first = command();
  client.editBattlePlan({ troops: [{ faceId: 'harkonnen-front', undialed: 12, dialed: 0 }] });
  client.editBattlePlan({ cardIds: ['card-one', 'card-two'] });
  client.command({ kind: 'battle-ready', battleId: 'battle-one', ready: true });
  expect(
    socket()
      .sent.slice(index)
      .filter((message) => message.type === 'command')
  ).toHaveLength(1);
  expect(table(client).snapshot.battlePlan?.troops[0].undialed).toBe(12);
  const afterFirst = { ...snapshot, revision: 1, battlePlan: { ...plan, adjustment: -0.25 } };
  socket().deliver(view({ snapshot: afterFirst, completedCommandId: first.commandId }));
  const second = command();
  expect(second.expectedRevision).toBe(1);
  expect(second.action).toMatchObject({
    kind: 'battle-plan',
    plan: {
      adjustment: -0.25,
      cardIds: ['card-one', 'card-two'],
      troops: [{ faceId: 'harkonnen-front', undialed: 12, dialed: 0 }],
    },
  });
  if (second.action.kind !== 'battle-plan') {
    throw new Error('Expected queued plan.');
  }
  socket().deliver(
    view({
      snapshot: { ...afterFirst, revision: 2, battlePlan: { ...plan, ...second.action.plan } },
      completedCommandId: second.commandId,
    })
  );
  expect(command()).toMatchObject({
    expectedRevision: 2,
    action: { kind: 'battle-ready', battleId: 'battle-one', ready: true },
  });
});

test('sends a battle plan edit queued before a resync once the fresh view arrives', async () => {
  const client = await connected();
  const { plan, snapshot } = battleTable();
  authorize(snapshot);
  client.editBattlePlan({ adjustment: -0.25 });
  const first = command();
  client.editBattlePlan({ adjustment: 4 });
  deliverGap(first.commandId);
  socket().deliver(
    view({
      snapshot: { ...snapshot, revision: 1, battlePlan: { ...plan, adjustment: -0.25 } },
      sequence: 9,
    })
  );
  expect(command()).toMatchObject({ expectedRevision: 1, action: { kind: 'battle-plan', plan: { adjustment: 4 } } });
  expect(table(client).snapshot.battlePlan?.adjustment).toBe(4);
});

test('discards a paused battle edit when another battle replaces its target', async () => {
  const client = await connected();
  const { plan, snapshot } = battleTable();
  authorize(snapshot);
  client.editBattlePlan({ adjustment: -0.25 });
  const first = command();
  client.editBattlePlan({ adjustment: 4 });
  client.command({ kind: 'battle-ready', battleId: 'battle-one', ready: true });
  client.requestHistory(0);
  socket().deliver({ type: 'history', step: 0, lastStep: 1, snapshot });
  socket().deliver(
    view({
      snapshot: { ...snapshot, revision: 1, battlePlan: { ...plan, adjustment: -0.25 } },
      completedCommandId: first.commandId,
    })
  );
  socket().deliver(view({ snapshot: { ...snapshot, revision: 2, battle: { ...snapshot.battle!, id: 'battle-two' } } }));
  const index = socket().sent.length;
  client.resumeLive();
  expect(
    socket()
      .sent.slice(index)
      .filter((message) => message.type === 'command')
  ).toHaveLength(0);
  expect(table(client).snapshot.battlePlan?.adjustment).toBe(0);
});

describe('fresh reconnect recovery', () => {
  test.each([false, true])(
    'discards an uncertain drop, accepts the saved server position and asks the player to check it, committed: %s',
    async (committed) => {
      const { client, source } = await grantedWholeCarry();
      const snapshot = table(client).snapshot;
      const position: [number, number, number] = [1, 0.38, 1];
      client.finishGesture(position);
      const old = socket();
      expect(old.sent.some((message) => message.type === 'drop')).toBe(true);
      old.close(1006);
      expectLocked(client);
      await vi.advanceTimersByTimeAsync(1000);
      socket().open();
      const saved = committed
        ? {
            ...snapshot,
            revision: snapshot.revision + 1,
            table: {
              ...snapshot.table,
              pieces: snapshot.table.pieces.map((piece) => (piece.id === source.id ? { ...piece, position } : piece)),
            },
          }
        : snapshot;
      authorize(saved);
      expect(table(client).state.draftMove).toBeNull();
      expect(table(client).renderedPieces.find((piece) => piece.id === source.id)?.position).toEqual(
        committed ? position : source.position
      );
      expect(socket().sent).toEqual([{ type: 'admit', ticket: 'a'.repeat(64), replaces: 'connection-one' }]);
      expect(client.getSnapshot().error).toBe('The connection dropped as you placed a piece. Check where it landed.');
    }
  );

  test('says a piece held through a paused connection went back, after the fresh view (#1696)', async () => {
    const { client, source } = await grantedWholeCarry();
    const snapshot = table(client).snapshot;
    client.updateGesture([1, 0.38, 1]);
    socket().close(1006);
    await vi.advanceTimersByTimeAsync(1000);
    socket().open();
    authorize(snapshot);
    expect(table(client).state.draftMove).toBeNull();
    expect(table(client).renderedPieces.find((piece) => piece.id === source.id)?.position).toEqual(source.position);
    expect(client.getSnapshot().error).toBe('The table paused while you held a piece. Pick it up again to continue.');
  });

  test('asks the player to check a drop sent just before the room restarted', async () => {
    const { client } = await grantedWholeCarry();
    const snapshot = table(client).snapshot;
    client.finishGesture([1, 0.38, 1]);
    socket().deliver(view({ snapshot, epoch: 'epoch-two' }));
    expect(table(client).state.draftMove).toBeNull();
    expect(client.getSnapshot().error).toBe('The room resumed as you placed a piece. Check where it landed.');
  });

  test('says nothing about a drop the server confirmed before the connection dropped', async () => {
    const { client, source } = await grantedWholeCarry();
    const saved = table(client).snapshot;
    client.finishGesture(dropPosition);
    const drop = socket().sent.find((message) => message.type === 'drop');
    deliverGap(drop?.commandId ?? '');
    socket().close(1006);
    await vi.advanceTimersByTimeAsync(1000);
    socket().open();
    const pieces = saved.table.pieces.map((piece) =>
      piece.id === source.id ? { ...piece, position: dropPosition } : piece
    );
    authorize({ ...saved, revision: saved.revision + 1, table: { ...saved.table, pieces } });
    expect(table(client).state.draftMove).toBeNull();
    expect(client.getSnapshot().error).toBeNull();
  });
});

describe('pointer moves', () => {
  const other = {
    connectionId: 'other',
    viewerSeat: 'atreides',
    displayName: 'Two',
    color: '#000',
    position: [1, 0, 0],
    updatedAt: 1,
  } satisfies ActivityChange['pointers'][number];
  const pointerUpdate = (sequence: number, activity: Partial<ActivityChange>) =>
    socket().deliver({
      type: 'update',
      epoch: 'epoch-one',
      baseSequence: sequence - 1,
      sequence,
      activity: { ...noActivity, ...activity },
    });

  /* Another player holding the Harkonnen stack. */
  const otherCarry = (client: TableSession) => {
    const source = table(client).snapshot.table.pieces.find((piece) => piece.id === 'harkonnen-force-stack')!;
    const carry = {
      ...viewer,
      connectionId: 'other',
      id: 'other-carry',
      held: { ...source, position: [1, 0.38, 1] },
      withdrawnCounts: { [source.id]: source.items.length },
      reservedIds: [source.id],
      expiresAt: Date.now() + 8000,
    } satisfies ActivityChange['carries'][number];
    return { source, carry };
  };

  test("another player's pointer moving leaves the table as it was and tells only the pointer listeners", async () => {
    const client = await connected();
    socket().deliver(view({ sequence: 1 }));
    pointerUpdate(2, { pointers: [other] });
    const before = client.getSnapshot();
    const tableListener = vi.fn();
    const pointerListener = vi.fn();
    client.subscribe(tableListener);
    client.subscribePointers(pointerListener);

    pointerUpdate(3, { pointerMoves: [{ connectionId: 'other', position: [2, 0, 0], updatedAt: 2 }] });

    expect(client.getSnapshot()).toBe(before);
    expect(tableListener).not.toHaveBeenCalled();
    expect(pointerListener).toHaveBeenCalledTimes(1);
    expect(client.getPointers()).toMatchObject([{ connectionId: 'other', position: [2, 0, 0] }]);
  });

  test('a pointer that moves with a carried piece still updates the table', async () => {
    const client = await connected();
    socket().deliver(view({ sequence: 1 }));
    const { source, carry } = otherCarry(client);
    pointerUpdate(2, { pointers: [other], carries: [carry] });
    const before = client.getTable();

    pointerUpdate(3, {
      pointerMoves: [{ connectionId: 'other', position: [2, 0, 0], updatedAt: 2 }],
      carryMoves: [{ id: 'other-carry', position: [2, 0.38, 2], orientation: 0, expiresAt: Date.now() + 8000 }],
    });

    expect(client.getTable()).not.toBe(before);
    expect(table(client).renderedPieces.find((piece) => piece.id === source.id)?.position).toEqual([2, 0.38, 2]);
  });

  test('a carried piece moving updates the scene and leaves the panels as they are', async () => {
    const client = await connected();
    socket().deliver(view({ sequence: 1 }));
    const { source, carry } = otherCarry(client);
    pointerUpdate(2, { carries: [carry] });
    expect(client.getSnapshot().table?.reservedPieceIds.has(source.id)).toBe(true);
    const panels = client.getSnapshot();
    const panelListener = vi.fn();
    const sceneListener = vi.fn();
    client.subscribe(panelListener);
    client.subscribeTable(sceneListener);

    pointerUpdate(3, {
      carryMoves: [{ id: 'other-carry', position: [2, 0.38, 2], orientation: 0, expiresAt: Date.now() + 8000 }],
    });

    expect(client.getSnapshot()).toBe(panels);
    expect(panelListener).not.toHaveBeenCalled();
    expect(sceneListener).toHaveBeenCalledTimes(1);
    expect(table(client).renderedPieces.find((piece) => piece.id === source.id)?.position).toEqual([2, 0.38, 2]);

    pointerUpdate(4, { removedCarries: ['other-carry'] });

    expect(client.getSnapshot()).not.toBe(panels);
    expect(client.getSnapshot().table?.reservedPieceIds.size).toBe(0);
  });

  test('a table hearing only pointer moves still re-saves its kept copy, a few seconds apart', async () => {
    const tables = { read: () => null, save: vi.fn(), clear: vi.fn() };
    const client = new TableSession('fixture-one', ticket, { ...runtime, tables });
    disconnect = client.connect();
    await vi.advanceTimersByTimeAsync(0);
    socket().open();
    authorize(initialSnapshot(), viewer);
    socket().deliver(view({ sequence: 1 }));
    pointerUpdate(2, { pointers: [other] });
    const move = (sequence: number) =>
      pointerUpdate(sequence, {
        pointerMoves: [{ connectionId: 'other', position: [sequence, 0, 0], updatedAt: sequence }],
      });

    /* The pointer arriving was itself a pointer-only update, so it saved. */
    tables.save.mockClear();
    move(3);
    move(4);
    expect(tables.save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    move(5);
    expect(tables.save).toHaveBeenCalledTimes(1);
    expect(tables.save).toHaveBeenLastCalledWith('fixture-one', expect.anything(), true);
    expect(client.getPointers()).toMatchObject([{ position: [5, 0, 0] }]);
  });

  test("a pointer move does not hide the phase cooldown's end", async () => {
    const client = await connected();
    socket().deliver({ ...view({ sequence: 1 }), phaseCooldownMs: 1500 });
    expect(table(client).phaseCooling).toBe(true);
    pointerUpdate(2, { pointers: [other] });
    vi.advanceTimersByTime(1600);
    pointerUpdate(3, { pointerMoves: [{ connectionId: 'other', position: [2, 0, 0], updatedAt: 2 }] });
    expect(table(client).phaseCooling).toBe(false);
  });
});

describe('peeking', () => {
  const peeked = () => {
    const snapshot = initialSnapshot();
    const deck = snapshot.table.pieces.find((piece) => piece.id === 'treachery-deck')!;
    return { ...snapshot, bank: { factionId: 'harkonnen', balance: 20 }, peek: { piece: deck } };
  };
  const shownIds = (client: TableSession) => table(client).peek?.piece.items.map((item) => item.id);

  test('a rearranged deck shows the new order until the room refuses it, and takes one change at a time', async () => {
    const client = await connected();
    socket().deliver(view({ snapshot: peeked() }));
    const ids = shownIds(client)!;
    table(client).peekControls!.arrange('treachery-deck', [3, 2, 1, 0]);
    const arranged = command();
    expect(arranged.action).toEqual({ kind: 'peek-arrange', pieceId: 'treachery-deck', order: [3, 2, 1, 0] });
    expect(shownIds(client)).toEqual([...ids].reverse());

    /* Its places would count from an order the room does not hold yet. */
    const sent = socket().sent.length;
    table(client).peekControls!.arrange('treachery-deck', [1, 0, 2, 3]);
    table(client).peekControls!.pull('treachery-deck', 0);
    expect(socket().sent).toHaveLength(sent);

    socket().deliver({
      type: 'rejected',
      requestId: arranged.commandId,
      message: 'Unlock the deck before changing it.',
    });
    expect(shownIds(client)).toEqual(ids);
    table(client).peekControls!.pull('treachery-deck', 0);
    expect(command().action).toEqual({ kind: 'peek-pull', pieceId: 'treachery-deck', index: 0 });
  });

  test('the room sending the deck again replaces the order asked for', async () => {
    const client = await connected();
    const snapshot = peeked();
    socket().deliver(view({ snapshot }));
    table(client).peekControls!.arrange('treachery-deck', [3, 2, 1, 0]);
    const items = snapshot.peek.piece.items.map((item, index) => ({ ...item, id: `rekeyed-${index}` }));
    socket().deliver(
      view({ snapshot: { ...snapshot, revision: 1, peek: { piece: { ...snapshot.peek.piece, items } } } })
    );
    expect(shownIds(client)).toEqual(items.map((item) => item.id));
  });

  test('a peek held open when the game finishes can still be closed', async () => {
    const client = await connected();
    socket().deliver(
      view({
        snapshot: {
          ...peeked(),
          stage: 'finished',
          result: { kind: 'none', factionIds: [], by: { seat: 'harkonnen', name: 'One' }, declaredAt: 1 },
        },
      })
    );
    expect(table(client).peekControls).toBeUndefined();
    table(client).closePeek!();
    expect(command().action).toEqual({ kind: 'peek-close' });
  });
});
