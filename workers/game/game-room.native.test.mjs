import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PLAY_REQUEST_TIMEOUT_MS } from '../../src/shared/play/admission';
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

  it('recovers a confirmation committed before the deadline when its first reply is lost', async () => {
    /*
     * The peer opens the window when it answers validation, so the esbuild build and the Miniflare start are spent
     * outside it. What is left inside is the room's own scheduling plus the held first confirmation, which gives up
     * PLAY_REQUEST_TIMEOUT_MS after it starts. The room keeps its fast retry cadence only while that give-up lands
     * before the deadline, so the window has to outlast it, and the margin is asserted below rather than assumed.
     */
    peer.provisionWindowMs = PLAY_REQUEST_TIMEOUT_MS + 1000;
    peer.holdFirstConfirmation = true;
    peer.failConfirmationBeforeDeadline = true;
    expect((await provision(runtime)).status).toBe(403);
    expect(peer.confirmed).toBe(true);
    const confirmations = () =>
      peer.requests.filter((request) => request.function === 'playProvisioning:confirmProvisioning');
    const [held, refused] = confirmations();
    expect(peer.provisionExpiresAt - held.startedAt).toBeGreaterThan(PLAY_REQUEST_TIMEOUT_MS);
    /* The scenario can otherwise pass without having run: a measured run refused nothing and still satisfied the
       recovery wait. */
    expect(refused?.status).toBe(503);
    await eventually(
      () => confirmations().some((request) => request.startedAt >= peer.provisionExpiresAt),
      'post-deadline confirmation retry',
      8000,
      peer.report
    );
    expect(held.startedAt).toBeLessThan(peer.provisionExpiresAt);
    const { view } = await admit();
    expect(view.snapshot.revision).toBe(0);
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
