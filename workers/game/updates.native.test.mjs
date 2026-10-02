import { afterEach, beforeEach, expect, it } from 'vitest';

import { applyRoomUpdate } from '../../src/shared/play/updates.ts';
import {
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  isFullView,
  openGame,
  provision,
  syncView,
} from './native-runtime.fixture.mjs';

let peer;
let runtime;
beforeEach(async () => {
  peer = await createPeer();
  peer.watchMode = 'allow';
  runtime = await createRuntime(peer, 'game');
  await provision(runtime);
});
afterEach(async () => {
  await runtime?.close();
  await peer?.close();
});

it('coalesces a burst to the latest pointer while preserving an immediate committed snapshot', async () => {
  const connection = await openGame(runtime);
  connection.send({ type: 'admit', ticket: 'c'.repeat(64) });
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
  expect(connection.messages.filter((message) => message.type === 'update').length).toBeLessThanOrEqual(maximum);
  connection.send({ type: 'command', commandId: 'phase', expectedRevision: 0, action: { kind: 'phase' } });
  expect(
    (await connection.message('view', (message) => message.completedCommandId === 'phase')).snapshot.revision
  ).toBe(1);
});

it('stamps its clock on every frame but admission', async () => {
  const connection = await openGame(runtime);
  connection.send({ type: 'admit', ticket: 'c'.repeat(64) });
  await connection.message('view');
  connection.send({ type: 'command', commandId: 'phase', expectedRevision: 0, action: { kind: 'phase' } });
  await connection.message('update', (message) => message.completedCommandId === 'phase');
  const stamped = connection.messages.filter((message) => message.type !== 'admission');
  expect(stamped.map((message) => message.type)).toEqual(expect.arrayContaining(['view', 'update']));
  for (const message of stamped) {
    expect(Math.abs(message.serverNow - Date.now())).toBeLessThan(60_000);
  }
  for (const message of connection.messages.filter((candidate) => candidate.type === 'admission')) {
    expect(message).not.toHaveProperty('serverNow');
  }
});

it('supplies a full snapshot on resync between compact updates', async () => {
  const connection = await openGame(runtime);
  connection.send({ type: 'admit', ticket: 'c'.repeat(64) });
  const initial = await connection.message('view');
  expect((await syncView(connection)).sequence).toBeGreaterThan(initial.sequence);
  connection.send({ type: 'command', commandId: 'phase', expectedRevision: 0, action: { kind: 'phase' } });
  const update = await connection.message('update', (message) => message.completedCommandId === 'phase');
  expect(update.snapshot.baseRevision).toBe(0);
  expect(update.snapshot.revision).toBe(1);
  expect(JSON.stringify(update).length).toBeLessThan(JSON.stringify(initial).length / 2);
  const restored = await syncView(connection);
  expect(restored.snapshot.revision).toBe(1);
  expect(restored.sequence).toBeGreaterThan(update.sequence);
  expect(restored.snapshot.table.pieces).toEqual(initial.snapshot.table.pieces);
  expect(await eventually(() => !connection.closed, 'open connection')).toBe(true);
});

it('an admission takes one full view before its first patch', async () => {
  const connection = await openGame(runtime);
  connection.send({ type: 'admit', ticket: 'c'.repeat(64) });
  const initial = await connection.message('view');
  connection.send({ type: 'command', commandId: 'phase', expectedRevision: 0, action: { kind: 'phase' } });
  const result = await eventually(
    () => connection.messages.find((message) => message.completedCommandId === 'phase'),
    'phase result'
  );
  expect(result.type).toBe('update');
  expect(result.baseSequence).toBe(initial.sequence);
  expect(connection.messages.filter(isFullView)).toHaveLength(1);
});

/* A joining socket has no baseline, so its full view is guarded by the suspended-socket case below, not here. */
it('announces a join to a synced peer as a compact update', async () => {
  const a = await admitPlayer(peer, runtime, 'a');
  const synced = await syncView(a);
  const before = a.messages.length;
  const b = await admitPlayer(peer, runtime, 'b');
  expect(b.messages.find((message) => message.type === 'view').snapshot.controls.seats).toEqual([
    'harkonnen',
    'atreides',
  ]);
  const announced = await eventually(
    () => a.messages.slice(before).find((message) => message.type === 'update' || message.type === 'view'),
    'announce'
  );
  expect(announced.type).toBe('update');
  expect(announced.snapshot.controls.seats).toEqual(['harkonnen', 'atreides']);
  expect(applyRoomUpdate(synced, announced).snapshot).toEqual((await syncView(a)).snapshot);
});

it('gives a suspended compact socket a full view when it is re-authorized', async () => {
  peer.watchMode = 'manual';
  const connection = await openGame(runtime);
  connection.send({ type: 'admit', ticket: 'c'.repeat(64) });
  const previous = await peer.query();
  peer.answer(previous);
  await connection.message('view');
  await syncView(connection);
  const beforeSuspension = connection.messages.length;
  previous.connection.socket.close(1012, 'controlled reconnect');
  await eventually(
    () =>
      connection.messages
        .slice(beforeSuspension)
        .some((message) => message.type === 'admission' && message.status === 'suspended'),
    'suspension'
  );
  const current = await peer.query(({ query }) => query.args[0].generation !== previous.query.args[0].generation);
  const beforeRecovery = connection.messages.length;
  peer.answer(current);
  const recovered = await eventually(
    () =>
      connection.messages.slice(beforeRecovery).find((message) => message.type === 'update' || message.type === 'view'),
    'recovery'
  );
  expect(recovered.type).toBe('view');
  expect(connection.closed).toBe(false);
});

