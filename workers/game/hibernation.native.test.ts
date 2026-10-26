import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { dealt, draftingRuntime } from './native-drafting.fixture.ts';
import type { NativeConnection, NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import {
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  isFullView,
  provision,
  required,
  syncView,
} from './native-runtime.fixture.ts';

/*
 * Moves the room's clock a minute on and waits for its sweep to stop: a quiet room keeps sweeping until its
 * pending summary line is a minute old. Returns the new clock offset.
 */
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

  it('stops its sweep once nothing can expire and its summary is written, and starts it again for a pointer', async () => {
    const a = await admitPlayer(runtime, 'a');
    const offset = await quiet(runtime, 0);
    expect(runtime.logs.some((log) => log.message.includes('game-room-summary') && log.message.includes('idle'))).toBe(
      true
    );
    a.send({ type: 'pointer', seq: 0, position: [0, 0, 0] });
    await eventually(() => runtime.sweeping(), 'the sweep starting for the pointer');
    /* The pointer lapses after three seconds, but its message waits in the summary for a minute. */
    await runtime.clock(offset + 3001);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await runtime.sweeping()).toBe(true);
    await quiet(runtime, offset);
    expect(a.closed).toBe(false);
  }, 15_000);

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

  it('pauses the table of a pass that ran out while the room slept once another player moves', async () => {
    const a = await admitPlayer(runtime, 'a');
    const b = await admitPlayer(runtime, 'b', { exp: Date.now() + 90_000 });
    const before = await syncView(a);
    await syncView(b);
    const offset = await quiet(runtime, 0);
    /* No battle runs and the directory is delivered, so nothing wakes the room on its own. */
    expect((await runtime.alarm()).scheduledAt).toBeNull();

    /* B's pass runs out while nothing runs, and the room sleeps. */
    await runtime.clock(offset + 30_000);
    await runtime.hibernateRoom();
    a.send({
      type: 'command',
      commandId: 'wakes-the-room',
      action: { kind: 'rotate', pieceId: before.snapshot.table.pieces[0].id, direction: 1 },
      expectedRevision: before.snapshot.revision,
    });
    await a.message('view', (message) => message.completedCommandId === 'wakes-the-room');
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
