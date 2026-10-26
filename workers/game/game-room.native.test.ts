import type { TestContext } from 'vite-plus/test';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { PHASE_CHANGE_COOLDOWN_MS } from '../../src/shared/play/phases.ts';
import type { ClientMessage } from '../../src/shared/play/protocol';
import { PLAY_SEAT_PASS_TTL_MS } from '../../src/shared/play/seatPass.ts';
import { spiceBankSlot } from '../../src/shared/play/spiceBank.ts';
import type { NativeConnection, NativeMessage, NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
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

/**
 * Moves the room clock from `from` to just past the phase cooldown and returns the new offset.
 * The held carry is renewed at least every 4 s on the way, so it outlives its own lease.
 */
async function pastPhaseCooldown(runtime: NativeRuntime, holder: NativeConnection, carryId: string, from: number) {
  const until = from + PHASE_CHANGE_COOLDOWN_MS + 1;
  let clock = from;
  while (clock < until) {
    clock = Math.min(clock + 4001, until);
    await runtime.clock(clock);
    holder.messages.length = 0;
    holder.send({ type: 'renew', carryId });
    holder.send({ type: 'metrics' });
    await holder.message('metrics');
  }
  return clock;
}

describe('GameRoom native SQLite and admission boundaries', () => {
  let peer: NativePeer;
  let runtime: NativeRuntime;
  beforeEach(async () => {
    peer = await createPeer();
    runtime = await createRuntime(peer, 'game');
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  async function admit() {
    const connection = await admitPlayer(runtime, 'a');
    const view = await connection.message('view');
    return { connection, view };
  }

  it('answers a keepalive without treating it as a message', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection } = await admit();
    connection.keepalive();
    await eventually(() => connection.keepalives === 1, 'keepalive answer');
    connection.send({ type: 'metrics' });
    const metrics = await connection.message('metrics');
    expect(connection.closed).toBe(false);
    expect(metrics.commands).toEqual([]);
  });

  it('drops a burst of motion past its bucket without closing, keeps commands answered, and closes a flood', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection } = await admit();
    for (let seq = 0; seq < 200; seq++) {
      connection.send({ type: 'pointer', seq, position: [seq / 100, 0, 0] });
    }
    connection.send({ type: 'metrics' });
    const metrics = await connection.message('metrics');
    expect(connection.closed).toBe(false);
    expect(metrics.motionReceived + required(metrics.motionDropped)).toBe(200);
    expect(metrics.motionDropped).toBeGreaterThan(0);
    for (let seq = 200; seq < 500; seq++) {
      connection.send({ type: 'pointer', seq, position: [seq / 100, 0, 0] });
    }
    await eventually(() => connection.closed, 'motion flood closed');
    expect(connection.closeCode).toBe(4413);
  });

  it('refuses table commands past their own budget without closing, and takes them again once it refills', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection, view } = await admit();
    const piece = view.snapshot.table.pieces[0];
    const rotate = (commandId: string, expectedRevision: number) =>
      connection.send({
        type: 'command',
        commandId,
        action: { kind: 'rotate', pieceId: piece.id, direction: 1 },
        expectedRevision,
      });
    for (let index = 0; index < 40; index++) {
      rotate(`spam-${index}`, view.snapshot.revision);
    }
    const answers = await eventually(() => {
      const settled = connection.messages.filter((message) =>
        message.type === 'rejected'
          ? message.requestId.startsWith('spam-')
          : 'completedCommandId' in message && message.completedCommandId?.startsWith('spam-')
      );
      return settled.length === 40 && settled;
    }, 'every command answered');
    const tooFast = answers.filter(
      (message): message is Extract<NativeMessage, { type: 'rejected' }> =>
        message.type === 'rejected' && message.message.startsWith('You are acting too fast.')
    );
    /* The bucket refills as the burst arrives, so a few of the last ten may still fit; the first thirty always do. */
    const refused = tooFast.map((message) => Number(message.requestId.slice('spam-'.length)));
    expect(refused.length).toBeGreaterThanOrEqual(5);
    expect(Math.min(...refused)).toBeGreaterThanOrEqual(30);
    expect(connection.closed).toBe(false);

    await runtime.clock(1000);
    rotate('after-a-moment', (await syncView(connection)).snapshot.revision);
    await connection.message('view', (message) => message.completedCommandId === 'after-a-moment');
  });

  it('reports when each saved command was durable and when its sweep ran late', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection, view } = await admit();
    const piece = view.snapshot.table.pieces[0];
    connection.send({
      type: 'command',
      commandId: 'durable-rotate',
      action: { kind: 'rotate', pieceId: piece.id, direction: 1 },
      expectedRevision: view.snapshot.revision,
    });
    await connection.message('view', (message) => message.completedCommandId === 'durable-rotate');
    await eventually(async () => {
      connection.messages.length = 0;
      connection.send({ type: 'metrics' });
      const { commands } = await connection.message('metrics');
      return required(commands).at(-1)?.durableAt !== undefined;
    }, 'durable confirmation');
    const { commands, stalls } = await connection.message('metrics');
    expect(required(required(commands).at(-1)).durableAt).toBeGreaterThanOrEqual(
      required(required(commands).at(-1)).handledAt
    );
    expect(stalls).toEqual([]);
    /* Once a sweep has run, moving the room's clock two seconds on makes the next one late by as much. */
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await runtime.clock(2000);
    await eventually(async () => {
      connection.messages.length = 0;
      connection.send({ type: 'metrics' });
      return required(required(await connection.message('metrics')).stalls).length === 1;
    }, 'late sweep');
    const [stall] = required((await connection.message('metrics')).stalls);
    expect(stall.lateMs).toBeGreaterThan(1000);
  }, 15_000);

  it('keeps normal play and expected refusals quiet, but reports a repeated storage failure once', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection } = await admit();
    connection.send({ type: 'pointer', seq: 0, position: [0, 0, 0] });
    connection.send({
      type: 'command',
      commandId: 'first-phase',
      action: { kind: 'phase', direction: -1 },
      expectedRevision: 0,
    });
    expect(await connection.message('rejected')).toMatchObject({
      message: 'The table is already at the first phase of Turn 1.',
    });
    connection.send({ type: 'command', commandId: 'next-phase', action: { kind: 'phase' }, expectedRevision: 0 });
    await connection.message('view', (message) => message.completedCommandId === 'next-phase');
    expect(runtime.logs.filter((log) => log.message.includes('game-operation-failed'))).toEqual([]);
    await runtime.failStorage();
    for (let index = 0; index < 5; index++) {
      const commandId = `storage-${index}`;
      connection.send({ type: 'command', commandId, action: { kind: 'storm', direction: 1 }, expectedRevision: 1 });
      expect(await connection.message('rejected', (message) => message.requestId === commandId)).toMatchObject({
        message: 'Unable to process the command.',
      });
    }
    const logs = await eventually(() => {
      const found = runtime.logs.filter((log) => log.message.includes('game-operation-failed'));
      return found.length ? found : undefined;
    }, 'the storage diagnostic');
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toContain('message');
    expect(logs[0].message).toContain('native-test');
    expect(logs[0].message).not.toContain('receipts');
    expect(logs[0].message).not.toContain('c'.repeat(64));
  });

  it('persists the fixed spice stack, moved stacks, returns and turn boundaries with idempotent receipts', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection } = await admit();
    connection.send({ type: 'command', commandId: 'phase-start', action: { kind: 'phase' }, expectedRevision: 0 });
    await connection.message('view', (message) => message.completedCommandId === 'phase-start');
    const spawnTen = {
      type: 'command',
      commandId: 'spawn-ten',
      action: { kind: 'spice-spawn', count: 10 },
      expectedRevision: 1,
    } satisfies ClientMessage;
    connection.send(spawnTen);
    connection.send({
      type: 'command',
      commandId: 'spawn-two',
      action: { kind: 'spice-spawn', count: 2 },
      expectedRevision: 1,
    });
    const firstSpawn = await connection.message('view', (message) => message.completedCommandId === 'spawn-ten');
    const spawned = await connection.message('view', (message) => message.completedCommandId === 'spawn-two');
    expect(firstSpawn.snapshot.table.events[0].message).toBe('Harkonnen spawned 10 spice.');
    const firstStack = firstSpawn.snapshot.table.pieces.find((piece) => piece.stackKey === 'spice');
    const stacks = spawned.snapshot.table.pieces.filter((piece) => piece.stackKey === 'spice');
    expect(stacks).toHaveLength(1);
    expect(stacks[0].id).toBe(required(firstStack).id);
    expect(stacks[0].position).toEqual(required(firstStack).position);
    expect(stacks[0].items.slice(0, 10)).toEqual(required(firstStack).items);
    expect(stacks[0].items).toHaveLength(12);
    expect(new Set(stacks[0].items.map((item) => item.id)).size).toBe(12);
    expect(spawned.snapshot.table.events[0].message).toBe('Harkonnen spawned 2 spice.');
    connection.messages.length = 0;
    connection.send(spawnTen);
    const repeatedSpawn = await connection.message('view', (message) => message.completedCommandId === 'spawn-ten');
    expect(repeatedSpawn.snapshot).toEqual(spawned.snapshot);
    connection.send({ ...spawnTen, action: { kind: 'spice-spawn', count: 9 } });
    expect(await connection.message('rejected')).toMatchObject({
      requestId: 'spawn-ten',
      message: 'That command ID was already used for different input.',
    });
    connection.send({
      type: 'begin',
      carryId: 'spice-carry',
      sourcePieceId: stacks[0].id,
      expectedVersion: spawned.snapshot.versions[stacks[0].id],
      pickup: 'whole',
    });
    await connection.message('carry', (message) => message.carryId === 'spice-carry');
    connection.send({
      type: 'command',
      commandId: 'reserved-spawn',
      action: { kind: 'spice-spawn', count: 4 },
      expectedRevision: 3,
    });
    await connection.message('rejected', (message) => message.requestId === 'reserved-spawn');
    const turnAt = await pastPhaseCooldown(runtime, connection, 'spice-carry', 0);
    connection.send({
      type: 'command',
      commandId: 'step-back',
      action: { kind: 'phase', direction: -1 },
      expectedRevision: 3,
    });
    const selected = await connection.message('view', (message) => message.completedCommandId === 'step-back');
    expect(selected.snapshot.phase).toBe(0);
    expect(selected.snapshot.table.pieces).toEqual(spawned.snapshot.table.pieces);
    expect(selected.carries[0].id).toBe('spice-carry');
    connection.send({
      type: 'drop',
      commandId: 'move-spice',
      carryId: 'spice-carry',
      position: [0, 0.38, 0],
      orientation: 0,
    });
    const moved = await connection.message('view', (message) => message.completedCommandId === 'move-spice');
    const movedStack = moved.snapshot.table.pieces.find((piece) => piece.id === required(firstStack).id);
    expect(required(movedStack).items).toEqual(stacks[0].items);
    expect(required(movedStack).position).not.toEqual(required(firstStack).position);
    connection.send({
      type: 'command',
      commandId: 'new-spice-bank-stack',
      action: { kind: 'spice-spawn', count: 4 },
      expectedRevision: 5,
    });
    const replenished = await connection.message(
      'view',
      (message) => message.completedCommandId === 'new-spice-bank-stack'
    );
    const newStack = replenished.snapshot.table.pieces.find(
      (piece) => piece.stackKey === 'spice' && piece.id !== required(firstStack).id
    );
    expect(required(newStack).position).toEqual(required(firstStack).position);
    expect(required(newStack).items).toHaveLength(4);
    expect(replenished.snapshot.table.pieces.find((piece) => piece.id === required(firstStack).id)).toEqual(movedStack);
    connection.send({
      type: 'begin',
      carryId: 'return-spice',
      sourcePieceId: required(movedStack).id,
      expectedVersion: replenished.snapshot.versions[required(movedStack).id],
      pickup: 'top',
    });
    await connection.message('carry', (message) => message.carryId === 'return-spice');
    const returnSpice = {
      type: 'drop',
      commandId: 'delete-spice',
      carryId: 'return-spice',
      position: spiceBankSlot().position,
      orientation: 0,
    } satisfies ClientMessage;
    connection.send(returnSpice);
    const returned = await connection.message('view', (message) => message.completedCommandId === 'delete-spice');
    expect(
      required(required(returned).snapshot.table.pieces.find((piece) => piece.id === required(movedStack).id)).items
    ).toHaveLength(11);
    expect(returned.snapshot.table.pieces.find((piece) => piece.id === required(newStack).id)).toEqual(newStack);
    expect(returned.snapshot.table.events[0].message).toBe('Harkonnen returned 1 spice to the Spice Bank.');
    connection.messages.length = 0;
    connection.send(returnSpice);
    expect(
      (await connection.message('view', (message) => message.completedCommandId === 'delete-spice')).snapshot
    ).toEqual(returned.snapshot);
    await runtime.clock(turnAt + PHASE_CHANGE_COOLDOWN_MS + 1);
    const boundarySentAt = Date.now() + turnAt + PHASE_CHANGE_COOLDOWN_MS + 1;
    connection.send({ type: 'command', commandId: 'save-boundary', action: { kind: 'phase' }, expectedRevision: 7 });
    const boundary = await connection.message('view', (message) => message.completedCommandId === 'save-boundary');
    const boundaryAnsweredAt = Date.now() + turnAt + PHASE_CHANGE_COOLDOWN_MS + 1;
    connection.send({ type: 'metrics' });
    const metrics = await connection.message('metrics');
    expect(metrics).toMatchObject({ revision: 8, receiptCount: 8, historySteps: 3 });
    /* The room reports when it began handling the requester's command, by its own clock, which the test offsets. */
    expect(required(required(required(metrics).commands).at(-1)).commandId).toBe('save-boundary');
    expect(required(required(required(metrics).commands).at(-1)).handledAt).toBeGreaterThanOrEqual(boundarySentAt);
    expect(required(required(required(metrics).commands).at(-1)).handledAt).toBeLessThanOrEqual(boundaryAnsweredAt);

    await runtime.restart();
    const restored = await openGame(runtime);
    restored.send({ type: 'admit', pass: await fixturePass('a') });
    expect((await restored.message('view')).snapshot).toEqual(boundary.snapshot);
    restored.send(spawnTen);
    expect((await restored.message('view', (message) => message.completedCommandId === 'spawn-ten')).snapshot).toEqual(
      boundary.snapshot
    );
    restored.send(returnSpice);
    expect(
      (await restored.message('view', (message) => message.completedCommandId === 'delete-spice')).snapshot
    ).toEqual(boundary.snapshot);
    restored.send({ type: 'history', step: 2 });
    expect((await restored.message('history', (message) => message.step === 2)).snapshot).toEqual(selected.snapshot);
    restored.send({ type: 'history', step: 3 });
    expect((await restored.message('history', (message) => message.step === 3)).snapshot).toEqual(boundary.snapshot);
  }, 15_000);

  async function readyPlayers(connections: NativeConnection[], revision: number) {
    for (const [seat, connection] of connections.entries()) {
      connection.send({
        type: 'command',
        commandId: `ready-${seat}`,
        action: { kind: 'ready', ready: true },
        expectedRevision: revision++,
      });
      await connection.message('view', (message) => message.completedCommandId === `ready-${seat}`);
    }
    return revision;
  }

  it('keeps a carried piece available for retry when its drop cannot be saved', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection, view } = await admit();
    const piece = view.snapshot.table.pieces.find((entry) => entry.id === 'harkonnen-force-stack');
    connection.send({
      type: 'begin',
      carryId: 'failed-drop-carry',
      sourcePieceId: required(piece).id,
      expectedVersion: view.snapshot.versions[required(piece).id] ?? 0,
      pickup: 'whole',
    });
    await connection.message('carry');
    await runtime.exec(
      "CREATE TRIGGER fail_drop BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'Drop persistence failure'); END"
    );
    const drop = {
      type: 'drop',
      commandId: 'retry-drop',
      carryId: 'failed-drop-carry',
      position: [0, 0.38, 0],
      orientation: 0,
    } satisfies ClientMessage;
    connection.send(drop);
    await connection.message('rejected', (entry) => entry.requestId === drop.commandId);
    const failed = await syncView(connection);
    expect(failed.carries.map((carry) => carry.id)).toContain(drop.carryId);
    expect(failed.snapshot.revision).toBe(view.snapshot.revision);
    expect(await runtime.exec('SELECT COUNT(*) AS count FROM receipts')).toEqual([{ count: 0 }]);
    await runtime.exec('DROP TRIGGER fail_drop');
    connection.send(drop);
    await eventually(
      () =>
        connection.messages.some(
          (entry) => 'completedCommandId' in entry && entry.completedCommandId === drop.commandId
        ),
      'drop completion'
    );
    const saved = await syncView(connection);
    expect(saved.carries).toEqual([]);
    expect(saved.snapshot.revision).toBe(view.snapshot.revision + 1);
    expect(await runtime.exec('SELECT COUNT(*) AS count FROM receipts')).toEqual([{ count: 1 }]);
  });

  it('keeps carries across shared phase corrections and restores chronological boundaries after restart', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const first = await admit();
    first.connection.send({
      type: 'command',
      commandId: 'before-start',
      action: { kind: 'phase', direction: -1 },
      expectedRevision: 0,
    });
    expect(await first.connection.message('rejected')).toMatchObject({
      requestId: 'before-start',
      message: 'The table is already at the first phase of Turn 1.',
    });
    first.connection.send({
      type: 'begin',
      carryId: 'across-phase',
      sourcePieceId: 'harkonnen-force-stack',
      expectedVersion: 0,
      pickup: 'top',
    });
    await first.connection.message('carry');
    const second = await openGame(runtime);
    second.send({ type: 'admit', pass: await fixturePass('b') });
    const joined = await second.message('view');
    const originalCarry = joined.carries[0];
    expect(originalCarry.id).toBe('across-phase');
    let revision = 0;
    let clock = 0;
    const cooldown = async () => {
      clock = await pastPhaseCooldown(runtime, first.connection, 'across-phase', clock);
    };
    for (let index = 0; index < 9; index++) {
      if (index > 0) {
        await cooldown();
      }
      if (index === 8) {
        revision = await readyPlayers([first.connection, second], revision);
      }
      second.send({
        type: 'command',
        commandId: `forward-${index}`,
        action: { kind: 'phase' },
        expectedRevision: revision++,
      });
      const next = await second.message('view', (message) => message.completedCommandId === `forward-${index}`);
      expect(next.snapshot.phase).toBe(index + 1);
      expect(next.carries).toHaveLength(1);
      expect(next.carries[0]).toMatchObject({ ...originalCarry, expiresAt: expect.any(Number) });
      expect(next.snapshot.versions).toEqual(first.view.snapshot.versions);
      expect(next.snapshot.table.stormSectorIndex).toBe(first.view.snapshot.table.stormSectorIndex);
    }
    await cooldown();
    second.send({
      type: 'command',
      commandId: 'backward',
      action: { kind: 'phase', direction: -1 },
      expectedRevision: revision++,
    });
    const backward = await second.message('view', (message) => message.completedCommandId === 'backward');
    expect(backward.snapshot.phase).toBe(8);
    expect(backward.carries[0]).toMatchObject({ ...originalCarry, expiresAt: expect.any(Number) });
    first.connection.send({
      type: 'drop',
      commandId: 'finish-carry',
      carryId: 'across-phase',
      position: [0, 0.38, 0],
      orientation: 0,
    });
    const dropped = await first.connection.message('view', (message) => message.completedCommandId === 'finish-carry');
    expect(dropped.snapshot.phase).toBe(8);
    expect(dropped.carries).toEqual([]);
    expect(dropped.snapshot.table.pieces.some((piece) => piece.id === 'carry-across-phase')).toBe(true);
    second.send({ type: 'metrics' });
    expect(await second.message('metrics')).toMatchObject({ revision: 13, historySteps: 10, receiptCount: 13 });
    second.send({ type: 'history', step: 9 });
    expect((await second.message('history', (message) => message.step === 9)).snapshot.phase).toBe(9);
    second.send({ type: 'history', step: 10 });
    expect((await second.message('history', (message) => message.step === 10)).snapshot).toEqual(backward.snapshot);

    await runtime.restart();
    const restored = await openGame(runtime);
    restored.send({ type: 'admit', pass: await fixturePass('b') });
    const restoredView = await restored.message('view');
    expect(restoredView.snapshot).toEqual({ ...dropped.snapshot, bank: { factionId: 'atreides', balance: 0 } });
    expect(restoredView.carries).toEqual([]);
    restored.send({ type: 'history', step: 9 });
    expect((await restored.message('history', (message) => message.step === 9)).snapshot.phase).toBe(9);
    restored.send({ type: 'history', step: 10 });
    expect((await restored.message('history', (message) => message.step === 10)).snapshot).toEqual(backward.snapshot);
  }, 15_000);

  it('keeps an existing carry while another player joins and leaves', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const first = await admit();
    first.connection.send({
      type: 'begin',
      carryId: 'carry-a',
      sourcePieceId: 'harkonnen-force-stack',
      expectedVersion: 0,
      pickup: 'top',
    });
    await first.connection.message('carry');
    const beforeMessages = first.connection.messages.length;
    const second = await openGame(runtime);
    second.send({ type: 'admit', pass: await fixturePass('b') });
    const joined = await second.message('view');
    expect(joined.carries).toHaveLength(1);
    /* A view the first connection asks for arrives behind anything the join sent it. */
    await syncView(first.connection);
    expect(first.connection.messages.slice(beforeMessages).some((message) => message.type === 'admission')).toBe(false);
    second.socket.close();
    first.connection.send({ type: 'pointer', seq: 0, position: [2, 0, 0] });
    const afterLeave = await first.connection.message('view', (message) =>
      message.pointers.some((pointer) => pointer.position[0] === 2)
    );
    expect(afterLeave.carries).toHaveLength(1);
    expect(first.connection.messages.slice(beforeMessages).some((message) => message.type === 'admission')).toBe(false);
  });

  /** A second player at the table, whose socket shows what the holder's messages send to other viewers. */
  async function admitWatcher() {
    const connection = await openGame(runtime);
    connection.send({ type: 'admit', pass: await fixturePass('b') });
    const view = await connection.message('view');
    return { connection, view };
  }

  async function metrics(connection: NativeConnection) {
    const before = connection.messages.length;
    connection.send({ type: 'metrics' });
    await eventually(
      () => connection.messages.slice(before).find((message) => message.type === 'metrics'),
      'metrics reply'
    );
  }

  /** The room frames the watcher receives while the holder sends, including one the Worker defers by its 50 ms activity timer. */
  async function framesDuring(holder: NativeConnection, watcher: NativeConnection, message: ClientMessage) {
    const before = watcher.messages.length;
    holder.send(message);
    await metrics(holder);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await metrics(watcher);
    return watcher.messages.slice(before).filter((frame) => frame.type === 'view' || frame.type === 'update');
  }

  it('closes the connection a reconnecting page replaces, so its carry and pointer leave with it, but never one of another player', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection: lost, view } = await admit();
    const { connection: watcher, view: watching } = await admitWatcher();
    lost.send({
      type: 'begin',
      carryId: 'ghost',
      sourcePieceId: 'harkonnen-force-stack',
      expectedVersion: 0,
      pickup: 'top',
    });
    await lost.message('carry');
    lost.send({ type: 'pointer', seq: 0, position: [1, 0.38, 0] });
    await watcher.message('view', (message) => message.carries.length === 1 && message.pointers.length === 1);
    /* The network died without a close frame, so the Worker still holds the old socket when the page reconnects. */
    const before = watcher.messages.length;
    const reconnected = await openGame(runtime);
    reconnected.send({ type: 'admit', pass: await fixturePass('a'), replaces: view.viewer.connectionId });
    const rejoined = await reconnected.message('view');
    expect(rejoined.carries).toEqual([]);
    expect(rejoined.pointers).toEqual([]);
    await eventually(() => lost.closed, 'the replaced connection closing');
    await watcher.message('update', (message) => message.activity.removedCarries.includes('ghost'));
    expect(watcher.messages.slice(before).filter((message) => message.type === 'admission')).toEqual([]);
    /* A page can name only a connection of its own player. */
    const other = await openGame(runtime);
    other.send({ type: 'admit', pass: await fixturePass('a'), replaces: watching.viewer.connectionId });
    await other.message('view');
    await syncView(watcher);
    expect(watcher.closed).toBe(false);
  });

  it('renews a held carry without a frame to other viewers, and the renewals keep it past 8 s', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection: holder } = await admit();
    holder.send({
      type: 'begin',
      carryId: 'held',
      sourcePieceId: 'harkonnen-force-stack',
      expectedVersion: 0,
      pickup: 'top',
    });
    await holder.message('carry');
    const { connection: watcher, view } = await admitWatcher();
    const [begun] = view.carries;
    for (const offset of [4000, 8000, 12_000]) {
      await runtime.clock(offset);
      expect(await framesDuring(holder, watcher, { type: 'renew', carryId: 'held' })).toEqual([]);
    }
    const [renewed] = (await syncView(watcher)).carries;
    expect(renewed.id).toBe('held');
    expect(renewed.expiresAt).toBeGreaterThanOrEqual(begun.expiresAt + 12_000);
  });

  it('ends a carry 8 s after its holder goes silent, and tells the other viewers', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection: holder } = await admit();
    const { connection: watcher } = await admitWatcher();
    holder.send({
      type: 'begin',
      carryId: 'held',
      sourcePieceId: 'harkonnen-force-stack',
      expectedVersion: 0,
      pickup: 'top',
    });
    await holder.message('carry');
    await runtime.clock(7000);
    expect((await syncView(watcher)).carries.map((carry) => carry.id)).toEqual(['held']);
    await runtime.clock(8001);
    await watcher.message('update', (message) => message.activity.removedCarries.includes('held'));
  });

  it('keeps a still pointer alive without a frame to other viewers, while a moved pointer still goes out', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection: holder } = await admit();
    const { connection: watcher } = await admitWatcher();
    holder.send({ type: 'pointer', seq: 0, position: [1, 0.38, 0] });
    const [shown] = (await watcher.message('view', (message) => message.pointers.length === 1)).pointers;
    await runtime.clock(2000);
    expect(await framesDuring(holder, watcher, { type: 'pointer', seq: 1, position: [1, 0.38, 0] })).toEqual([]);
    await runtime.clock(4000);
    const [kept] = (await syncView(watcher)).pointers;
    expect(kept.position).toEqual([1, 0.38, 0]);
    expect(kept.updatedAt).toBeGreaterThanOrEqual(shown.updatedAt + 2000);
    holder.send({ type: 'pointer', seq: 2, position: [2, 0.38, 0] });
    await watcher.message('update', (message) =>
      message.activity.pointerMoves.some((pointer) => pointer.position[0] === 2)
    );
  });

  it('relays a ping to the other viewers alone, drops one sent sooner than the interval, and keeps none', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection: holder } = await admit();
    const { connection: watcher } = await admitWatcher();
    holder.send({ type: 'ping', position: [1, 0.38, 0] });
    const { ping } = await watcher.message('ping');
    expect(ping).toMatchObject({ viewerSeat: 'harkonnen', position: [1, 0.38, 0] });
    holder.send({ type: 'ping', position: [2, 0.38, 0] });
    await metrics(holder);
    await metrics(watcher);
    expect(watcher.messages.filter((message) => message.type === 'ping')).toHaveLength(1);
    expect(holder.messages.some((message) => message.type === 'ping')).toBe(false);
    await runtime.clock(1000);
    holder.send({ type: 'ping', position: [3, 0.38, 0] });
    await watcher.message('ping', (message) => message.ping.position[0] === 3);
    await runtime.clock(2000);
    holder.send({ type: 'ping', position: [4, 0.38, 0], sound: 'fart' });
    const { ping: rumble } = await watcher.message('ping', (message) => message.ping.position[0] === 4);
    expect(rumble.sound).toBe('fart');
    await runtime.clock(3000);
    holder.send({ type: 'ping', position: [5, 0.38, 0], sound: 'fart' });
    const { ping: early } = await watcher.message('ping', (message) => message.ping.position[0] === 5);
    expect(early.sound).toBeUndefined();
    await runtime.clock(5000);
    holder.send({ type: 'ping', position: [6, 0.38, 0], sound: 'fart' });
    const { ping: later } = await watcher.message('ping', (message) => message.ping.position[0] === 6);
    expect(later.sound).toBe('fart');
    expect((await syncView(watcher)).pointers).toEqual([]);
  });

  it('retains carry replay history when the pass runs out and is renewed on the same socket', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection, view } = await admit();
    const begin = {
      type: 'begin',
      carryId: 'carry-before-suspension',
      sourcePieceId: 'harkonnen-force-stack',
      expectedVersion: 0,
      pickup: 'top',
    } satisfies ClientMessage;
    connection.send(begin);
    await connection.message('carry');
    connection.send({ type: 'cancel', carryId: begin.carryId });
    await connection.message(
      'view',
      (message) => required(message.sequence) > required(view.sequence) && message.carries.length === 0
    );

    const beforeSuspension = connection.messages.length;
    await runtime.clock(PLAY_SEAT_PASS_TTL_MS + 1);
    await eventually(
      () =>
        connection.messages
          .slice(beforeSuspension)
          .some((message) => message.type === 'admission' && message.status === 'pass-expired'),
      'same-socket pass expiry'
    );
    expect(connection.closed).toBe(false);
    connection.send({ type: 'pass', pass: await fixturePass('a', { exp: Date.now() + 2 * PLAY_SEAT_PASS_TTL_MS }) });
    const recovered = await eventually(
      () => connection.messages.slice(beforeSuspension).find(isFullView),
      'view after recovery'
    );
    expect(recovered.epoch).toBe(view.epoch);
    expect(recovered.carries).toEqual([]);

    const beforeReplay = connection.messages.length;
    connection.send(begin);
    const replay = await eventually(
      () => connection.messages.slice(beforeReplay).find((message) => ['carry', 'rejected'].includes(message.type)),
      'replayed carry reply'
    );
    expect(replay).toMatchObject({
      type: 'rejected',
      requestId: begin.carryId,
      message: 'That carry ID has ended. Start a new carry.',
    });
    connection.send({ ...begin, carryId: 'carry-after-recovery' });
    await connection.message('carry', (message) => message.carryId === 'carry-after-recovery');
    expect(connection.closed).toBe(false);
  });

  it('sends a socket that used up its carry history to reconnect, and the new socket picks pieces up again', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection } = await admit();
    const begin = (socket: NativeConnection, carryId: string) => {
      const start = socket.messages.length;
      socket.send({
        type: 'begin',
        carryId,
        sourcePieceId: 'harkonnen-force-stack',
        expectedVersion: 0,
        pickup: 'top',
      });
      return eventually(
        () =>
          socket.messages
            .slice(start)
            .find(
              (message) =>
                ('carryId' in message && message.carryId === carryId) ||
                ('requestId' in message && message.requestId === carryId)
            ),
        `the answer to ${carryId}`
      );
    };
    /* A long session: every pickup ends, and the room's clock moves on so the message budget refills. */
    for (let index = 0; index < 1024; index++) {
      if (index % 25 === 0) {
        await runtime.clock((index / 25 + 1) * 1000);
      }
      expect((await begin(connection, `carry-${index}`)).type).toBe('carry');
      connection.send({ type: 'cancel', carryId: `carry-${index}` });
    }
    await runtime.clock(50_000);
    expect(await begin(connection, 'carry-past-history')).toMatchObject({ type: 'rejected' });
    await eventually(() => connection.closed, 'the socket closing for a reconnect');
    expect(connection.closeCode).toBe(1012);
    const { connection: reconnected } = await admit();
    expect((await begin(reconnected, 'carry-after-reconnect')).type).toBe('carry');
  }, 60_000);

  async function confirmationRequest(index: number) {
    return eventually(
      () => peer.requests.filter((request) => request.function === 'playProvisioning:confirmProvisioning')[index],
      `confirmation request ${index + 1}`
    );
  }

  it.each([2000, 30_000])('pre-arms a pending confirmation retry with the %i ms cadence', async (cadence) => {
    peer.provisionExpiresAt = Date.now() + 60_000;
    peer.holdConfirmations = true;
    const provisioning = provision(runtime);
    const first = await confirmationRequest(0);
    expect((await runtime.alarm()).scheduledAt).toBeGreaterThan(first.startedAt);
    first.response.writeHead(503);
    first.response.end('Confirmation unavailable');
    expect((await provisioning).status).toBe(403);
    /* Cross expiry only after provisioning has started, regardless of machine scheduling. */
    const clockOffset = cadence === 30_000 ? peer.provisionExpiresAt - Date.now() + 1 : 0;
    await runtime.clock(clockOffset);

    const trigger = await runtime.alarm(true);
    const retry = await confirmationRequest(1);
    const alarm = await runtime.alarm();
    expect(retry.startedAt + clockOffset < peer.provisionExpiresAt).toBe(cadence === 2000);
    expect(alarm.scheduledAt).toBeGreaterThanOrEqual(trigger.observedAt + cadence);
    expect(alarm.scheduledAt).toBeLessThanOrEqual(retry.startedAt + clockOffset + cadence);
    retry.release({ ok: true });
    await eventually(async () => (await runtime.alarm()).scheduledAt === null, 'confirmation settlement');
    await runtime.clock(0);
    expect((await admit()).view.snapshot.revision).toBe(0);
  });

  it.each([true, false])(
    'discards an older confirmation reply while the newest is pending, older ok=%s',
    async (olderOk) => {
      peer.holdConfirmations = true;
      const provisioning = provision(runtime);
      const older = await confirmationRequest(0);
      await runtime.alarm(true);
      const newest = await confirmationRequest(1);
      const pendingAlarm = (await runtime.alarm()).scheduledAt;
      expect(pendingAlarm).not.toBeNull();
      older.release({ ok: olderOk });
      expect((await provisioning).status).toBe(403);
      expect((await runtime.alarm()).scheduledAt).toBe(pendingAlarm);
      newest.release({ ok: !olderOk });
      await eventually(async () => (await runtime.alarm()).scheduledAt === null, 'newest confirmation settlement');
      if (!olderOk) {
        expect((await admit()).view.snapshot.revision).toBe(0);
      }
    }
  );

  it.each([true, false])(
    'keeps the newest confirmation settled after an older request fails, newest ok=%s',
    async (newestOk) => {
      peer.holdConfirmations = true;
      const provisioning = provision(runtime);
      const older = await confirmationRequest(0);
      await runtime.alarm(true);
      const newest = await confirmationRequest(1);
      newest.release({ ok: newestOk });
      await eventually(async () => (await runtime.alarm()).scheduledAt === null, 'newest confirmation settlement');
      const confirmationFailures = () =>
        runtime.logs.filter(
          (log) => log.message.includes('game-operation-failed') && log.message.includes('confirmation')
        );
      expect(confirmationFailures()).toEqual([]);
      older.response.writeHead(503);
      older.response.end('Confirmation unavailable');
      expect((await provisioning).status).toBe(newestOk ? 200 : 403);
      expect((await runtime.alarm()).scheduledAt).toBeNull();
      /* The superseded request's failure still reaches diagnostics, the way a first attempt outliving its alarm does. */
      expect(
        await eventually(
          () => (confirmationFailures().length ? confirmationFailures() : undefined),
          'the superseded confirmation diagnostic',
          2500
        )
      ).toHaveLength(1);
    }
  );

  async function recoverLostConfirmation(setupDelay: number, annotate: TestContext['annotate']) {
    peer.provisionExpiresAt = Date.now() + 4000;
    peer.holdFirstConfirmation = true;
    peer.failConfirmationRetries = true;
    let alarm;
    try {
      /* This delay covers a request whose bounded timeout crosses the provisioning deadline. */
      if (setupDelay) {
        await new Promise((resolve) => setTimeout(resolve, setupDelay));
      }
      expect((await provision(runtime)).status).toBe(403);
      expect(peer.confirmed).toBe(true);
      await eventually(() => Date.now() >= peer.provisionExpiresAt, 'provisioning expiry');
      peer.failConfirmationRetries = false;
      alarm = await runtime.alarm(true);
      expect(alarm.observedAt).toBeGreaterThanOrEqual(peer.provisionExpiresAt);
      await eventually(
        () =>
          peer.requests.some(
            (request) =>
              request.function === 'playProvisioning:confirmProvisioning' &&
              request.startedAt >= peer.provisionExpiresAt
          ),
        'post-deadline confirmation retry'
      );
      const confirmations = peer.requests.filter(
        (request) => request.function === 'playProvisioning:confirmProvisioning'
      );
      expect(confirmations[0].startedAt).toBeLessThan(peer.provisionExpiresAt);
      if (setupDelay) {
        expect(confirmations[0].completedAt).toBeGreaterThanOrEqual(peer.provisionExpiresAt);
      }
      await eventually(async () => (await runtime.alarm()).scheduledAt === null, 'confirmation settlement');
      const { view } = await admit();
      return view.snapshot;
    } finally {
      await annotate(JSON.stringify({ expiresAt: peer.provisionExpiresAt, alarm }), 'confirmation alarm');
      await annotate(
        JSON.stringify(
          peer.requests
            .filter((request) => request.function === 'playProvisioning:confirmProvisioning')
            .map(({ startedAt, completedAt }) => ({ startedAt, completedAt }))
        ),
        'confirmation requests'
      );
    }
  }

  it('recovers a confirmation committed before the deadline when its first reply is lost', async ({ annotate }) => {
    expect(await recoverLostConfirmation(0, annotate)).toMatchObject({ revision: 0 });
  }, 15_000);

  it('recovers a lost confirmation when the failed request completes after expiry', async ({ annotate }) => {
    expect(await recoverLostConfirmation(1600, annotate)).toMatchObject({ revision: 0 });
  }, 15_000);

  it('restores committed state, receipt and history from the same SQLite store, never its transients', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const first = await admit();
    const command = {
      type: 'command',
      commandId: 'phase-1',
      action: { kind: 'phase' },
      expectedRevision: 0,
    } satisfies ClientMessage;
    first.connection.send(command);
    const committed = await first.connection.message('view', (message) => message.completedCommandId === 'phase-1');
    expect(committed.snapshot.revision).toBe(1);
    expect(committed.snapshot.phase).toBe(1);
    first.connection.send({ type: 'metrics' });
    const beforeMetrics = await first.connection.message('metrics');
    expect(beforeMetrics.receiptCount).toBe(1);
    expect(beforeMetrics.historySteps).toBe(1);
    first.connection.send({ type: 'history', step: 1 });
    const beforeHistory = await first.connection.message('history');
    first.connection.send({
      type: 'begin',
      carryId: 'carry-a',
      sourcePieceId: 'harkonnen-force-stack',
      expectedVersion: committed.snapshot.versions['harkonnen-force-stack'],
      pickup: 'top',
    });
    await first.connection.message('carry');
    first.connection.send({ type: 'pointer', seq: 0, position: [0, 0, 0] });
    await first.connection.message('view', (message) => message.carries.length === 1 && message.pointers.length === 1);

    await runtime.restart();
    const restored = await openGame(runtime);
    restored.send({ type: 'metrics' });
    restored.send({ type: 'history', step: 1 });
    restored.send({ type: 'admit', pass: await fixturePass('a') });
    const restoredView = await restored.message('view');
    expect(restoredView.snapshot).toEqual(committed.snapshot);
    expect(restoredView.viewer.viewerSeat).toBe(first.view.viewer.viewerSeat);
    expect(restoredView.epoch).not.toBe(first.view.epoch);
    expect(restoredView.carries).toEqual([]);
    expect(restoredView.pointers).toEqual([]);
    restored.send(command);
    const replay = await restored.message('view', (message) => message.completedCommandId === 'phase-1');
    expect(replay.snapshot.revision).toBe(1);
    restored.send({ type: 'metrics' });
    const afterMetrics = await restored.message('metrics');
    expect(afterMetrics.receiptCount).toBe(beforeMetrics.receiptCount);
    expect(afterMetrics.historySteps).toBe(beforeMetrics.historySteps);
    restored.send({ type: 'history', step: 1 });
    expect(await restored.message('history')).toEqual({ ...beforeHistory, serverNow: expect.any(Number) });
  }, 15_000);
});
