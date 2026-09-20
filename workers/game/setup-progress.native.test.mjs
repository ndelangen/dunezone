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
