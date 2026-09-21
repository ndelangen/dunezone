import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { draftingRuntime } from './native-drafting.fixture.mjs';
import { admitPlayer, eventually, sendCommand, syncView } from './native-runtime.fixture.mjs';

describe('Real-game setup progression', () => {
  let peer, runtime, offset;
  beforeEach(async () => {
    ({ peer, runtime } = await draftingRuntime());
    offset = 0;
    for (const id of ['atreides', 'harkonnen']) {
      await runtime.capture('faction', id, { provisional: true });
    }
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  const admit = (suffix) => admitPlayer(peer, runtime, suffix);
  const stored = async () => JSON.parse((await runtime.exec('SELECT data FROM current_state'))[0].data);
  async function accepted(connection, action, id) {
    const result = await sendCommand(connection, action, id);
    expect(result.reply.type, JSON.stringify(result.reply)).not.toBe('rejected');
    return (await syncView(connection)).snapshot;
  }
  async function seat(connection, approver, target) {
    const snapshot = await accepted(connection, { kind: 'seat-request', ...(target ? { seat: target } : {}) });
    const request = snapshot.controls.seatRequests.find((entry) => entry.own);
    await accepted(approver, { kind: 'seat-approve', requestId: request.id });
  }
  async function enter(prediction = false) {
    if (prediction) {
      await runtime.exec(
        "UPDATE captures SET data=json_set(data,'$.setupPhases',json(?)) WHERE kind='faction' AND source_id='atreides'",
        [
          JSON.stringify([
            {
              id: 'winner',
              name: 'prediction',
              title: 'Predict victory',
              instructions: 'Choose the winner and turn.',
              symbol: '/vector/icon/traitor.svg',
            },
          ]),
        ]
      );
    }
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    await accepted(a, { kind: 'draft-ready', ready: true });
    await accepted(b, { kind: 'draft-ready', ready: true });
    await eventually(async () => (await syncView(a)).snapshot.stage === 'swapping', 'assignment');
    for (const connection of [a, b]) {
      const view = await syncView(connection);
      await accepted(connection, {
        kind: 'swap-ready',
        ready: true,
        round: view.snapshot.swapping.round,
        seat: view.viewer.viewerSeat,
      });
    }
    expect((await syncView(a)).snapshot.stage).toBe('setup');
    return [a, b];
  }
  async function next(connection, direction = 1) {
    offset += 8001;
    await runtime.clock(offset);
    return accepted(connection, { kind: 'phase', direction });
  }
  async function allReady(a, b) {
    await accepted(a, { kind: 'ready', ready: true });
    return accepted(b, { kind: 'ready', ready: true });
  }

  it('locks privately, survives receipt rollback and replacement, and reveals only on the faction player command', async () => {
    const players = await enter(true);
    const views = await Promise.all(players.map(syncView));
    const ownIndex = views.findIndex(
      (view) => view.snapshot.roster.seats.find((seat) => seat.id === view.viewer.viewerSeat).faction.id === 'atreides'
    );
    const owner = players[ownIndex];
    const foreign = players[1 - ownIndex];
    const observer = await admit('observer');
    const choice = { factionId: 'harkonnen', turn: 17 };
    const action = { kind: 'prediction-lock', stepId: views[ownIndex].snapshot.setup.steps[0].id, choice };
    expect((await sendCommand(owner, { kind: 'phase' })).reply.type).toBe('rejected');
    expect((await sendCommand(foreign, action)).reply.type).toBe('rejected');
    const before = await stored();
    await runtime.exec(
      "CREATE TRIGGER refuse_prediction BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'receipt failure'); END"
    );
    expect((await sendCommand(owner, action)).reply.type).toBe('rejected');
    expect(await stored()).toEqual(before);
    await runtime.exec('DROP TRIGGER refuse_prediction');
    const committed = await sendCommand(owner, action, 'lock-once');
    expect(committed.reply.type).not.toBe('rejected');
    const locked = (await syncView(owner)).snapshot;
    expect(locked.predictions[action.stepId].choice).toEqual(choice);
    const saved = await stored();
    owner.send(committed.message);
    await syncView(owner);
    expect(await stored()).toEqual(saved);
    for (const connection of [foreign, observer]) {
      const snapshot = (await syncView(connection)).snapshot;
      expect(snapshot.predictions[action.stepId]).not.toHaveProperty('choice');
      expect(JSON.stringify(connection.messages)).not.toContain('"turn":17');
      const step = (await runtime.exec('SELECT MAX(step) AS step FROM history'))[0].step;
      connection.send({ type: 'history', step });
      expect((await connection.message('history')).snapshot.predictions[action.stepId]).not.toHaveProperty('choice');
    }
    for (const suffix of ['snapshot', 'history', 'predictions']) {
      const response = await runtime.fetch(`/__play/games/fixture-game/${suffix}`);
      expect(await response.text()).not.toContain('"turn":17');
    }
    const ownerSeat = views[ownIndex].viewer.viewerSeat;
    await accepted(owner, { kind: 'seat-depart' });
    const replacement = await admit('replacement');
    await seat(replacement, foreign, ownerSeat);
    expect((await syncView(replacement)).snapshot.predictions[action.stepId].choice).toEqual(choice);
    expect((await sendCommand(owner, { kind: 'prediction-reveal', stepId: action.stepId })).reply.type).toBe(
      'rejected'
    );
    await next(replacement);
    const revealed = await accepted(replacement, { kind: 'prediction-reveal', stepId: action.stepId });
    expect(revealed.predictions[action.stepId].revealedAt).not.toBeNull();
    expect((await syncView(observer)).snapshot.predictions[action.stepId].choice).toEqual(choice);
    await runtime.restart();
    expect((await syncView(await admit('replacement'))).snapshot.predictions).toEqual(revealed.predictions);
  });

  it('gathers tabletop traitors after readiness without interrupting a carry or touching private hands', async () => {
    const [a, b] = await enter();
    let view = await syncView(a);
    const deck = view.snapshot.table.pieces.find((piece) => piece.stackKey === 'cards:traitor');
    await accepted(a, { kind: 'deck-draw', pieceId: deck.id });
    view = await syncView(a);
    const hand = view.snapshot.hand;
    const physical = (await stored()).table.pieces
      .filter((piece) => piece.stackKey === 'cards:traitor')
      .flatMap((piece) => piece.items.map((item) => item.id));
    a.send({
      type: 'begin',
      carryId: 'held-traitors',
      sourcePieceId: deck.id,
      expectedVersion: view.snapshot.versions[deck.id],
      pickup: 'whole',
    });
    await a.message('carry');
    const ready = await allReady(a, b);
    expect(ready.setup.index).toBe(0);
    expect(ready.stage).toBe('setup');
    const moved = await accepted(b, { kind: 'phase' });
    expect(moved.setup.steps[moved.setup.index].kind).toBe('forces');
    expect(moved.controls.ready).toEqual([]);
    const held = (await syncView(a)).carries;
    expect(JSON.stringify(held)).toContain('held-traitors');
    const legacy = await admit('legacy');
    const received = legacy.messages.length;
    a.send({ type: 'cancel', carryId: 'held-traitors' });
    await eventually(
      () =>
        legacy.messages
          .slice(received)
          .some((entry) => entry.type === 'view' && entry.snapshot.revision > moved.revision),
      'cleanup broadcast to legacy viewer'
    );
    await eventually(async () => (await stored()).pendingTraitors.length === 0, 'deferred cleanup');
    const after = await stored();
    const gathered = after.table.pieces.filter((piece) => piece.stackKey === 'cards:traitor');
    expect(gathered).toHaveLength(1);
    expect(gathered[0].position[0]).toBe(0);
    expect(gathered[0].position[2]).toBe(7.5);
    expect(gathered[0].items.map((item) => item.id).sort()).toEqual(physical.sort());
    expect((await syncView(a)).snapshot.hand).toEqual(hand);
    const previous = await next(b, -1);
    expect(previous.setup.mapRevealed).toBe(true);
    expect((await syncView(a)).snapshot.controls.ready).toEqual([]);
    expect((await stored()).table.pieces).toEqual(after.table.pieces);
    await allReady(a, b);
    await next(b);
    expect((await stored()).table.pieces).toEqual(after.table.pieces);
  });

  it('rolls back a drop with its deferred cleanup and preserves the carry for the same command retry', async () => {
    const [a, b] = await enter();
    const view = await syncView(a);
    const deck = view.snapshot.table.pieces.find((piece) => piece.stackKey === 'cards:traitor');
    a.send({
      type: 'begin',
      carryId: 'cleanup-rollback',
      sourcePieceId: deck.id,
      expectedVersion: view.snapshot.versions[deck.id],
      pickup: 'whole',
    });
    await a.message('carry', (message) => message.carryId === 'cleanup-rollback');
    await allReady(a, b);
    await accepted(b, { kind: 'phase' });
    const before = await stored();
    expect(before.pendingTraitors.length).toBeGreaterThan(0);
    const history = await runtime.exec('SELECT * FROM history ORDER BY step');
    const receipts = await runtime.exec('SELECT * FROM receipts ORDER BY receipt_key');
    const held = (await syncView(a)).carries;
    await runtime.exec(
      "CREATE TRIGGER refuse_cleanup BEFORE UPDATE ON current_state WHEN json_array_length(NEW.data, '$.pendingTraitors')=0 BEGIN SELECT RAISE(ABORT, 'cleanup failure'); END"
    );
    const drop = {
      type: 'drop',
      commandId: 'drop-with-cleanup',
      carryId: 'cleanup-rollback',
      position: [0, 0.38, 0],
      orientation: 0,
    };
    a.send(drop);
    await a.message('rejected', (message) => message.requestId === drop.commandId);
    expect(await stored()).toEqual(before);
    expect(await runtime.exec('SELECT * FROM history ORDER BY step')).toEqual(history);
    expect(await runtime.exec('SELECT * FROM receipts ORDER BY receipt_key')).toEqual(receipts);
    const rejected = await syncView(a);
    expect(rejected.snapshot.revision).toBe(before.revision);
    expect(rejected.snapshot.table.pieces).toEqual((await syncView(b)).snapshot.table.pieces);
    expect(rejected.carries).toEqual(held);
    await runtime.exec('DROP TRIGGER refuse_cleanup');
    const sent = a.messages.length;
    a.send(drop);
    await eventually(
      () => a.messages.slice(sent).some((message) => message.completedCommandId === drop.commandId),
      'drop completion'
    );
    const completed = await syncView(a);
    expect(completed.carries).toEqual([]);
    const saved = await stored();
    expect(saved.pendingTraitors).toEqual([]);
    expect(saved.revision).toBeGreaterThan(before.revision);
    const gathered = saved.table.pieces.find((piece) => piece.stackKey === 'cards:traitor');
    expect(gathered.position[0]).toBe(0);
    expect(gathered.position[2]).toBe(7.5);
    const savedHistory = await runtime.exec('SELECT * FROM history ORDER BY step');
    a.send(drop);
    await syncView(a);
    expect(await stored()).toEqual(saved);
    expect(await runtime.exec('SELECT * FROM history ORDER BY step')).toEqual(savedHistory);
    await runtime.restart();
    expect(await stored()).toEqual(saved);
    expect(await runtime.exec('SELECT * FROM history ORDER BY step')).toEqual(savedHistory);
    const restored = await syncView(await admit('a'));
    expect(restored.snapshot.revision).toBe(saved.revision);
    expect(restored.snapshot.table.pieces).toEqual(completed.snapshot.table.pieces);
    expect(restored.carries).toEqual([]);
  });

  it('delivers deferred cleanup to legacy viewers after a rejected drop releases its carry', async () => {
    const [a, b] = await enter();
    await accepted(a, { kind: 'ready', ready: false }, 'used-before-drop');
    const view = await syncView(a);
    const deck = view.snapshot.table.pieces.find((piece) => piece.stackKey === 'cards:traitor');
    a.send({
      type: 'begin',
      carryId: 'rejected-cleanup',
      sourcePieceId: deck.id,
      expectedVersion: view.snapshot.versions[deck.id],
      pickup: 'whole',
    });
    await a.message('carry', (message) => message.carryId === 'rejected-cleanup');
    await allReady(a, b);
    await accepted(b, { kind: 'phase' });
    const pending = await stored();
    expect(pending.pendingTraitors.length).toBeGreaterThan(0);
    const observer = await admit('legacy');
    const received = observer.messages.length;
    a.send({
      type: 'drop',
      commandId: 'used-before-drop',
      carryId: 'rejected-cleanup',
      position: [0, 0.38, 0],
      orientation: 0,
    });
    await a.message('rejected', (message) => message.requestId === 'used-before-drop');
    const delivered = await eventually(
      () =>
        observer.messages
          .slice(received)
          .find((message) => message.type === 'view' && message.snapshot.revision > pending.revision),
      'rejected-drop cleanup reaches legacy viewer'
    );
    const saved = await stored();
    expect(saved.pendingTraitors).toEqual([]);
    expect(delivered.snapshot.revision).toBe(saved.revision);
    expect(delivered.carries).toEqual([]);
    expect(delivered.snapshot.table.pieces).toEqual((await syncView(b)).snapshot.table.pieces);
  });

  it('records readiness changes while repeated readiness and gathering leave history unchanged', async () => {
    const [a] = await enter();
    const history = () => runtime.exec('SELECT step, revision FROM history ORDER BY step');
    const before = await history();
    await accepted(a, { kind: 'ready', ready: false });
    expect(await history()).toEqual(before);
    const ready = await accepted(a, { kind: 'ready', ready: true });
    const changed = await history();
    expect(changed).toHaveLength(before.length + 1);
    expect(changed.at(-1).revision).toBe(ready.revision);
    await accepted(a, { kind: 'ready', ready: true }, 'ready-again');
    expect(await history()).toEqual(changed);
    const unready = await accepted(a, { kind: 'ready', ready: false });
    expect((await history()).at(-1).revision).toBe(unready.revision);
    await accepted(a, { kind: 'traitors-gather' });
    const gathered = await history();
    await accepted(a, { kind: 'traitors-gather' }, 'gather-again');
    expect(await history()).toEqual(gathered);
    await runtime.restart();
    expect(await history()).toEqual(gathered);
    expect((await syncView(await admit('a'))).snapshot.controls.ready).toEqual([]);
  });

  it('requires occupied ready seats and explicit Next into Storm, retaining reconnect readiness but resetting a new visit', async () => {
    const [a, b] = await enter();
    await allReady(a, b);
    await next(a);
    await allReady(a, b);
    const before = (await syncView(a)).snapshot;
    expect(before.stage).toBe('setup');
    const oldSeat = (await syncView(b)).viewer.viewerSeat;
    await accepted(b, { kind: 'seat-depart' });
    offset += 8001;
    await runtime.clock(offset);
    expect((await sendCommand(a, { kind: 'phase' })).reply.type).toBe('rejected');
    const c = await admit('c');
    await seat(c, a, oldSeat);
    expect((await syncView(c)).snapshot.controls.ready).not.toContain(oldSeat);
    expect((await sendCommand(a, { kind: 'phase' })).reply.type).toBe('rejected');
    await accepted(c, { kind: 'ready', ready: true });
    a.socket.close();
    const reconnected = await admit('a');
    expect((await syncView(reconnected)).snapshot.controls.ready).toHaveLength(2);
    const playing = await next(reconnected);
    expect(playing.stage).toBe('play');
    expect(playing.phase).toBe(0);
    expect(playing.controls.ready).toEqual([]);
    const randomized = await accepted(c, { kind: 'storm-random' });
    expect(randomized.table.stormSectorIndex).toBeGreaterThanOrEqual(0);
    expect(randomized.table.stormSectorIndex).toBeLessThan(18);
    await next(c);
    expect((await sendCommand(c, { kind: 'storm-random' })).reply.type).toBe('rejected');
    await accepted(c, { kind: 'traitors-gather' });
    expect(await runtime.exec('SELECT COUNT(*) AS count FROM setup_supply')).toEqual([{ count: 1 }]);
  });
});