it('keeps motion free of unchanged snapshots and still sends saved changes', async () => {
  const a = await admitPlayer(peer, runtime, 'a');
  let view = await syncView(a);
  a.send({ type: 'pointer', seq: 1, position: [1, 0, 1] });
  const pointer = await a.message('update', (message) => message.activity.pointers.length > 0);
  expect(pointer.snapshot).toBeUndefined();
  view = applyRoomUpdate(view, pointer);
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
  view = applyRoomUpdate(view, begin);
  a.send({ type: 'pose', carryId: 'moving', seq: 1, position: [-4, 0.14, 0], orientation: 0 });
  const pose = await a.message('update', (message) => message.activity.carryMoves.length > 0);
  expect(pose.snapshot).toBeUndefined();
  view = applyRoomUpdate(view, pose);
  a.send({ type: 'drop', commandId: 'saved', carryId: 'moving', position: [-4, 0.14, 0], orientation: 0 });
  const dropped = await a.message('update', (message) => message.completedCommandId === 'saved');
  expect(dropped.snapshot.revision).toBe(1);
  view = applyRoomUpdate(view, dropped);
  const fresh = await syncView(a);
  expect(view.snapshot).toEqual(fresh.snapshot);
  expect(view.carries).toEqual(fresh.carries);
  expect(view.pointers).toEqual(fresh.pointers);
});

it('patches saved movement for a socket that admits and syncs without asking for it', async () => {
  const mover = await admitPlayer(peer, runtime, 'a');
  const watcher = await admitPlayer(peer, runtime, 'b');
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
  expect(moved.snapshot.pieces).toEqual([]);
  expect(moved.snapshot.pieceMoves.map((move) => move.id)).toEqual([pieceId]);
  const patched = await watcher.message('view', (message) => message.snapshot.revision === revision);
  expect(patched.snapshot).toEqual((await syncView(watcher)).snapshot);
});

it('moves projected cards and replaces revealed artwork without retaining it after concealment or reconnect', async () => {
  peer.expiresAt = () => Date.now() + 600_000;
  const stored = JSON.parse((await runtime.exec('SELECT data FROM current_state WHERE id=1'))[0].data);
  const card = stored.table.pieces.find((piece) => piece.id === 'treachery-card-loose');
  card.items[0].faceUp = false;
  card.items[0].artwork = {
    front: 'https://example.test/private-front.png',
    back: 'https://example.test/back.png',
    name: 'Private card',
    type: 'treachery',
  };
  await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(stored)]);
  await runtime.restart();
  const players = [];
  for (const suffix of ['a', 'b', 'c']) {
    players.push(await admitPlayer(peer, runtime, suffix));
  }
  let views = await Promise.all(players.map(syncView));
  const hidden = (message) => {
    expect(JSON.stringify(message)).not.toContain('private-front');
    expect(JSON.stringify(message)).not.toContain('Private card');
  };
  views.forEach(hidden);
  async function receive(predicate, privateView) {
    views = await Promise.all(
      players.map(async (connection, index) => {
        const update = await connection.message('update', predicate);
        if (privateView) {
          hidden(update);
        }
        const view = applyRoomUpdate(views[index], update);
        expect(view).not.toBeNull();
        return view;
      })
    );
  }
  players[0].send({
    type: 'begin',
    carryId: 'card-move',
    sourcePieceId: card.id,
    expectedVersion: views[0].snapshot.versions[card.id],
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
    expect(moved.snapshot.pieceMoves).toHaveLength(1);
  }
  for (const revision of [1, 2]) {
    await runtime.clock(revision * 2000);
    players[0].send({
      type: 'command',
      commandId: `flip-${revision}`,
      expectedRevision: revision,
      action: { kind: 'flip', pieceId: card.id },
    });
    const reply = await eventually(
      () =>
        players[0].messages.find(
          (message) => message.completedCommandId === `flip-${revision}` || message.requestId === `flip-${revision}`
        ),
      'flip result'
    );
    expect(reply.type, JSON.stringify(reply)).not.toBe('rejected');
    await receive((message) => message.snapshot?.revision === revision + 1, revision === 2);
    for (const view of views) {
      const artwork = view.snapshot.table.pieces.find((piece) => piece.id === card.id).items[0].artwork;
      expect(artwork.front).toBe(revision === 1 ? 'https://example.test/private-front.png' : undefined);
    }
  }
  for (const [index, connection] of players.entries()) {
    const fresh = await syncView(connection);
    expect(views[index].snapshot).toEqual(fresh.snapshot);
    expect(views[index].carries).toEqual(fresh.carries);
    hidden(fresh);
  }
  players[2].socket.close();
  const reconnected = await admitPlayer(peer, runtime, 'c');
  const restored = await syncView(reconnected);
  expect(restored.snapshot.table).toEqual(views[2].snapshot.table);
  hidden(restored);
}, 15_000);
