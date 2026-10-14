import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_PHASE_PRIORITY } from '../../src/shared/factions/extraPhases';
import { PHASE_CHANGE_COOLDOWN_MS } from '../../src/shared/play/phases';
import type { ClientMessage } from '../../src/shared/play/protocol';
import { SHARED_ITEM_PLACEMENT_ANCHORS } from '../../src/shared/play/tableFurnitureLayout';
import { applyPatch } from './history';
import { draftingRuntime } from './native-drafting.fixture.ts';
import { readSnapshot } from './native-runtime.fixture.ts';
import type { NativeMessage } from './native-runtime.fixture.ts';
import type { NativeConnection } from './native-runtime.fixture.ts';
import { required } from './native-runtime.fixture.ts';
import type { NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import { accepted, admitPlayer, eventually, seat, sendCommand, syncView } from './native-runtime.fixture.ts';
import type { StoredSnapshot } from './state';
import { storedSnapshotSchema } from './state';

describe('Real-game setup progression', () => {
  let peer: NativePeer, runtime: NativeRuntime, offset: number;
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
  const admit = (suffix: string) => admitPlayer(peer, runtime, suffix);
  const stored = async () =>
    readSnapshot((await runtime.exec<{ data: string }>('SELECT data FROM current_state'))[0].data);
  async function enter(prediction = false) {
    if (prediction) {
      await runtime.exec(
        "UPDATE captures SET data=json_set(data,'$.definition.extraPhases',json(?)) WHERE kind='faction' AND source_id='atreides'",
        [
          JSON.stringify([
            {
              id: 'winner',
              type: 'prediction' as const,
              title: 'Predict victory',
              instructions: 'Choose the winner and turn.',
              symbol: '/vector/icon/traitor.svg' as const,
              before: 'traitors' as const,
              priority: 10,
              allPlayersMustBeReady: false,
            },
          ]),
        ]
      );
    }
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    await accepted(a, { kind: 'draft-ready' as const, ready: true });
    await accepted(b, { kind: 'draft-ready' as const, ready: true });
    await eventually(async () => (await syncView(a)).snapshot.stage === 'swapping', 'assignment');
    for (const connection of [a, b]) {
      const view = await syncView(connection);
      await accepted(connection, {
        kind: 'swap-ready' as const,
        ready: true,
        round: required(view.snapshot.swapping).round,
        seat: view.viewer.viewerSeat,
      });
    }
    expect((await syncView(a)).snapshot.stage).toBe('setup');
    return [a, b];
  }
  async function next(connection: NativeConnection, direction: -1 | 1 = 1) {
    offset += PHASE_CHANGE_COOLDOWN_MS + 1;
    await runtime.clock(offset);
    return accepted(connection, { kind: 'phase' as const, direction });
  }
  async function allReady(a: NativeConnection, b: NativeConnection) {
    await accepted(a, { kind: 'ready' as const, ready: true });
    return accepted(b, { kind: 'ready' as const, ready: true });
  }

  it('locks privately, survives receipt rollback and replacement, and reveals only on the faction player command', async () => {
    const players = await enter(true);
    const views = await Promise.all(players.map(syncView));
    const ownIndex = views.findIndex(
      (view) =>
        required(
          required(required(view.snapshot.roster).seats.find((seat) => seat.id === view.viewer.viewerSeat)).faction
        ).id === 'atreides'
    );
    const owner = players[ownIndex];
    const foreign = players[1 - ownIndex];
    const observer = await admit('observer');
    const choice = { factionId: 'harkonnen', turn: 17 };
    const action = {
      kind: 'prediction-lock' as const,
      stepId: required(views[ownIndex].snapshot.setup).steps[0].id,
      choice,
    };
    expect((await sendCommand(owner, { kind: 'phase' as const })).reply.type).toBe('rejected');
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
    expect(required(locked.predictions)[action.stepId].choice).toEqual(choice);
    const saved = await stored();
    owner.send(committed.message);
    await syncView(owner);
    expect(await stored()).toEqual(saved);
    for (const connection of [foreign, observer]) {
      const snapshot = (await syncView(connection)).snapshot;
      expect(required(snapshot.predictions)[action.stepId]).not.toHaveProperty('choice');
      expect(JSON.stringify(connection.messages)).not.toContain('"turn":17');
      const step = (await runtime.exec<{ step: number }>('SELECT MAX(step) AS step FROM history'))[0].step;
      connection.send({ type: 'history' as const, step });
      expect(required((await connection.message('history')).snapshot.predictions)[action.stepId]).not.toHaveProperty(
        'choice'
      );
    }
    for (const suffix of ['snapshot', 'history', 'predictions']) {
      const response = await runtime.fetch(`/__play/games/fixture-game/${suffix}`);
      expect(await response.text()).not.toContain('"turn":17');
    }
    const ownerSeat = views[ownIndex].viewer.viewerSeat;
    await accepted(owner, { kind: 'seat-depart' as const });
    const replacement = await admit('replacement');
    await seat(replacement, foreign, ownerSeat);
    expect(required((await syncView(replacement)).snapshot.predictions)[action.stepId].choice).toEqual(choice);
    expect((await sendCommand(owner, { kind: 'prediction-reveal' as const, stepId: action.stepId })).reply.type).toBe(
      'rejected'
    );
    await next(replacement);
    const { snapshot: revealed } = await accepted(replacement, {
      kind: 'prediction-reveal' as const,
      stepId: action.stepId,
    });
    expect(required(revealed.predictions)[action.stepId].revealedAt).not.toBeNull();
    expect(required((await syncView(observer)).snapshot.predictions)[action.stepId].choice).toEqual(choice);
    await runtime.restart();
    expect((await syncView(await admit('replacement'))).snapshot.predictions).toEqual(revealed.predictions);
  });

  it('takes phase declarations from the catalogue definition into setup and the turn, and a game that declares none has no prediction step (#1466)', async () => {
    /* This game's factions declare nothing, so setup is the two standard steps with no prediction. */
    const [plain] = await enter();
    const standard = (await syncView(plain)).snapshot;
    expect(required(standard.setup).steps.map((step) => step.kind)).toEqual(['traitors', 'forces']);

    /*
     * A second game reads its factions from a catalogue where Atreides carries the #1466 declaration and one turn phase.
     * The deal captures them through the ordinary path; nothing writes the retained record.
     */
    await runtime.close();
    await peer.close();

    ({ peer, runtime } = await draftingRuntime());
    offset = 0;
    const prediction = {
      id: 'bene-gesserit-prediction',
      type: 'prediction' as const,
      title: 'Bene Gesserit prediction',
      instructions: 'Secretly predict the faction that will win and the turn it will win.',
      symbol: '/vector/icon/fate.svg' as const,
      before: 'traitors' as const,
      priority: DEFAULT_PHASE_PRIORITY,
      allPlayersMustBeReady: false,
    };
    const negotiation = {
      id: 'guild-negotiations',
      type: 'instruction' as const,
      title: 'Guild negotiations',
      instructions: 'Agree on shipping rates before the auction.',
      symbol: '/vector/icon/heighliners.svg' as const,
      before: 'bidding' as const,
      priority: DEFAULT_PHASE_PRIORITY,
      allPlayersMustBeReady: false,
    };
    const atreides = peer.factions.get('atreides');
    peer.factions.set('atreides', {
      ...required(atreides),
      data: { ...required(required(atreides).data), extraPhases: [prediction, negotiation] },
    });
    const players = await enter();
    const views = await Promise.all(players.map(syncView));
    const ownIndex = views.findIndex(
      (view) =>
        required(
          required(required(view.snapshot.roster).seats.find((seat) => seat.id === view.viewer.viewerSeat)).faction
        ).id === 'atreides'
    );
    const [owner, foreign] = [players[ownIndex], players[1 - ownIndex]];
    const steps = required(views[ownIndex].snapshot.setup).steps;
    expect(steps.map((step) => step.kind)).toEqual(['prediction', 'traitors', 'forces']);
    expect(steps[0]).toMatchObject({
      kind: 'prediction' as const,
      factionId: 'atreides',
      title: 'Bene Gesserit prediction',
      symbol: '/vector/icon/fate.svg' as const,
      allPlayersMustBeReady: false,
    });

    /* The owner locks the prediction; Traitors and Starting troops gate on readiness, then Next opens Turn 1. */
    await accepted(owner, {
      kind: 'prediction-lock' as const,
      stepId: steps[0].id,
      choice: { factionId: 'harkonnen', turn: 3 },
    });
    await next(owner);
    await allReady(owner, foreign);
    await next(owner);
    await allReady(owner, foreign);
    const { snapshot: playing } = await next(owner);
    expect(playing.stage).toBe('play');
    const ids = required(playing.phases).map((phase) => phase.id);
    const bidding = ids.indexOf('bidding');
    expect(required(playing.phases)[bidding - 1]).toMatchObject({
      id: 'atreides:guild-negotiations',
      kind: 'faction' as const,
      factionId: 'atreides',
      label: 'Guild negotiations',
      symbol: '/vector/icon/heighliners.svg' as const,
    });
    expect(ids.filter((id: string) => id.startsWith('atreides:'))).toEqual(['atreides:guild-negotiations']);
  });

  it('gathers tabletop traitors after readiness without interrupting a carry or touching private hands', async () => {
    const [a, b] = await enter();
    let view = await syncView(a);
    const deck = view.snapshot.table.pieces.find((piece) => piece.stackKey === 'cards:traitor');
    await accepted(a, { kind: 'deck-draw' as const, pieceId: required(deck).id });
    view = await syncView(a);
    const hand = view.snapshot.hand;
    const physical = (await stored()).table.pieces
      .filter((piece) => piece.stackKey === 'cards:traitor')
      .flatMap((piece) => piece.items.map((item) => item.id));
    a.send({
      type: 'begin' as const,
      carryId: 'held-traitors',
      sourcePieceId: required(deck).id,
      expectedVersion: view.snapshot.versions[required(deck).id],
      pickup: 'whole',
    });
    await a.message('carry');
    const { snapshot: ready } = await allReady(a, b);
    expect(required(ready.setup).index).toBe(0);
    expect(ready.stage).toBe('setup');
    const { snapshot: moved } = await accepted(b, { kind: 'phase' as const });
    expect(required(moved.setup).steps[required(moved.setup).index].kind).toBe('forces');
    expect(required(moved.controls).ready).toEqual([]);
    const held = (await syncView(a)).carries;
    expect(JSON.stringify(held)).toContain('held-traitors');
    const watcher = await admit('watcher');
    const received = watcher.messages.length;
    a.send({ type: 'cancel' as const, carryId: 'held-traitors' });
    await eventually(
      () =>
        watcher.messages
          .slice(received)
          .some((entry) => entry.type === 'view' && entry.snapshot.revision > moved.revision),
      'cleanup broadcast to another viewer'
    );
    await eventually(async () => (await stored()).pendingTraitors.length === 0, 'deferred cleanup');
    const after = await stored();
    const gathered = after.table.pieces.filter((piece) => piece.stackKey === 'cards:traitor');
    expect(gathered).toHaveLength(1);
    expect(gathered[0].position[0]).toBe(SHARED_ITEM_PLACEMENT_ANCHORS[0].position[0]);
    expect(gathered[0].position[2]).toBe(SHARED_ITEM_PLACEMENT_ANCHORS[0].position[2]);
    expect(gathered[0].items.map((item) => item.id).sort()).toEqual(physical.sort());
    expect((await syncView(a)).snapshot.hand).toEqual(hand);
    const { snapshot: previous } = await next(b, -1);
    expect(required(previous.setup).mapRevealed).toBe(true);
    expect(required((await syncView(a)).snapshot.controls).ready).toEqual([]);
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
      type: 'begin' as const,
      carryId: 'cleanup-rollback',
      sourcePieceId: required(deck).id,
      expectedVersion: view.snapshot.versions[required(deck).id],
      pickup: 'whole',
    });
    await a.message('carry', (message) => message.carryId === 'cleanup-rollback');
    await allReady(a, b);
    await accepted(b, { kind: 'phase' as const });
    const before = await stored();
    expect(before.pendingTraitors.length).toBeGreaterThan(0);
    const history = await runtime.exec('SELECT * FROM history ORDER BY step');
    const receipts = await runtime.exec('SELECT * FROM receipts ORDER BY receipt_key');
    const held = (await syncView(a)).carries;
    await runtime.exec(
      "CREATE TRIGGER refuse_cleanup BEFORE UPDATE ON current_state WHEN json_array_length(NEW.data, '$.pendingTraitors')=0 BEGIN SELECT RAISE(ABORT, 'cleanup failure'); END"
    );
    const drop: Extract<ClientMessage, { type: 'drop' }> = {
      type: 'drop' as const,
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
      () =>
        a.messages
          .slice(sent)
          .some((message) => 'completedCommandId' in message && message.completedCommandId === drop.commandId),
      'drop completion'
    );
    const completed = await syncView(a);
    expect(completed.carries).toEqual([]);
    const saved = await stored();
    expect(saved.pendingTraitors).toEqual([]);
    expect(saved.revision).toBeGreaterThan(before.revision);
    const gathered = saved.table.pieces.find((piece) => piece.stackKey === 'cards:traitor');
    expect(required(gathered).position[0]).toBe(SHARED_ITEM_PLACEMENT_ANCHORS[0].position[0]);
    expect(required(gathered).position[2]).toBe(SHARED_ITEM_PLACEMENT_ANCHORS[0].position[2]);
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

  it('delivers deferred cleanup to other viewers after a rejected drop releases its carry', async () => {
    const [a, b] = await enter();
    await accepted(a, { kind: 'ready' as const, ready: false }, 'used-before-drop');
    const view = await syncView(a);
    const deck = view.snapshot.table.pieces.find((piece) => piece.stackKey === 'cards:traitor');
    a.send({
      type: 'begin' as const,
      carryId: 'rejected-cleanup',
      sourcePieceId: required(deck).id,
      expectedVersion: view.snapshot.versions[required(deck).id],
      pickup: 'whole',
    });
    await a.message('carry', (message) => message.carryId === 'rejected-cleanup');
    await allReady(a, b);
    await accepted(b, { kind: 'phase' as const });
    const pending = await stored();
    expect(pending.pendingTraitors.length).toBeGreaterThan(0);
    const observer = await admit('watcher');
    const received = observer.messages.length;
    a.send({
      type: 'drop' as const,
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
          .find(
            (message): message is Extract<NativeMessage, { type: 'view' }> =>
              message.type === 'view' && message.snapshot.revision > pending.revision
          ),
      'rejected-drop cleanup reaches another viewer'
    );
    const saved = await stored();
    expect(saved.pendingTraitors).toEqual([]);
    expect(delivered.snapshot.revision).toBe(saved.revision);
    expect(delivered.carries).toEqual([]);
    expect(delivered.snapshot.table.pieces).toEqual((await syncView(b)).snapshot.table.pieces);
  });

  it('stores each setup step as its change and replays every one to the state the room held', async () => {
    const players = await enter(true);
    const views = await Promise.all(players.map(syncView));
    const ownIndex = views.findIndex(
      (view) =>
        required(
          required(required(view.snapshot.roster).seats.find((seat) => seat.id === view.viewer.viewerSeat)).faction
        ).id === 'atreides'
    );
    const [owner, foreign] = [players[ownIndex], players[1 - ownIndex]];
    const held = new Map<number, StoredSnapshot>();
    const keep = async () => {
      const state = storedSnapshotSchema.parse(await stored());
      held.set(state.revision, state);
    };
    const choice = { factionId: 'harkonnen', turn: 3 };
    await accepted(owner, {
      kind: 'prediction-lock' as const,
      stepId: required(views[ownIndex].snapshot.setup).steps[0].id,
      choice,
    });
    await keep();
    await next(owner);
    await keep();
    await allReady(owner, foreign);
    await keep();
    await next(owner);
    await keep();
    await allReady(owner, foreign);
    await keep();
    expect((await next(owner)).snapshot.stage).toBe('play');
    await keep();

    const rows = await runtime.exec<{ step: number; kind: string; revision: number; data: string }>(
      'SELECT step, kind, revision, data FROM history ORDER BY step'
    );
    let replayed;
    let compared = 0;
    for (const row of rows) {
      replayed =
        row.kind === 'checkpoint'
          ? storedSnapshotSchema.parse(JSON.parse(row.data))
          : storedSnapshotSchema.parse(applyPatch(required(replayed), JSON.parse(row.data)));
      expect(replayed.revision).toBe(row.revision);
      if (held.has(row.revision)) {
        expect(replayed).toEqual(held.get(row.revision));
        compared++;
      }
    }
    expect(compared).toBe(held.size);
    /* The private prediction travels through the stored steps; setup steps are patches, and Turn 1 is a checkpoint. */
    const kinds = new Map(rows.map((row) => [row.revision, row.kind]));
    const revisions = [...held.keys()];
    expect(
      Object.values(required(held.get(revisions[0])).privatePredictions).map((prediction) => prediction.choice)
    ).toEqual([choice]);
    expect(revisions.slice(0, -1).map((revision) => kinds.get(revision))).toEqual(
      revisions.slice(0, -1).map(() => 'patch')
    );
    expect(kinds.get(required(revisions.at(-1)))).toBe('checkpoint');
    expect(required(held.get(required(revisions.at(-1)))).stage).toBe('play');

    await runtime.restart();
    const restored = await syncView(await admit('a'));
    expect(restored.snapshot.revision).toBe(required(replayed).revision);
    expect(restored.snapshot.stage).toBe('play');
  });

  it('records readiness changes while repeated readiness and gathering leave history unchanged', async () => {
    const [a] = await enter();
    const history = () =>
      runtime.exec<{ step: number; revision: number }>('SELECT step, revision FROM history ORDER BY step');
    const before = await history();
    await accepted(a, { kind: 'ready' as const, ready: false });
    expect(await history()).toEqual(before);
    const { snapshot: ready } = await accepted(a, { kind: 'ready' as const, ready: true });
    const changed = await history();
    expect(changed).toHaveLength(before.length + 1);
    expect(required(changed.at(-1)).revision).toBe(ready.revision);
    await accepted(a, { kind: 'ready' as const, ready: true }, 'ready-again');
    expect(await history()).toEqual(changed);
    const { snapshot: unready } = await accepted(a, { kind: 'ready' as const, ready: false });
    expect(required((await history()).at(-1)).revision).toBe(unready.revision);
    await accepted(a, { kind: 'traitors-gather' as const });
    const gathered = await history();
    await accepted(a, { kind: 'traitors-gather' as const }, 'gather-again');
    expect(await history()).toEqual(gathered);
    await runtime.restart();
    expect(await history()).toEqual(gathered);
    expect(required((await syncView(await admit('a'))).snapshot.controls).ready).toEqual([]);
  });

  it('requires occupied ready seats and explicit Next into Storm, retaining reconnect readiness but resetting a new visit', async () => {
    const [a, b] = await enter();
    await allReady(a, b);
    await next(a);
    await allReady(a, b);
    const before = (await syncView(a)).snapshot;
    expect(before.stage).toBe('setup');
    const oldSeat = (await syncView(b)).viewer.viewerSeat;
    await accepted(b, { kind: 'seat-depart' as const });
    offset += PHASE_CHANGE_COOLDOWN_MS + 1;
    await runtime.clock(offset);
    expect((await sendCommand(a, { kind: 'phase' as const })).reply.type).toBe('rejected');
    const c = await admit('c');
    await seat(c, a, oldSeat);
    expect(required((await syncView(c)).snapshot.controls).ready).not.toContain(oldSeat);
    expect((await sendCommand(a, { kind: 'phase' as const })).reply.type).toBe('rejected');
    await accepted(c, { kind: 'ready' as const, ready: true });
    a.socket.close();
    const reconnected = await admit('a');
    expect(required((await syncView(reconnected)).snapshot.controls).ready).toHaveLength(2);
    const { snapshot: playing } = await next(reconnected);
    expect(playing.stage).toBe('play');
    expect(playing.phase).toBe(0);
    expect(required(playing.controls).ready).toEqual([]);
    const { snapshot: randomized } = await accepted(c, { kind: 'storm-random' as const });
    expect(randomized.table.stormSectorIndex).toBeGreaterThanOrEqual(0);
    expect(randomized.table.stormSectorIndex).toBeLessThan(18);
    await next(c);
    expect((await sendCommand(c, { kind: 'storm-random' as const })).reply.type).toBe('rejected');
    await accepted(c, { kind: 'traitors-gather' as const });
    expect(await runtime.exec('SELECT COUNT(*) AS count FROM setup_supply')).toEqual([{ count: 1 }]);
  });
});
