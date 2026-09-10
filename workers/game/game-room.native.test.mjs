import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { spiceSupplySlot } from '../../src/shared/play/spiceSupply.ts';
import { createPeer, createRuntime, eventually, openGame, provision } from './native-runtime.fixture.mjs';

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

  it('persists the fixed spice stack, moved stacks, returns and turn boundaries with idempotent receipts', async () => {
    expect((await provision(runtime)).status).toBe(200);
    const { connection, view } = await admit();
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
    expect(firstSpawn.snapshot.table.events[0].message).toBe(`${view.viewer.displayName} spawned 10 spice.`);
    const firstStack = firstSpawn.snapshot.table.pieces.find((piece) => piece.stackKey === 'spice');
    const stacks = spawned.snapshot.table.pieces.filter((piece) => piece.stackKey === 'spice');
    expect(stacks).toHaveLength(1);
    expect(stacks[0].id).toBe(firstStack.id);
    expect(stacks[0].position).toEqual(firstStack.position);
    expect(stacks[0].items.slice(0, 10)).toEqual(firstStack.items);
    expect(stacks[0].items).toHaveLength(12);
    expect(new Set(stacks[0].items.map((item) => item.id)).size).toBe(12);
    expect(spawned.snapshot.table.events[0].message).toBe(`${view.viewer.displayName} spawned 2 spice.`);
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
    connection.send({
      type: 'command',
      commandId: 'select-turn',
      action: { kind: 'turn', turn: 20 },
      expectedRevision: 3,
    });
    const selected = await connection.message('view', (message) => message.completedCommandId === 'select-turn');
    expect(selected.snapshot.phase).toBe(172);
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
    expect(returned.snapshot.table.events[0].message).toBe(
      `${view.viewer.displayName} returned 1 spice to the supply.`
    );
    connection.messages.length = 0;
    connection.send(returnSpice);
    expect(
      (await connection.message('view', (message) => message.completedCommandId === 'delete-spice')).snapshot
    ).toEqual(returned.snapshot);
    connection.send({ type: 'command', commandId: 'save-boundary', action: { kind: 'phase' }, expectedRevision: 7 });
    const boundary = await connection.message('view', (message) => message.completedCommandId === 'save-boundary');
    connection.send({ type: 'metrics' });
    expect(await connection.message('metrics')).toMatchObject({ revision: 8, receiptCount: 8, historySteps: 3 });

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
    peer.registrationId = 'registration-b';
    peer.watchMode = 'allow';
    const second = await openGame(runtime);
    second.send({ type: 'admit', ticket: 'd'.repeat(64) });
    const joined = await second.message('view');
    const originalCarry = joined.carries[0];
    expect(originalCarry.id).toBe('across-phase');
    for (let index = 0; index < 9; index++) {
      second.send({
        type: 'command',
        commandId: `forward-${index}`,
        action: { kind: 'phase' },
        expectedRevision: index,
      });
      const next = await second.message('view', (message) => message.completedCommandId === `forward-${index}`);
      expect(next.snapshot.phase).toBe(index + 1);
      expect(next.carries).toEqual([originalCarry]);
      expect(next.snapshot.versions).toEqual(first.view.snapshot.versions);
      expect(next.snapshot.table.stormSectorIndex).toBe(first.view.snapshot.table.stormSectorIndex);
    }
    second.send({
      type: 'command',
      commandId: 'backward',
      action: { kind: 'phase', direction: -1 },
      expectedRevision: 9,
    });
    const backward = await second.message('view', (message) => message.completedCommandId === 'backward');
    expect(backward.snapshot.phase).toBe(8);
    expect(backward.carries).toEqual([originalCarry]);
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
    expect(await second.message('metrics')).toMatchObject({ revision: 11, historySteps: 10, receiptCount: 11 });
    second.send({ type: 'history', step: 9 });
    expect((await second.message('history', (message) => message.step === 9)).snapshot.phase).toBe(9);
    second.send({ type: 'history', step: 10 });
    expect((await second.message('history', (message) => message.step === 10)).snapshot).toEqual(backward.snapshot);

    await runtime.restart();
    const restored = await openGame(runtime);
    restored.send({ type: 'admit', ticket: 'e'.repeat(64) });
    const restoredView = await restored.message('view');
    expect(restoredView.snapshot).toEqual(dropped.snapshot);
    expect(restoredView.carries).toEqual([]);
    restored.send({ type: 'history', step: 9 });
    expect((await restored.message('history', (message) => message.step === 9)).snapshot.phase).toBe(9);
    restored.send({ type: 'history', step: 10 });
    expect((await restored.message('history', (message) => message.step === 10)).snapshot).toEqual(backward.snapshot);
  }, 15_000);

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
    await first.connection.message(
      'activity',
      (message) => message.carries.length === 1 && message.pointers.length === 1
    );
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
    expect(first.connection.messages.slice(beforeMessages).some((message) => message.type === 'admission')).toBe(false);
    peer.watchMode = 'manual';
    peer.httpMode = 'hold';
    second.socket.close();
    await peer.query(({ query }) => query.args[0].registrationIds.length === 1);
    first.connection.send({ type: 'pointer', seq: 0, position: [2, 0, 0] });
    const afterLeave = await first.connection.message('activity', (message) =>
      message.pointers.some((pointer) => pointer.position[0] === 2)
    );
    expect(afterLeave.carries).toHaveLength(1);
    expect(first.connection.messages.slice(beforeMessages).some((message) => message.type === 'admission')).toBe(false);
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
    await connection.message('activity', (message) => message.carries.length === 0);

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
    const recovered = await connection.message('view', (message) => message !== view);
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
    await first.connection.message(
      'activity',
      (message) => message.carries.length === 1 && message.pointers.length === 1
    );

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
    expect(await restored.message('history')).toEqual(beforeHistory);

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
