import { afterEach, beforeEach, expect, it } from 'vite-plus/test';

import { applyRoomUpdate } from '../../src/shared/play/updates.ts';
import { messageOf } from './native-runtime.fixture.ts';
import type { NativeMessage } from './native-runtime.fixture.ts';
import type { NativeConnection } from './native-runtime.fixture.ts';
import { required } from './native-runtime.fixture.ts';
import type { NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import {
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  fixturePass,
  isFullView,
  provision,
  syncView,
} from './native-runtime.fixture.ts';
import { storedSnapshotSchema } from './state';

/* Every card face in the game reaches every page by design, as a sorted list that ties no face to a card; the rest of a frame must not. */
const shown = (value: unknown) => JSON.stringify(value, (key, entry) => (key === 'cardFaces' ? undefined : entry));

let peer: NativePeer;
let runtime: NativeRuntime;
beforeEach(async () => {
  peer = await createPeer();
  runtime = await createRuntime(peer, 'game');
  await provision(runtime);
});
afterEach(async () => {
  await runtime?.close();
  await peer?.close();
});

it('coalesces a burst to the latest pointer while preserving an immediate committed snapshot', async () => {
  const connection = await admitPlayer(runtime, 'a');
  await connection.message('view');
  connection.messages.length = 0;
  const pointerCount = 20;
  const startedAt = performance.now();
  for (let seq = 0; seq < pointerCount; seq++) {
    connection.send({ type: 'pointer', seq, position: [seq, 0, 0] });
  }
  await connection.message('view', (message) => message.pointers[0]?.sourceSeq === pointerCount - 1);
  const windows = Math.max(1, Math.ceil((performance.now() - startedAt) / 50));
  /* Allow one scheduling boundary, while still requiring the burst to coalesce. */
  const maximum = Math.min(pointerCount - 1, windows + 1);
  expect(
    connection.messages.filter(
      (message): message is Extract<NativeMessage, { type: 'update' }> => message.type === 'update'
    ).length
  ).toBeLessThanOrEqual(maximum);
  connection.send({ type: 'command', commandId: 'phase', expectedRevision: 0, action: { kind: 'phase' } });
  expect(
    (await connection.message('view', (message) => message.completedCommandId === 'phase')).snapshot.revision
  ).toBe(1);
});

it('stamps its clock on every frame but admission', async () => {
  const connection = await admitPlayer(runtime, 'a');
  await connection.message('view');
  connection.send({ type: 'command', commandId: 'phase', expectedRevision: 0, action: { kind: 'phase' } });
  await connection.message(
    'update',
    (message): message is Extract<NativeMessage, { type: 'update' }> =>
      message.type === 'update' && message.completedCommandId === 'phase'
  );
  const stamped = connection.messages.filter((message) => message.type !== 'admission');
  expect(stamped.map((message) => message.type)).toEqual(expect.arrayContaining(['view', 'update']));
  for (const message of stamped) {
    expect(Math.abs(required(message.serverNow) - Date.now())).toBeLessThan(60_000);
  }
  for (const message of connection.messages.filter((candidate) => candidate.type === 'admission')) {
    expect(message).not.toHaveProperty('serverNow');
  }
});

it('supplies a full snapshot on resync between compact updates', async () => {
  const connection = await admitPlayer(runtime, 'a');
  const initial = await connection.message('view');
  expect((await syncView(connection)).sequence).toBeGreaterThan(required(initial.sequence));
  connection.send({ type: 'command', commandId: 'phase', expectedRevision: 0, action: { kind: 'phase' } });
  const update = await connection.message(
    'update',
    (message): message is Extract<NativeMessage, { type: 'update' }> =>
      message.type === 'update' && message.completedCommandId === 'phase'
  );
  expect(required(update.snapshot).baseRevision).toBe(0);
  expect(required(update.snapshot).revision).toBe(1);
  expect(JSON.stringify(update).length).toBeLessThan(JSON.stringify(initial).length / 2);
  const restored = await syncView(connection);
  expect(restored.snapshot.revision).toBe(1);
  expect(restored.sequence).toBeGreaterThan(update.sequence);
  expect(restored.snapshot.table.pieces).toEqual(initial.snapshot.table.pieces);
  expect(await eventually(() => !connection.closed, 'open connection')).toBe(true);
});

it('an admission takes one full view before its first patch', async () => {
  const connection = await admitPlayer(runtime, 'a');
  const initial = await connection.message('view');
  connection.send({ type: 'command', commandId: 'phase', expectedRevision: 0, action: { kind: 'phase' } });
  const result = await eventually(
    () =>
      connection.messages.find(
        (message): message is Extract<NativeMessage, { type: 'update' }> =>
          message.type === 'update' && message.completedCommandId === 'phase'
      ),
    'phase result'
  );
  expect(result.type).toBe('update');
  expect(result.baseSequence).toBe(required(initial.sequence));
  expect(connection.messages.filter(isFullView)).toHaveLength(1);
});

/* A joining socket has no baseline, so its full view is guarded by the suspended-socket case below, not here. */
it('announces a join to a synced peer as a compact update', async () => {
  const a = await admitPlayer(runtime, 'a');
  const synced = await syncView(a);
  const before = a.messages.length;
  const b = await admitPlayer(runtime, 'b');
  expect(
    required(
      required(
        required(b).messages.find(
          (message): message is Extract<NativeMessage, { type: 'view' }> => message.type === 'view'
        )
      ).snapshot.controls
    ).seats
  ).toEqual(['harkonnen', 'atreides']);
  const announced = await eventually(
    () => a.messages.slice(before).find((message) => message.type === 'update' || message.type === 'view'),
    'announce'
  );
  expect(announced.type).toBe('update');
  expect(required(required(announced.snapshot).controls).seats).toEqual(['harkonnen', 'atreides']);
  expect(required(required(applyRoomUpdate)(synced, messageOf(announced, 'update'))).snapshot).toEqual(
    (await syncView(a)).snapshot
  );
});

it('gives a socket paused for an expired pass a full view when a renewal resumes it', async () => {
  const connection = await admitPlayer(runtime, 'a', { exp: Date.now() + 60_000 });
  await syncView(connection);
  const beforeSuspension = connection.messages.length;
  await runtime.clock(70_000);
  await eventually(
    () =>
      connection.messages
        .slice(beforeSuspension)
        .some((message) => message.type === 'admission' && message.status === 'pass-expired'),
    'suspension'
  );
  const beforeRecovery = connection.messages.length;
  connection.send({ type: 'pass', pass: await fixturePass('a', { exp: Date.now() + 200_000 }) });
  const recovered = await eventually(
    () =>
      connection.messages.slice(beforeRecovery).find((message) => message.type === 'update' || message.type === 'view'),
    'recovery'
  );
  expect(recovered.type).toBe('view');
  expect(connection.closed).toBe(false);
});

it('keeps motion free of unchanged snapshots and still sends saved changes', async () => {
  const a = await admitPlayer(runtime, 'a');
  let view = await syncView(a);
  a.send({ type: 'pointer', seq: 1, position: [1, 0, 1] });
  const pointer = await a.message('update', (message) => message.activity.pointers.length > 0);
  expect(pointer.snapshot).toBeUndefined();
  view = required(applyRoomUpdate(view, pointer));
  expect(view.pointers).toEqual((await syncView(a)).pointers);
  view = await syncView(a);
  const pieceId = 'harkonnen-force-loose';
  a.send({
    type: 'begin',
    carryId: 'moving',
    sourcePieceId: pieceId,
    expectedVersion: view.snapshot.versions[pieceId],
    pickup: 'whole',
  });
  const begin = await a.message('update', (message) => message.activity.carries.length > 0);
  expect(begin.snapshot).toBeUndefined();
  view = required(applyRoomUpdate(view, begin));
  a.send({ type: 'pose', carryId: 'moving', seq: 1, position: [-4, 0.14, 0], orientation: 0 });
  const pose = await a.message('update', (message) => message.activity.carryMoves.length > 0);
  expect(pose.snapshot).toBeUndefined();
  view = required(applyRoomUpdate(view, pose));
  a.send({ type: 'drop', commandId: 'saved', carryId: 'moving', position: [-4, 0.14, 0], orientation: 0 });
  const dropped = await a.message('update', (message) => message.completedCommandId === 'saved');
  expect(required(dropped.snapshot).revision).toBe(1);
  view = required(applyRoomUpdate(view, dropped));
  const fresh = await syncView(a);
  expect(view.snapshot).toEqual(fresh.snapshot);
  expect(view.carries).toEqual(fresh.carries);
  expect(view.pointers).toEqual(fresh.pointers);
});

it('patches saved movement for a socket that admits and syncs without asking for it', async () => {
  const mover = await admitPlayer(runtime, 'a');
  const watcher = await admitPlayer(runtime, 'b');
  const baseline = await syncView(watcher);
  const pieceId = 'harkonnen-force-loose';
  mover.send({
    type: 'begin',
    carryId: 'saved-move',
    sourcePieceId: pieceId,
    expectedVersion: baseline.snapshot.versions[pieceId],
    pickup: 'whole',
  });
  await mover.message('carry');
  mover.send({
    type: 'drop',
    commandId: 'saved-move',
    carryId: 'saved-move',
    position: [-4, 0.14, 0],
    orientation: 90,
  });
  const revision = baseline.snapshot.revision + 1;
  const moved = await watcher.message('update', (message) => message.snapshot?.revision === revision);
  expect(required(moved.snapshot).pieces).toEqual([]);
  expect(required(required(moved.snapshot).pieceMoves).map((move) => move.id)).toEqual([pieceId]);
  const patched = await watcher.message('view', (message) => message.snapshot?.revision === revision);
  expect(patched.snapshot).toEqual((await syncView(watcher)).snapshot);
});

it('moves projected cards and replaces revealed artwork without retaining it after concealment or reconnect', async () => {
  const stored = storedSnapshotSchema.parse(
    JSON.parse((await runtime.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1'))[0].data)
  );
  const card = stored.table.pieces.find((piece) => piece.id === 'treachery-card-loose');
  required(card).items[0].faceUp = false;
  required(card).items[0].artwork = {
    front: 'https://example.test/private-front.png',
    back: 'https://example.test/back.png',
    name: 'Private card',
    type: 'treachery',
  };
  await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(stored)]);
  await runtime.restart();
  const players: NativeConnection[] = [];
  for (const suffix of ['a', 'b', 'c']) {
    players.push(await admitPlayer(runtime, suffix));
  }
  let views = await Promise.all(players.map(syncView));
  const hidden = (message: unknown) => {
    expect(shown(message)).not.toContain('private-front');
    expect(JSON.stringify(message)).not.toContain('Private card');
  };
  views.forEach(hidden);
  async function receive(
    predicate: (message: Extract<NativeMessage, { type: 'update' }>) => boolean,
    privateView = false
  ) {
    views = await Promise.all(
      players.map(async (connection, index) => {
        const update = await connection.message('update', predicate);
        if (privateView) {
          hidden(update);
        }
        const view = required(applyRoomUpdate(views[index], update));
        expect(view).not.toBeNull();
        return view;
      })
    );
  }
  players[0].send({
    type: 'begin',
    carryId: 'card-move',
    sourcePieceId: required(card).id,
    expectedVersion: views[0].snapshot.versions[required(card).id],
    pickup: 'whole',
  });
  await receive((message) => message.activity.carries.length > 0, true);
  players[0].send({
    type: 'drop',
    commandId: 'card-drop',
    carryId: 'card-move',
    position: [-8, 0.1, -8],
    orientation: 0,
  });
  await receive((message) => message.snapshot?.revision === 1, true);
  for (const connection of players) {
    const moved = await connection.message('update', (message) => message.snapshot?.revision === 1);
    expect(required(moved.snapshot).pieceMoves).toHaveLength(1);
  }
  for (const revision of [1, 2]) {
    await runtime.clock(revision * 2000);
    players[0].send({
      type: 'command',
      commandId: `flip-${revision}`,
      expectedRevision: revision,
      action: { kind: 'flip', pieceId: required(card).id },
    });
    const reply = await eventually(
      () =>
        players[0].messages.find(
          (message) =>
            ('completedCommandId' in message && message.completedCommandId === `flip-${revision}`) ||
            (message.type === 'rejected' && message.requestId === `flip-${revision}`)
        ),
      'flip result'
    );
    expect(reply.type, JSON.stringify(reply)).not.toBe('rejected');
    await receive((message) => message.snapshot?.revision === revision + 1, revision === 2);
    for (const view of views) {
      const artwork = required(required(view).snapshot.table.pieces.find((piece) => piece.id === required(card).id))
        .items[0].artwork;
      expect(required(artwork).front).toBe(revision === 1 ? 'https://example.test/private-front.png' : undefined);
    }
  }
  for (const [index, connection] of players.entries()) {
    const fresh = await syncView(connection);
    expect(views[index].snapshot).toEqual(fresh.snapshot);
    expect(views[index].carries).toEqual(fresh.carries);
    hidden(fresh);
  }
  players[2].socket.close();
  const reconnected = await admitPlayer(runtime, 'c');
  const restored = await syncView(reconnected);
  expect(restored.snapshot.table).toEqual(views[2].snapshot.table);
  hidden(restored);
}, 15_000);
