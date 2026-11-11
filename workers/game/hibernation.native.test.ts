import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { PLAY_PROTOCOL_VERSION } from '../../src/shared/play/protocol';
import { dealt, draftingRuntime } from './native-drafting.fixture.ts';
import type { NativeConnection, NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import {
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  fixturePass,
  isFullView,
  openGame,
  provision,
  required,
  syncView,
} from './native-runtime.fixture.ts';

/* Moves the room's clock a minute on and waits for its sweep to stop. Returns the new clock offset. */
async function quiet(runtime: NativeRuntime, offset: number) {
  const next = offset + 61_000;
  await runtime.clock(next);
  await eventually(async () => !(await runtime.sweeping()), 'the sweep stopping');
  return next;
}

/* A quiet room hibernates between moves and wakes with its players still at the table (perf review #15). */
describe('GameRoom hibernation', () => {
  let peer: NativePeer;
  let runtime: NativeRuntime;
  beforeEach(async () => {
    peer = await createPeer();
    runtime = await createRuntime(peer, 'game');
    if ((await provision(runtime)).status !== 200) {
      throw new Error('The game did not provision.');
    }
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  const admissionStatuses = (connection: NativeConnection) =>
    connection.messages.flatMap((message) => (message.type === 'admission' ? [message.status] : []));

  const summaries = () =>
    runtime.logs.filter((log) => log.message.includes('game-room-summary')).map((log) => log.message);

  it.each([undefined, 1])(
    'requires a refresh when a hibernated socket remembers protocol %s',
    async (protocol) => {
      const player = await admitPlayer(runtime, 'a');
      await syncView(player);
      await quiet(runtime, 0);
      const query = protocol === undefined ? '' : `?version=${protocol}`;
      const response = await runtime.object('fixture-game', `/native-test/socket-protocol${query}`, { method: 'POST' });
      expect(response.status).toBe(204);
      await runtime.hibernateRoom();
      await runtime.sweeping();
      await eventually(() => player.closed, 'outdated socket closing after hibernation');
      expect(player.closeCode).toBe(4426);
      expect(player.outsideProtocol).toEqual([{ type: 'outdated-page' }]);
    },
    15_000
  );

  it('hibernates with a parked hand and gives its position to a rejoining player', async () => {
    const a = await admitPlayer(runtime, 'a');
    const b = await admitPlayer(runtime, 'b');
    await eventually(async () => !(await runtime.sweeping()), 'the sweep stopping');
    /* A quiet room sleeps at once: its unwritten summary waits in storage rather than keeping it awake. */
    expect(summaries()).toEqual([]);
    const before = await syncView(a);
    const previousConnection = (await syncView(b)).viewer.connectionId;
    a.send({ type: 'pointer', seq: 1, position: [1, 0.38, 0] });
    await b.message('update', (message) => message.activity.pointers.some((pointer) => pointer.position[0] === 1));
    await eventually(async () => !(await runtime.sweeping()), 'the sweep stopping with a visible hand');
    await runtime.clock(11_000);
    await runtime.hibernateRoom();

    const rejoined = await openGame(runtime);
    rejoined.send({
      type: 'admit',
      protocol: PLAY_PROTOCOL_VERSION,
      pass: await fixturePass('b'),
      replaces: previousConnection,
    });
    const view = await rejoined.message('view');
    expect(view.epoch).toBe(before.epoch);
    expect(view.pointers).toEqual([
      expect.objectContaining({ connectionId: before.viewer.connectionId, position: [1, 0.38, 0], sourceSeq: 1 }),
    ]);
    expect(a.closed).toBe(false);

    a.send({ type: 'pointer', seq: 0, position: null });
    await syncView(a);
    expect((await syncView(rejoined)).pointers).toHaveLength(1);
    a.send({ type: 'pointer', seq: 2, position: [2, 0.38, 0] });
    await rejoined.message('update', (message) =>
      message.activity.pointerMoves.some((pointer) => pointer.position[0] === 2)
    );
    a.send({ type: 'pointer', seq: 3, position: null });
    await rejoined.message('update', (message) =>
      message.activity.removedPointers.includes(before.viewer.connectionId)
    );

    a.send({ type: 'pointer', seq: 4, position: [3, 0.38, 0] });
    await rejoined.message('update', (message) =>
      message.activity.pointers.some((pointer) => pointer.position[0] === 3)
    );
    await eventually(async () => !(await runtime.sweeping()), 'the sweep stopping before disconnect');
    await runtime.hibernateRoom();
    const beforeClose = rejoined.messages.length;
    a.socket.close(1000);
    await eventually(
      () => rejoined.messages.slice(beforeClose).find((message) => isFullView(message) && !message.pointers.length),
      'the restored hand disappearing after its socket closes'
    );
  }, 20_000);

  it('writes the summary interval a hibernation interrupted, counting what came before it', async () => {
    const a = await admitPlayer(runtime, 'a');
    await syncView(a);
    const offset = await quiet(runtime, 0);
    await runtime.hibernateRoom();
    await runtime.clock(offset + 10 * 60_000);
    a.send({ type: 'pointer', seq: 0, position: [0, 0, 0] });
    const line = await eventually(
      () => summaries().find((message) => message.includes('interval')),
      'the interval line'
    );
    /* The admission and sync before the sleep count along with the pointer after it. */
    const messagesIn = Number(/messagesIn[^0-9]*(\d+)/.exec(line)?.[1]);
    expect(messagesIn).toBeGreaterThanOrEqual(3);
  }, 20_000);

  it('saves a Convex call that settles after its sweep stopped, so the woken room writes it', async () => {
    peer.seatLimitMode = 'hold';
    const a = await admitPlayer(runtime, 'a');
    const offset = await quiet(runtime, 0);
    const held = await eventually(
      () => peer.requests.find((request) => request.function === 'playAdmission:seatLimitReached'),
      'the held seat-limit read'
    );
    held.release({ ok: true, reached: false });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await runtime.hibernateRoom();
    await runtime.clock(offset + 10 * 60_000);
    a.send({ type: 'pointer', seq: 0, position: [0, 0, 0] });
    const line = await eventually(
      () => summaries().find((message) => message.includes('interval')),
      'the interval line'
    );
    expect(line).toContain('playAdmission:seatLimitReached');
  }, 20_000);

  it('closes its sockets for a reconnect into a new epoch when it restarts without having gone quiet', async () => {
    const a = await admitPlayer(runtime, 'a');
    await syncView(a);
    await quiet(runtime, 0);
    /* A deploy or crash restarts a room whose sweep ran, so the carries it held are gone. */
    await runtime.forgetQuiet();
    await runtime.hibernateRoom();
    await runtime.sweeping();
    await eventually(() => a.closed, 'the socket closing');
    expect(a.closeCode).toBe(1012);
  }, 20_000);

  it('keeps its players connected across a hibernation, and their next frame is a full view', async () => {
    const a = await admitPlayer(runtime, 'a');
    const b = await admitPlayer(runtime, 'b');
    const before = await syncView(a);
    await syncView(b);
    await quiet(runtime, 0);

    await runtime.hibernateRoom();
    expect(a.closed).toBe(false);
    expect(b.closed).toBe(false);

    const piece = before.snapshot.table.pieces[0];
    const received = b.messages.length;
    a.send({
      type: 'command',
      commandId: 'after-hibernation',
      action: { kind: 'rotate', pieceId: piece.id, direction: 1 },
      expectedRevision: before.snapshot.revision,
    });
    const answer = await a.message('view', (message) => message.completedCommandId === 'after-hibernation');
    expect(answer.snapshot.revision).toBe(before.snapshot.revision + 1);
    expect(answer.viewer).toMatchObject({ userId: 'user-a', viewerSeat: before.viewer.viewerSeat });
    /* The room lost its delivery baselines, so the other player's frame is a whole view rather than an update. */
    const peerFrame = await eventually(
      () => b.messages.slice(received).find((message) => message.type === 'view' || message.type === 'update'),
      'the other player hearing the move'
    );
    expect(isFullView(peerFrame)).toBe(true);
    expect(peerFrame.type === 'view' && peerFrame.snapshot.revision).toBe(before.snapshot.revision + 1);
    expect(admissionStatuses(a)).not.toContain('suspended');
    expect(admissionStatuses(b)).not.toContain('suspended');
  }, 20_000);

  it('keeps its epoch across a hibernation, so the page keeps the piece it picks up on waking', async () => {
    const a = await admitPlayer(runtime, 'a');
    const before = await syncView(a);
    await quiet(runtime, 0);

    await runtime.hibernateRoom();
    const received = a.messages.length;
    const piece = before.snapshot.table.pieces[0];
    a.send({
      type: 'begin',
      carryId: 'after-waking',
      sourcePieceId: piece.id,
      expectedVersion: before.snapshot.versions[piece.id] ?? 0,
      pickup: 'whole',
    });
    await a.message('carry', (message) => message.carryId === 'after-waking');
    const frames = await eventually(() => {
      const sent = a.messages.slice(received).filter((message) => message.type === 'view' || message.type === 'update');
      return sent.length ? sent : undefined;
    }, 'the frame carrying the pickup');
    for (const frame of frames) {
      expect(frame.epoch).toBe(before.epoch);
    }
  }, 20_000);

  it('goes on refusing a carry ID its connection used before the room slept', async () => {
    const a = await admitPlayer(runtime, 'a');
    const before = await syncView(a);
    const piece = before.snapshot.table.pieces[0];
    const begin = () =>
      a.send({
        type: 'begin',
        carryId: 'used-before-sleeping',
        sourcePieceId: piece.id,
        expectedVersion: before.snapshot.versions[piece.id] ?? 0,
        pickup: 'whole',
      });
    begin();
    await a.message('carry', (message) => message.carryId === 'used-before-sleeping');
    a.send({ type: 'cancel', carryId: 'used-before-sleeping' });
    await quiet(runtime, 0);

    await runtime.hibernateRoom();
    const received = a.messages.length;
    /* A delayed copy of the first pickup arrives after the wake. */
    begin();
    const answer = await eventually(
      () =>
        a.messages
          .slice(received)
          .find(
            (message) =>
              (message.type === 'carry' && message.carryId === 'used-before-sleeping') ||
              (message.type === 'rejected' && message.requestId === 'used-before-sleeping')
          ),
      'the replayed pickup answered'
    );
    expect(answer).toMatchObject({ type: 'rejected', message: 'That carry ID has ended. Start a new carry.' });
  }, 20_000);

  it('wakes on its alarm when a pass whose session ended runs out, and pauses that table', async () => {
    const a = await admitPlayer(runtime, 'a');
    const exp = Date.now() + 90_000;
    const b = await admitPlayer(runtime, 'b', { exp });
    await syncView(a);
    await syncView(b);
    const offset = await quiet(runtime, 0);
    /* With the sweep stopped, the alarm watches the next pass to expire. */
    await eventually(async () => (await runtime.alarm()).scheduledAt === exp, 'the pass expiry alarm');

    await runtime.hibernateRoom();
    await runtime.clock(offset + 30_000);
    await runtime.alarm(true);
    await eventually(() => admissionStatuses(b).includes('pass-expired'), 'the expired pass announced');
    expect(b.closed).toBe(false);
    expect(admissionStatuses(a)).not.toContain('pass-expired');
  }, 20_000);
});

describe('GameRoom hibernation in a real game', () => {
  let peer: NativePeer;
  let runtime: NativeRuntime;
  beforeEach(async () => {
    ({ peer, runtime } = await draftingRuntime([['emperor', 'Emperor']]));
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  it('sends its players the state a wake moved on to, as when trading closed while the room slept', async () => {
    const [a, b] = await dealt(runtime, 2, 'fremen');
    const before = await syncView(b);
    expect(required(before.snapshot.swapping).closed).toBe(false);
    await syncView(a);
    const offset = await quiet(runtime, 0);

    /* The clock moves past the trading deadline before the room sleeps, so nothing runs until the wake. */
    await runtime.clock(offset + 240_001);
    await runtime.hibernateRoom();
    const received = b.messages.length;
    /* Any request wakes the room, whose start closes the overdue trading before a handler runs. */
    await runtime.sweeping();
    const woken = await eventually(
      () => b.messages.slice(received).find((message) => message.type === 'view'),
      'the view of the closed trading'
    );
    expect(woken.type === 'view' && required(woken.snapshot.swapping).closed).toBe(true);
    expect(b.closed).toBe(false);
  }, 30_000);
});
