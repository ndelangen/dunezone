import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PHASE_CHANGE_COOLDOWN_MS } from '../../src/shared/play/phases.ts';
import { TICKET_EXPIRED_CLOSE_CODE } from '../../src/shared/play/protocol.ts';
import { spiceSupplySlot } from '../../src/shared/play/spiceSupply.ts';
import { tokenPage } from './native-catalogue.fixture.mjs';
import {
  createPeer,
  createRuntime,
  eventually,
  isFullView,
  openGame,
  provision,
  syncView,
} from './native-runtime.fixture.mjs';

/**
 * Moves the room clock from `from` to just past the phase cooldown and returns the new offset.
 * The held carry is renewed at least every 4 s on the way, so it outlives its own lease.
 */
async function pastPhaseCooldown(runtime, holder, carryId, from) {
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
  let peer;
  let runtime;
  beforeEach(async () => {
    peer = await createPeer();
    runtime = await createRuntime(peer, 'game');
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  async function admit() {
    const connection = await openGame(runtime);
    connection.send({ type: 'admit', ticket: 'c'.repeat(64) });
    const query = await peer.query();
    peer.answer(query);
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
    expect(metrics.motionReceived + metrics.motionDropped).toBe(200);
    expect(metrics.motionDropped).toBeGreaterThan(0);
    for (let seq = 200; seq < 500; seq++) {
      connection.send({ type: 'pointer', seq, position: [seq / 100, 0, 0] });
    }
    await eventually(() => connection.closed, 'motion flood closed');
    expect(connection.closeCode).toBe(4413);
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
      return commands.at(-1)?.durableAt !== undefined;
    }, 'durable confirmation');
    const { commands, stalls } = await connection.message('metrics');
    expect(commands.at(-1).durableAt).toBeGreaterThanOrEqual(commands.at(-1).handledAt);
    expect(stalls).toEqual([]);
    /* Once a sweep has run, moving the room's clock two seconds on makes the next one late by as much. */
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await runtime.clock(2000);
    await eventually(async () => {
      connection.messages.length = 0;
      connection.send({ type: 'metrics' });
      return (await connection.message('metrics')).stalls.length === 1;
    }, 'late sweep');
    const [stall] = (await connection.message('metrics')).stalls;
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

  it('refuses a seated player who asks to change how the table is enforced', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection } = await admit();
    connection.send({
      type: 'command',
      commandId: 'owner-only',
      action: { kind: 'enforcement', policy: 'strict' },
      expectedRevision: 0,
    });
    const answer = await eventually(
      () =>
        connection.messages.find(
          (message) => message.status === 'denied' || message.completedCommandId === 'owner-only'
        ),
      'an answer to the enforcement command'
    );
    expect(answer).toMatchObject({ type: 'admission', status: 'denied' });
    const { view } = await admit();
    expect(view.snapshot.revision).toBe(0);
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
    };
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
    expect(stacks[0].id).toBe(firstStack.id);
    expect(stacks[0].position).toEqual(firstStack.position);
    expect(stacks[0].items.slice(0, 10)).toEqual(firstStack.items);
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
    const movedStack = moved.snapshot.table.pieces.find((piece) => piece.id === firstStack.id);
    expect(movedStack.items).toEqual(stacks[0].items);
    expect(movedStack.position).not.toEqual(firstStack.position);
    connection.send({
      type: 'command',
      commandId: 'new-supply-stack',
      action: { kind: 'spice-spawn', count: 4 },
      expectedRevision: 5,
    });
    const replenished = await connection.message(
      'view',
      (message) => message.completedCommandId === 'new-supply-stack'
    );
    const newStack = replenished.snapshot.table.pieces.find(
      (piece) => piece.stackKey === 'spice' && piece.id !== firstStack.id
    );
    expect(newStack.position).toEqual(firstStack.position);
    expect(newStack.items).toHaveLength(4);
    expect(replenished.snapshot.table.pieces.find((piece) => piece.id === firstStack.id)).toEqual(movedStack);
    connection.send({
      type: 'begin',
      carryId: 'return-spice',
      sourcePieceId: movedStack.id,
      expectedVersion: replenished.snapshot.versions[movedStack.id],
      pickup: 'top',
    });
    await connection.message('carry', (message) => message.carryId === 'return-spice');
    const returnSpice = {
      type: 'drop',
      commandId: 'delete-spice',
      carryId: 'return-spice',
      position: spiceSupplySlot().position,
      orientation: 0,
    };
    connection.send(returnSpice);
    const returned = await connection.message('view', (message) => message.completedCommandId === 'delete-spice');
    expect(returned.snapshot.table.pieces.find((piece) => piece.id === movedStack.id).items).toHaveLength(11);
    expect(returned.snapshot.table.pieces.find((piece) => piece.id === newStack.id)).toEqual(newStack);
    expect(returned.snapshot.table.events[0].message).toBe('Harkonnen returned 1 spice to the supply.');
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
    expect(metrics.commands.at(-1).commandId).toBe('save-boundary');
    expect(metrics.commands.at(-1).handledAt).toBeGreaterThanOrEqual(boundarySentAt);
    expect(metrics.commands.at(-1).handledAt).toBeLessThanOrEqual(boundaryAnsweredAt);

    await runtime.restart();
    peer.watchMode = 'allow';
    const restored = await openGame(runtime);
    restored.send({ type: 'admit', ticket: 'd'.repeat(64) });
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

  async function readyPlayers(connections, revision) {
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
    peer.expiresAt = () => Date.now() + 600_000;
    expect((await provision(runtime)).status).toBe(200);
    const { connection, view } = await admit();
    const piece = view.snapshot.table.pieces.find((entry) => entry.id === 'harkonnen-force-stack');
    connection.send({
      type: 'begin',
      carryId: 'failed-drop-carry',
      sourcePieceId: piece.id,
      expectedVersion: view.snapshot.versions[piece.id] ?? 0,
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
    };
    connection.send(drop);
    await connection.message('rejected', (entry) => entry.requestId === drop.commandId);
    const failed = await syncView(connection);
    expect(failed.carries.map((carry) => carry.id)).toContain(drop.carryId);
    expect(failed.snapshot.revision).toBe(view.snapshot.revision);
    expect(await runtime.exec('SELECT COUNT(*) AS count FROM receipts')).toEqual([{ count: 0 }]);
    await runtime.exec('DROP TRIGGER fail_drop');
    connection.send(drop);
    await eventually(
      () => connection.messages.some((entry) => entry.completedCommandId === drop.commandId),
      'drop completion'
    );
    const saved = await syncView(connection);
    expect(saved.carries).toEqual([]);
    expect(saved.snapshot.revision).toBe(view.snapshot.revision + 1);
    expect(await runtime.exec('SELECT COUNT(*) AS count FROM receipts')).toEqual([{ count: 1 }]);
  });

  it('keeps carries across shared phase corrections and restores chronological boundaries after restart', async () => {
    peer.expiresAt = () => Date.now() + 3_600_000;
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
    peer.registrationId = 'registration-b';
    peer.watchMode = 'allow';
    const second = await openGame(runtime);
    second.send({ type: 'admit', ticket: 'd'.repeat(64) });
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
    restored.send({ type: 'admit', ticket: 'e'.repeat(64) });
    const restoredView = await restored.message('view');
    expect(restoredView.snapshot).toEqual({ ...dropped.snapshot, bank: { factionId: 'atreides', balance: 0 } });
    expect(restoredView.carries).toEqual([]);
    restored.send({ type: 'history', step: 9 });
    expect((await restored.message('history', (message) => message.step === 9)).snapshot.phase).toBe(9);
    restored.send({ type: 'history', step: 10 });
    expect((await restored.message('history', (message) => message.step === 10)).snapshot).toEqual(backward.snapshot);
  }, 15_000);

  it('closes on an expired ticket so the browser asks for another, while a refused player stays denied', async () => {
    expect((await provision(runtime)).status).toBe(200);
    peer.redemptionRefusal = 'expired';
    const expired = await openGame(runtime);
    expired.send({ type: 'admit', ticket: 'c'.repeat(64) });
    await eventually(() => expired.closed, 'expired ticket close');
    expect(expired.closeCode).toBe(TICKET_EXPIRED_CLOSE_CODE);
    expect(expired.messages).toEqual([]);
    peer.redemptionRefusal = 'refused';
    const refused = await openGame(runtime);
    refused.send({ type: 'admit', ticket: 'd'.repeat(64) });
    await eventually(() => refused.closed, 'refused ticket close');
    expect(refused.closeCode).toBe(4401);
    expect(refused.messages).toEqual([{ type: 'admission', status: 'denied' }]);
  });

  it('closes without a refusal when the account check fails at admission, so the browser retries', async () => {
    expect((await provision(runtime)).status).toBe(200);
    peer.watchMode = 'allow';
    await admit();
    /* A cold room holds no account lease, so the next admission checks every retained account. */
    await runtime.restart();
    peer.reconcileMode = 'error';
    const unavailable = await openGame(runtime);
    unavailable.send({ type: 'admit', ticket: 'd'.repeat(64) });
    await eventually(() => unavailable.closed, 'unavailable admission close');
    expect(unavailable.closeCode).not.toBe(4401);
    expect(unavailable.messages).not.toContainEqual({ type: 'admission', status: 'denied' });
    peer.reconcileMode = 'answer';
    const retried = await openGame(runtime);
    retried.send({ type: 'admit', ticket: 'e'.repeat(64) });
    expect((await retried.message('view')).viewer.userId).toBe('user-a');
  });

  it('closes a redeemed socket that never obtained fresh authorization', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const connection = await openGame(runtime);
    connection.send({ type: 'admit', ticket: 'c'.repeat(64) });
    await peer.query();
    await eventually(
      () => peer.requests.some((request) => request.function === 'playAdmission:redeemTicket'),
      'ticket redemption'
    );
    await eventually(() => connection.closed, 'pending admission timeout', 7000);
    expect(connection.messages.every((message) => message.type === 'admission')).toBe(true);
  }, 10_000);

  it('requires a fresh watch and HTTP validation for a second tab without interrupting an active carry', async () => {
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
    const oldGeneration = peer.latestQuery().query.args[0].generation;
    peer.httpMode = 'hold';
    const second = await openGame(runtime);
    second.send({ type: 'admit', ticket: 'd'.repeat(64) });
    await eventually(
      () =>
        second.messages.some((message) => message.type === 'view') ||
        peer.latestQuery()?.query.args[0].generation !== oldGeneration,
      'second connection admission'
    );
    expect(second.messages.some((message) => message.type === 'view')).toBe(false);
    const current = await peer.query(({ query }) => query.args[0].generation !== oldGeneration);
    peer.answer(current);
    const before = peer.requests.length;
    await eventually(() => peer.requests.length > before, 'second connection fresh validation');
    expect(second.messages.some((message) => message.type === 'view')).toBe(false);
    first.connection.send({ type: 'metrics' });
    await first.connection.message('metrics');
    first.connection.send({ type: 'pointer', seq: 0, position: [0, 0, 0] });
    await first.connection.message('view', (message) => message.carries.length === 1 && message.pointers.length === 1);
    expect(first.connection.messages.slice(beforeMessages).some((message) => message.type === 'admission')).toBe(false);
    const held = peer.requests.at(-1);
    held.release(peer.result(held.args));
    const secondView = await second.message('view');
    expect(secondView.carries).toHaveLength(1);
    second.socket.close();
    const beforeRenewal = first.connection.messages.length;
    first.connection.send({ type: 'renew', carryId: 'carry-a' });
    first.connection.send({ type: 'metrics' });
    await eventually(
      () => first.connection.messages.slice(beforeRenewal).find((message) => message.type === 'metrics'),
      'metrics after carry renewal'
    );
    expect(first.connection.messages.slice(beforeMessages).some((message) => message.type === 'admission')).toBe(false);
  });

  it('keeps an existing carry while another registration joins and leaves', async () => {
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
    peer.registrationId = 'registration-b';
    peer.watchMode = 'allow';
    const second = await openGame(runtime);
    second.send({ type: 'admit', ticket: 'd'.repeat(64) });
    const joined = await second.message('view');
    expect(joined.carries).toHaveLength(1);
    /* A view the first connection asks for arrives behind anything the join sent it. */
    await syncView(first.connection);
    expect(first.connection.messages.slice(beforeMessages).some((message) => message.type === 'admission')).toBe(false);
    peer.watchMode = 'manual';
    peer.httpMode = 'hold';
    second.socket.close();
    await peer.query(({ query }) => query.args[0].registrationIds.length === 1);
    first.connection.send({ type: 'pointer', seq: 0, position: [2, 0, 0] });
    const afterLeave = await first.connection.message('view', (message) =>
      message.pointers.some((pointer) => pointer.position[0] === 2)
    );
    expect(afterLeave.carries).toHaveLength(1);
    expect(first.connection.messages.slice(beforeMessages).some((message) => message.type === 'admission')).toBe(false);
  });

  /** A second registration at the table, whose socket shows what the holder's messages send to other viewers. */
  async function admitWatcher() {
    peer.registrationId = 'registration-b';
    peer.watchMode = 'allow';
    const connection = await openGame(runtime);
    connection.send({ type: 'admit', ticket: 'd'.repeat(64) });
    const view = await connection.message('view');
    return { connection, view };
  }

  async function metrics(connection) {
    const before = connection.messages.length;
    connection.send({ type: 'metrics' });
    await eventually(
      () => connection.messages.slice(before).find((message) => message.type === 'metrics'),
      'metrics reply'
    );
  }

  /** The room frames the watcher receives while the holder sends, including one the Worker defers by its 50 ms activity timer. */
  async function framesDuring(holder, watcher, message) {
    const before = watcher.messages.length;
    holder.send(message);
    await metrics(holder);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await metrics(watcher);
    return watcher.messages.slice(before).filter((frame) => frame.type === 'view' || frame.type === 'update');
  }

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

  /** Admits player A, then player B in two tabs of one Auth session, and leaves the watch for the test to answer. */
  async function admitPlayerAndTwoTabs() {
    const { connection: first } = await admit();
    peer.registrationId = 'registration-b';
    peer.watchMode = 'allow';
    const tabs = [];
    for (const ticket of ['d', 'e']) {
      const tab = await openGame(runtime);
      tab.send({ type: 'admit', ticket: ticket.repeat(64) });
      await tab.message('view');
      tabs.push(tab);
    }
    /* Each admission also sends player A an update, which can still be in flight when the tab's own view lands; a sync answered after it keeps that update out of what the test watches next. */
    await syncView(first);
    peer.watchMode = 'manual';
    return { first, tabs };
  }

  /** One watch push that denies every connection of `registrationId`, as a sign-out does, answered on the batch `watched` names. */
  async function signOut(tabs, registrationId, watched) {
    const current = await peer.query(({ query }) => query.args[0].registrationIds.join() === watched.join());
    peer.answer(current, (candidate) => candidate !== registrationId);
    await eventually(() => tabs.every((tab) => tab.closed), 'signed-out tabs');
  }

  const pausedOrReset = (message) => message.type === 'admission' || isFullView(message);

  it('holds the other player through a sign-out that denies two tabs, then sends them what changed', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { first, tabs } = await admitPlayerAndTwoTabs();
    first.send({
      type: 'begin',
      carryId: 'held-through',
      sourcePieceId: 'harkonnen-force-stack',
      expectedVersion: 0,
      pickup: 'top',
    });
    await first.message('carry');
    const signedOut = (await tabs[0].message('view')).viewer.connectionId;
    tabs[0].send({ type: 'pointer', seq: 0, position: [1, 0.38, 0] });
    await first.message('view', (message) => message.pointers.some((pointer) => pointer.connectionId === signedOut));
    peer.reconcileMode = 'hold';
    const beforeDenial = first.messages.length;
    const checksBefore = peer.accountChecks().length;
    await signOut(tabs, 'registration-b', ['registration-a', 'registration-b']);
    await eventually(() => peer.accountChecks().length > checksBefore, 'the account check after the sign-out');
    /* Long enough for a sweep to run, and well inside the check's 3 s request timeout. */
    await new Promise((resolve) => setTimeout(resolve, 1100));
    /* The room sends the other player nothing while it checks accounts, not even a pause. */
    expect(first.messages.slice(beforeDenial)).toEqual([]);
    peer.releaseAccounts();
    const resumed = await eventually(
      () => first.messages.slice(beforeDenial).find((message) => message.type === 'view'),
      'the frame after the check'
    );
    expect(resumed.pointers.map((pointer) => pointer.connectionId)).not.toContain(signedOut);
    expect(resumed.carries.map((carry) => carry.id)).toEqual(['held-through']);
    expect(first.messages.slice(beforeDenial).filter(pausedOrReset)).toEqual([]);
    expect(first.unapplied).toEqual([]);
    /* One push denied both tabs, and one pass over the accounts covered it. */
    expect(peer.accountChecks().slice(checksBefore)).toHaveLength(1);
    expect(first.closed).toBe(false);
  });

  it('holds the other player through a deletion and resumes them on the vacated seat, never the deleted name', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { first, tabs } = await admitPlayerAndTwoTabs();
    const deleted = (await tabs[0].message('view')).viewer.displayName;
    expect((await syncView(first)).snapshot.controls.players.map((player) => player.name)).toContain(deleted);
    peer.reconcileMode = 'hold';
    peer.deletedAccounts.add('user-b');
    const beforeDenial = first.messages.length;
    await signOut(tabs, 'registration-b', ['registration-a', 'registration-b']);
    await eventually(() => peer.accountChecks().some((record) => !record.response.writableEnded), 'the account check');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(first.messages.slice(beforeDenial)).toEqual([]);
    peer.releaseAccounts();
    const resumed = await eventually(
      () => first.messages.slice(beforeDenial).find((message) => message.type === 'view'),
      'the frame after the check'
    );
    /* The first frame after the check already has the seat vacated, and it applies to the last frame the player held. */
    expect(resumed.snapshot.controls.players.map((player) => player.name)).not.toContain(deleted);
    expect(first.messages.slice(beforeDenial).filter(pausedOrReset)).toEqual([]);
    expect(first.unapplied).toEqual([]);
    expect(resumed.snapshot).toEqual((await syncView(first)).snapshot);
    expect(JSON.stringify(first.messages.slice(beforeDenial))).not.toContain(deleted);
  });

  it('admits a tab and applies a held command while two sign-outs in a row are still being checked', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { first, tabs } = await admitPlayerAndTwoTabs();
    peer.registrationId = 'registration-c';
    peer.watchMode = 'allow';
    const third = await openGame(runtime);
    third.send({ type: 'admit', ticket: 'f'.repeat(64) });
    await third.message('view');
    peer.watchMode = 'manual';
    const { revision } = (await syncView(first)).snapshot;
    peer.reconcileMode = 'hold';
    const beforeDenial = first.messages.length;
    const checksBefore = peer.accountChecks().length;
    await signOut(tabs, 'registration-b', ['registration-a', 'registration-b', 'registration-c']);
    await eventually(() => peer.accountChecks().length > checksBefore, 'the account check after the first sign-out');
    first.send({ type: 'command', commandId: 'during-check', action: { kind: 'phase' }, expectedRevision: revision });
    /* The second sign-out lands while the first one's check is still out, so that pass no longer counts. */
    await signOut([third], 'registration-c', ['registration-a', 'registration-c']);
    peer.registrationId = 'registration-d';
    const late = await openGame(runtime);
    late.send({ type: 'admit', ticket: '1'.repeat(64) });
    await eventually(
      () =>
        peer.requests.some(
          (record) => record.function === 'playAdmission:redeemTicket' && record.args.ticket === '1'.repeat(64)
        ),
      'the late tab redeeming its ticket'
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(first.messages.slice(beforeDenial)).toEqual([]);
    peer.releaseAccounts();
    await eventually(
      () => late.closed || peer.latestQuery()?.query.args[0].registrationIds.includes('registration-d'),
      'the late tab admitted or refused'
    );
    expect(late.closed).toBe(false);
    peer.answer(peer.latestQuery());
    await late.message('view');
    await first.message('view', (message) => message.completedCommandId === 'during-check');
    expect(first.messages.slice(beforeDenial).filter(pausedOrReset)).toEqual([]);
  });

  it('drops a command held through the check when its own player is paused meanwhile, even once they are back', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { first, tabs } = await admitPlayerAndTwoTabs();
    const { revision } = (await syncView(first)).snapshot;
    peer.reconcileMode = 'hold';
    const beforeDenial = first.messages.length;
    await signOut(tabs, 'registration-b', ['registration-a', 'registration-b']);
    await eventually(() => peer.accountChecks().some((record) => !record.response.writableEnded), 'the account check');
    first.send({ type: 'command', commandId: 'before-pause', action: { kind: 'phase' }, expectedRevision: revision });
    await new Promise((resolve) => setTimeout(resolve, 200));
    /* The watch transport drops while the check is out, so the player's own grant lapses and the page pauses. */
    const previous = await peer.query();
    peer.httpMode = 'hold';
    previous.connection.socket.close(1012, 'controlled reconnect');
    await eventually(
      () => first.messages.slice(beforeDenial).find((message) => message.status === 'suspended'),
      'the pause'
    );
    const current = await peer.query(({ query }) => query.args[0].generation !== previous.query.args[0].generation);
    const beforeValidation = peer.requests.length;
    peer.answer(current);
    /* The new watch and its validation grant the player again before the check ends, so they are back the moment the lease returns. */
    const validation = await eventually(
      () =>
        peer.requests.slice(beforeValidation).find((record) => record.function === 'playAdmission:watchAuthorizations'),
      'the validation of the new watch'
    );
    validation.release(peer.result(validation.args));
    await eventually(() => validation.completedAt, 'the validation answered');
    await new Promise((resolve) => setTimeout(resolve, 100));
    peer.releaseAccounts();
    await eventually(() => first.messages.slice(beforeDenial).some(isFullView), 'the view after the pause');
    await new Promise((resolve) => setTimeout(resolve, 300));
    /* The page discarded the command on the pause, so the room never applies it. */
    expect(first.messages.some((message) => message.completedCommandId === 'before-pause')).toBe(false);
    expect((await syncView(first)).snapshot.revision).toBe(revision);
  });

  const catalogueRead = (slug) => () => ({
    type: 'catalogue',
    requestId: 'held-capture',
    selection: { type: 'token-disc', slug },
  });
  const spawnRequest = (slug) => (expectedRevision) => ({
    type: 'command',
    commandId: 'held-capture',
    expectedRevision,
    action: { kind: 'spawn-request', type: 'token-disc', slug },
  });
  /* The catalogue refuses an asset it does not hold, and a refusal takes its own path back to the player. */
  const heldCaptures = {
    'catalogue read': [catalogueRead('held-token'), (message) => message.contents?.name === 'held-token'],
    'refused catalogue read': [
      catalogueRead('missing-token'),
      (message) => message.type === 'catalogue' && message.error,
    ],
    'spawn request': [spawnRequest('held-token'), (message) => message.completedCommandId === 'held-capture'],
    'refused spawn request': [
      spawnRequest('missing-token'),
      (message) => message.type === 'rejected' && message.requestId === 'held-capture',
    ],
  };

  it.each(Object.keys(heldCaptures))(
    "answers a %s whose catalogue call returns during another player's sign-out once the check ends",
    async (kind) => {
      expect((await provision(runtime)).status).toBe(200);
      peer.catalogue.set('token-disc/held-token', tokenPage('held-token'));
      const { first, tabs } = await admitPlayerAndTwoTabs();
      const { revision } = (await syncView(first)).snapshot;
      peer.catalogueMode = 'hold';
      const before = peer.requests.length;
      const [request, answers] = heldCaptures[kind];
      first.send(request(revision));
      const capture = await eventually(
        () => peer.requests.slice(before).find((record) => record.function === 'playCatalogue:assetSupply'),
        'the held catalogue call'
      );
      peer.reconcileMode = 'hold';
      const beforeDenial = first.messages.length;
      await signOut(tabs, 'registration-b', ['registration-a', 'registration-b']);
      await eventually(
        () => peer.accountChecks().some((record) => !record.response.writableEnded),
        'the account check'
      );
      capture.release(peer.catalogue.get(`token-disc/${capture.args.slug}`) ?? null);
      await eventually(() => capture.completedAt, 'the catalogue call answered');
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(first.messages.slice(beforeDenial)).toEqual([]);
      peer.releaseAccounts();
      await eventually(() => first.messages.length > beforeDenial, 'the frame after the check');
      /* The page frees its one capture slot only on this answer or on a pause, so without either the picker waits for good. */
      await eventually(() => first.messages.slice(beforeDenial).find(answers), `the answer to the ${kind}`);
      expect(first.messages.slice(beforeDenial).filter(pausedOrReset)).toEqual([]);
    },
    10_000
  );

  it('drops motion sent while a sign-out is being checked, then takes the next frame', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { first, tabs } = await admitPlayerAndTwoTabs();
    const own = (await syncView(first)).viewer.connectionId;
    peer.reconcileMode = 'hold';
    const beforeDenial = first.messages.length;
    await signOut(tabs, 'registration-b', ['registration-a', 'registration-b']);
    await eventually(() => peer.accountChecks().some((record) => !record.response.writableEnded), 'the account check');
    /* Motion skips the fence a command waits on, so a frame sent while the room checks accounts is dropped, not held. */
    first.send({ type: 'pointer', seq: 0, position: [1, 0.38, 0] });
    await new Promise((resolve) => setTimeout(resolve, 200));
    peer.releaseAccounts();
    await eventually(() => first.messages.slice(beforeDenial).some((message) => message.type === 'view'), 'the frame');
    expect((await syncView(first)).pointers.map((pointer) => pointer.connectionId)).not.toContain(own);
    first.send({ type: 'pointer', seq: 1, position: [2, 0.38, 0] });
    await eventually(
      async () => (await syncView(first)).pointers.some((pointer) => pointer.connectionId === own),
      'the next pointer'
    );
    expect(first.closed).toBe(false);
  });

  it('pauses the other player as before when the account check after a sign-out fails', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { first, tabs } = await admitPlayerAndTwoTabs();
    peer.reconcileMode = 'error';
    const beforeDenial = first.messages.length;
    await signOut(tabs, 'registration-b', ['registration-a', 'registration-b']);
    const [pause] = await eventually(() => {
      const since = first.messages.slice(beforeDenial);
      return since.length && since;
    }, 'the pause after the failed check');
    /* A check that cannot finish releases no frame; the player is paused as before. */
    expect(pause).toEqual({ type: 'admission', status: 'suspended' });
    peer.reconcileMode = 'answer';
    await eventually(() => first.messages.slice(beforeDenial).some(isFullView), 'a full view once the check succeeds');
    expect(first.closed).toBe(false);
  });

  it('retains carry replay history when authorization suspends and recovers on the same socket', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection, view } = await admit();
    const begin = {
      type: 'begin',
      carryId: 'carry-before-suspension',
      sourcePieceId: 'harkonnen-force-stack',
      expectedVersion: 0,
      pickup: 'top',
    };
    connection.send(begin);
    await connection.message('carry');
    connection.send({ type: 'cancel', carryId: begin.carryId });
    await connection.message('view', (message) => message.sequence > view.sequence && message.carries.length === 0);

    const beforeSuspension = connection.messages.length;
    const previous = await peer.query();
    previous.connection.socket.close(1012, 'controlled reconnect');
    await eventually(
      () =>
        connection.messages
          .slice(beforeSuspension)
          .some((message) => message.type === 'admission' && message.status === 'suspended'),
      'same-socket authorization suspension'
    );
    expect(connection.closed).toBe(false);
    const current = await peer.query(({ query }) => query.args[0].generation !== previous.query.args[0].generation);
    peer.answer(current);
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

  async function confirmationRequest(index) {
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

  async function recoverLostConfirmation(setupDelay, annotate) {
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

  it('restores committed state, receipt and history from the same SQLite store, never its old grant or transients', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const first = await admit();
    const command = { type: 'command', commandId: 'phase-1', action: { kind: 'phase' }, expectedRevision: 0 };
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

    const previousGeneration = peer.latestQuery().query.args[0].generation;
    await runtime.restart();
    const restored = await openGame(runtime);
    restored.send({ type: 'metrics' });
    restored.send({ type: 'history', step: 1 });
    restored.send({ type: 'admit', ticket: 'd'.repeat(64) });
    const current = await peer.query(({ query }) => query.args[0].generation !== previousGeneration);
    expect(restored.messages.every((message) => message.type === 'admission')).toBe(true);
    peer.answer(current);
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

    const warmGeneration = current.query.args[0].generation;
    await runtime.restart();
    peer.httpMode = 'hold';
    const revoked = await openGame(runtime);
    revoked.send({ type: 'admit', ticket: 'e'.repeat(64) });
    const cold = await peer.query(({ query }) => query.args[0].generation !== warmGeneration);
    peer.answer(cold, false);
    await eventually(() => revoked.closed, 'cold revoked admission');
    expect(revoked.messages.every((message) => message.type === 'admission')).toBe(true);
  }, 15_000);
});
