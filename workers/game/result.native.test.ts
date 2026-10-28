import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { PHASE_CHANGE_COOLDOWN_MS, TABLE_PHASES } from '../../src/shared/play/phases';
import type { PieceAction } from '../../src/shared/play/protocol';
import { draftingRuntime } from './native-drafting.fixture.ts';
import { messageOf } from './native-runtime.fixture.ts';
import type { NativeMessage } from './native-runtime.fixture.ts';
import type { NativeConnection, NativeView } from './native-runtime.fixture.ts';
import { required } from './native-runtime.fixture.ts';
import type { NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import { accepted, admitPlayer, eventually, seat, sendCommand, syncView } from './native-runtime.fixture.ts';

const LATEST = Number.MAX_SAFE_INTEGER;
const MENTAT = TABLE_PHASES.length - 1;

describe('Determine winner and Continue playing', { timeout: 60_000 }, () => {
  let peer: NativePeer, runtime: NativeRuntime, offset: number;
  beforeEach(async () => {
    ({ peer, runtime } = await draftingRuntime());
    offset = 0;
    for (const id of ['atreides', 'harkonnen']) {
      await runtime.capture('faction', id, { provisional: true });
    }
    await runtime.exec(
      "UPDATE captures SET data=json_set(data,'$.definition.extraPhases',json(?)) WHERE kind='faction' AND source_id='atreides'",
      [
        JSON.stringify([
          {
            id: 'winner',
            type: 'prediction',
            title: 'Predict victory',
            instructions: 'Choose the winner and turn.',
            symbol: '/vector/icon/traitor.svg',
            before: 'traitors',
            priority: 10,
            allPlayersMustBeReady: false,
          },
        ]),
      ]
    );
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  const admit = (suffix: string) => admitPlayer(runtime, suffix);
  const rejected = async (connection: NativeConnection, action: PieceAction) =>
    (await sendCommand(connection, action)).reply.type === 'rejected';
  const factionOf = (view: NativeView) =>
    required(
      required(required(view.snapshot.roster).seats.find((entry) => entry.id === view.viewer.viewerSeat)).faction
    ).id;
  const deliveries = () =>
    peer.requests
      .filter((request) => request.function === 'playDirectory:publishSummary')
      .map((request) => request.args);
  async function next(connection: NativeConnection, direction: -1 | 1 = 1) {
    offset += PHASE_CHANGE_COOLDOWN_MS + 1;
    await runtime.clock(offset);
    return accepted(connection, { kind: 'phase', direction });
  }
  async function page(connection: NativeConnection, tab: 'game' | 'audit' = 'game') {
    const start = connection.messages.length;
    connection.send({ type: 'log-history', tab, before: LATEST });
    const result = await eventually(
      () =>
        connection.messages
          .slice(start)
          .find(
            (message): message is Extract<NativeMessage, { type: 'log-history' }> =>
              message.type === 'log-history' && message.tab === tab
          ),
      `${tab} log page`
    );
    return result.entries;
  }

  /* Two players reach play with Atreides holding a locked prediction, then an observer watches. */
  async function inPlay() {
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
        round: required(view.snapshot.swapping).round,
        seat: view.viewer.viewerSeat,
      });
    }
    const views = await Promise.all([a, b].map(syncView));
    const ownerIndex = views.findIndex((view) => factionOf(view) === 'atreides');
    const [owner, other] = ownerIndex === 0 ? [a, b] : [b, a];
    const stepId = required(required(views)[ownerIndex].snapshot.setup).steps[0].id;
    await accepted(owner, { kind: 'prediction-lock', stepId, choice: { factionId: 'harkonnen', turn: 4 } });
    for (let guard = 0; guard < 8 && (await syncView(owner)).snapshot.stage !== 'play'; guard++) {
      const { snapshot } = await next(owner);
      if (snapshot.stage === 'setup' && required(snapshot.controls).ready.length === 0) {
        await accepted(owner, { kind: 'ready', ready: true });
        await accepted(other, { kind: 'ready', ready: true });
      }
    }
    expect((await syncView(owner)).snapshot.stage).toBe('play');
    const observer = await admit('observer');
    return { owner, other, observer, stepId };
  }
  async function toMentat(connection: NativeConnection) {
    while ((await syncView(connection)).snapshot.phase % TABLE_PHASES.length !== MENTAT) {
      await next(connection);
    }
  }

  it('is offered only during Mentat Pause and only to seated players', async () => {
    const { owner, observer } = await inPlay();
    expect(await rejected(owner, { kind: 'result-open' })).toBe(true);
    await toMentat(owner);
    expect(await rejected(observer, { kind: 'result-open' })).toBe(true);
    const opened = await accepted(owner, { kind: 'result-open' });
    expect(required(opened.snapshot.ending).by).toEqual({
      seat: opened.viewer.viewerSeat,
      name: opened.viewer.displayName,
    });
    expect(JSON.stringify(opened.snapshot)).not.toContain(opened.viewer.userId);
  });

  it('shows every player who is determining and lets only that player declare or stop', async () => {
    const { owner, other, observer } = await inPlay();
    await toMentat(owner);
    const determiner = (await syncView(owner)).viewer.displayName;
    await accepted(owner, { kind: 'result-open' });
    for (const connection of [other, observer]) {
      expect(required(required(await syncView(connection)).snapshot.ending).by.name).toBe(determiner);
    }
    expect(await rejected(other, { kind: 'result-open' })).toBe(true);
    expect(await rejected(other, { kind: 'result-declare', result: 'none', factionIds: [] })).toBe(true);
    expect(await rejected(other, { kind: 'result-cancel' })).toBe(true);
    const stopped = await accepted(owner, { kind: 'result-cancel' });
    expect(stopped.snapshot.ending).toBeUndefined();
    expect(stopped.snapshot.stage).toBe('play');
  });

  it('rejects a result that does not match its kind or names a faction that is not seated', async () => {
    const { owner } = await inPlay();
    await toMentat(owner);
    await accepted(owner, { kind: 'result-open' });
    for (const [result, factionIds] of [
      ['faction', []],
      ['faction', ['atreides', 'harkonnen']],
      ['alliance', ['atreides']],
      ['alliance', ['atreides', 'atreides']],
      ['none', ['atreides']],
      ['faction', ['fremen']],
    ] satisfies [Extract<PieceAction, { kind: 'result-declare' }>['result'], string[]][]) {
      expect(await rejected(owner, { kind: 'result-declare', result, factionIds })).toBe(true);
    }
  });

  it('finishes on one declaration and continues at Mentat Pause of the same turn with the table untouched', async () => {
    const { owner, other, observer, stepId } = await inPlay();
    await toMentat(owner);
    const before = (await syncView(owner)).snapshot;
    await accepted(owner, { kind: 'result-open' });
    const finished = await accepted(owner, { kind: 'result-declare', result: 'faction', factionIds: ['atreides'] });
    expect(finished.snapshot.stage).toBe('finished');
    expect(finished.snapshot.ending).toBeUndefined();
    expect(finished.snapshot.result).toMatchObject({ kind: 'faction', factionIds: ['atreides'] });
    expect(finished.snapshot.phase).toBe(before.phase);
    expect(finished.snapshot.table.pieces).toEqual(before.table.pieces);

    /* The table stays as it was: no table control, but a locked prediction can still be revealed. */
    expect(await rejected(other, { kind: 'phase', direction: 1 })).toBe(true);
    expect(await rejected(observer, { kind: 'result-continue' })).toBe(true);
    const revealed = await accepted(owner, { kind: 'prediction-reveal', stepId });
    expect(required(revealed.snapshot.predictions)[stepId].revealedAt).not.toBeNull();

    const continued = await accepted(other, { kind: 'result-continue' });
    expect(continued.snapshot.stage).toBe('play');
    expect(continued.snapshot.result).toBeUndefined();
    expect(continued.snapshot.phase).toBe(before.phase);
    expect(continued.snapshot.table.pieces).toEqual(before.table.pieces);
    expect(await rejected(other, { kind: 'result-continue' })).toBe(true);

    const [declarer, continuer] = [finished.viewer.displayName, continued.viewer.displayName];
    const game = await page(observer);
    expect(game.slice(0, 5).map((entry) => entry.text)).toEqual([
      `${continuer} continued the game.`,
      'Atreides revealed its prediction: Harkonnen, turn 4.',
      `${declarer} declared the result: Atreides won.`,
      `${declarer} started determining the winner.`,
      'Mentat Pause began.',
    ]);
    expect(game.slice(0, 5).every((entry) => ['phase', 'prediction'].includes(entry.class))).toBe(true);
    expect(game.map((entry) => entry.context).slice(0, 4)).toEqual([
      'Turn 1, Mentat Pause',
      'Finished',
      'Turn 1, Mentat Pause',
      'Turn 1, Mentat Pause',
    ]);
  });

  it('replays only the public table, and only while the game is finished', async () => {
    const { owner, other, observer, stepId } = await inPlay();
    const playback = async (connection: NativeConnection, step: number) => {
      const start = connection.messages.length;
      connection.send({ type: 'history', step });
      return eventually(
        () =>
          connection.messages
            .slice(start)
            .find((message): message is Extract<NativeMessage, { type: 'history' }> => message.type === 'history'),
        `history step ${step}`
      );
    };
    const steps = async (connection: NativeConnection) => {
      const first = await playback(connection, 0);
      const snapshots = [first.snapshot];
      for (let step = 1; step <= first.lastStep; step += 1) {
        snapshots.push((await playback(connection, step)).snapshot);
      }
      return snapshots;
    };
    const refused = async (...connections: NativeConnection[]) => {
      for (const connection of connections) {
        const start = connection.messages.length;
        connection.send({ type: 'history', step: 0 });
        const reply = await eventually(
          () => connection.messages.slice(start).find((message) => message.type === 'rejected'),
          'refused history'
        );
        expect(reply).toMatchObject({ message: 'Replay opens once the game is finished.' });
      }
    };
    /* The owner's replay must be the observer's, step for step, with nothing the seat held then. */
    const assertPublic = async () => {
      const seated = await steps(owner);
      for (const snapshot of seated) {
        for (const key of ['hand', 'handOrder', 'bank', 'peek']) {
          expect(snapshot).not.toHaveProperty(key);
        }
        expect(snapshot.battlePlan ?? null).toBeNull();
        expect(snapshot.predictions?.[stepId]?.choice ?? null).toBeNull();
      }
      expect(seated).toEqual(await steps(observer));
      return seated;
    };

    /* The owner peeks at a deck, then a battle settles: its checkpoint is written while that peek is still open. */
    while (TABLE_PHASES[(await syncView(owner)).snapshot.phase % TABLE_PHASES.length].id !== 'battle') {
      await next(owner);
    }
    const deck = required(
      (await syncView(owner)).snapshot.table.pieces.find((piece) => piece.kind === 'card' && piece.items.length > 0)
    );
    await accepted(owner, { kind: 'peek', pieceId: deck.id });
    const started = await accepted(owner, { kind: 'battle-start', anchor: [0.95, 0.18, -3.05], territory: 'Arrakeen' });
    const battleId = required(started.snapshot.battle).id;
    await accepted(owner, { kind: 'battle-claim', battleId, side: 0 });
    await accepted(other, { kind: 'battle-claim', battleId, side: 1 });
    const plan = { mode: 'custom' as const, troops: [], spice: 0, adjustment: 0, leaderIds: [], cardIds: [] };
    for (const connection of [owner, other]) {
      await accepted(connection, { kind: 'battle-plan', battleId, plan });
      await accepted(connection, { kind: 'battle-ready', battleId, ready: true });
    }
    offset += 120_000;
    await runtime.clock(offset);
    await eventually(async () => (await syncView(owner)).snapshot.battle?.stage === 'revealed', 'reveal', 8000);
    await accepted(owner, { kind: 'battle-outcome', battleId, outcome: 'left' });
    await accepted(other, { kind: 'battle-outcome', battleId, outcome: 'left' });
    const live = (await syncView(owner)).snapshot;
    expect(live.battle).toBeNull();
    expect(live.peek).not.toBeNull();
    expect(live).toHaveProperty('hand');
    expect(live).toHaveProperty('bank');
    /* Players may not keep notes, so nobody looks back while the game is played. */
    await refused(owner, observer);

    await toMentat(owner);
    await accepted(owner, { kind: 'result-open' });
    await accepted(owner, { kind: 'result-declare', result: 'none', factionIds: [] });
    expect((await assertPublic()).some((snapshot) => snapshot.result)).toBe(true);
    await accepted(other, { kind: 'result-continue' });
    await refused(owner, observer);
  });

  it('tells the directory the result, then that the game is ongoing again', async () => {
    const { owner, other } = await inPlay();
    await toMentat(owner);
    const { userId } = (await accepted(owner, { kind: 'result-open' })).viewer;
    await accepted(owner, { kind: 'result-declare', result: 'alliance', factionIds: ['harkonnen', 'atreides'] });
    const finished = await eventually(
      () => deliveries().find((args) => args.summary.stage === 'finished'),
      'finished summary'
    );
    expect(finished.summary.result).toMatchObject({
      kind: 'alliance',
      factions: [
        { id: 'harkonnen', name: expect.any(String) },
        { id: 'atreides', name: expect.any(String) },
      ],
      declaredBy: userId,
    });
    await accepted(other, { kind: 'result-continue' });
    const resumed = await eventually(
      () => deliveries().find((args) => args.summary.stage === 'play' && args.sequence > finished.sequence),
      'continued summary'
    );
    expect(resumed.summary.result).toBeNull();
    expect(resumed.summary.phase).toBe((await syncView(owner)).snapshot.phase);
  });

  it('names a deleted declarer as a deleted user in the result and its history', async () => {
    const { owner, observer } = await inPlay();
    await toMentat(owner);
    const { userId } = (await accepted(owner, { kind: 'result-open' })).viewer;
    await accepted(owner, { kind: 'result-declare', result: 'none', factionIds: [] });
    const response = await runtime.fetch('/__play/games/fixture-game/account-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: 'fixture-game',
        secret: 'a'.repeat(64),
        userId,
        eventId: `deletion-${userId}`,
        deletionOperationId: `operation-${userId}`,
      }),
    });
    expect(response.status).toBe(200);
    const view = await syncView(observer);
    expect(view.snapshot.stage).toBe('finished');
    expect(required(view.snapshot.result).by.name).toBe('[deleted user]');
    expect((await page(observer)).map((entry) => entry.text)).toContain(
      '[deleted user] declared the result: No winner.'
    );
    /* Playback of the finished table names the deleted declarer too. */
    const playback = async (step: number) => {
      const start = observer.messages.length;
      observer.send({ type: 'history', step });
      return eventually(
        () =>
          observer.messages
            .slice(start)
            .find((message): message is Extract<NativeMessage, { type: 'history' }> => message.type === 'history'),
        `history step ${step}`
      );
    };
    const { lastStep } = await playback(0);
    const declared = [];
    for (let step = 0; step <= lastStep; step += 1) {
      const { snapshot } = await playback(step);
      if (snapshot.result) {
        declared.push(snapshot.result.by.name);
      }
    }
    expect(declared.length).toBeGreaterThan(0);
    expect(new Set(declared)).toEqual(new Set(['[deleted user]']));
  });

  it('keeps a finished game whole for reconnects, newcomers and a cold restart, and declares again after continuing', async () => {
    const { owner, other, observer } = await inPlay();
    await toMentat(owner);

    /* The determiner leaves the seat, which ends the sequence; the other player determines instead. */
    await accepted(owner, { kind: 'result-open' });
    const vacated = (await syncView(owner)).viewer.viewerSeat;
    await accepted(owner, { kind: 'seat-depart' });
    expect((await syncView(other)).snapshot.ending).toBeUndefined();
    const asked = await accepted(observer, { kind: 'seat-request', seat: vacated });
    const requestId = required(asked.snapshot.controls).seatRequests[0].id;
    await accepted(other, { kind: 'result-open' });
    const declared = await accepted(other, { kind: 'result-declare', result: 'faction', factionIds: ['harkonnen'] });
    const result = declared.snapshot.result;
    expect(result).toMatchObject({
      kind: 'faction',
      factionIds: ['harkonnen'],
      by: { name: declared.viewer.displayName },
    });

    /* Everyone sees the same finished game: the declarer, a watcher, the player who left and a newcomer. */
    const [stayed, left] = [declared.viewer.userId, (await syncView(owner)).viewer.userId].map((id) =>
      id.slice('user-'.length)
    );
    const returning = await admit(left);
    const [first, second] = [(await syncView(returning)).viewer.displayName, declared.viewer.displayName];
    const newcomer = await admit('late');
    for (const connection of [other, observer, returning, newcomer]) {
      const { snapshot } = await syncView(connection);
      expect(snapshot.stage).toBe('finished');
      expect(snapshot.result).toEqual(result);
      expect(snapshot.ending).toBeUndefined();
    }

    /* The table is held as it ended: a carry and table commands are refused, and so is a new determination. */
    const view = await syncView(other);
    const force = view.snapshot.table.pieces.find((piece) => piece.kind === 'force' && !piece.locked);
    expect(force).toBeDefined();
    const sent = other.messages.length;
    other.send({
      type: 'begin',
      carryId: 'after-the-end',
      sourcePieceId: required(force).id,
      expectedVersion: view.snapshot.versions[required(force).id],
      pickup: 'whole',
    });
    const refusal = await eventually(
      () =>
        other.messages
          .slice(sent)
          .find(
            (message): message is Extract<NativeMessage, { type: 'rejected' }> =>
              message.type === 'rejected' && message.requestId === 'after-the-end'
          ),
      'carry refusal'
    );
    const finishedRefusal = 'The game is finished. Continue playing to change the table.';
    expect(refusal.message).toBe(finishedRefusal);
    for (const action of [
      { kind: 'flip', pieceId: required(force).id },
      { kind: 'spice-spawn', count: 1 },
      { kind: 'ready', ready: true },
    ] satisfies PieceAction[]) {
      expect(messageOf((await sendCommand(other, action)).reply, 'rejected').message).toBe(finishedRefusal);
    }
    expect(await rejected(other, { kind: 'result-open' })).toBe(true);
    expect((await syncView(other)).snapshot.revision).toBe(declared.snapshot.revision);

    /* A finished game seats nobody new, though a seat stands open: a request waiting from before the end can only be withdrawn. */
    const seatRefusal = async (connection: NativeConnection, action: PieceAction) =>
      messageOf((await sendCommand(connection, action)).reply, 'rejected').message;
    expect(await seatRefusal(newcomer, { kind: 'seat-request', seat: vacated })).toBe(
      'The game is finished. Continue playing to take a seat.'
    );
    expect(await seatRefusal(other, { kind: 'seat-approve', requestId })).toBe(
      'The game is finished. Continue playing to take a seat.'
    );
    const withdrawn = await accepted(observer, { kind: 'seat-withdraw' });
    expect(required(withdrawn.snapshot.controls).seatRequests).toEqual([]);
    expect(withdrawn.viewer.viewerSeat).toBe('neutral');

    /* A cold restart wakes finished, with the same result for a player and a watcher. */
    await runtime.restart();
    const player = await admit(stayed);
    const watcher = await admit('observer');
    for (const connection of [player, watcher]) {
      const { snapshot } = await syncView(connection);
      expect(snapshot.stage).toBe('finished');
      expect(snapshot.result).toEqual(result);
    }

    /* Continuing returns to the same Mentat Pause, where the game can be decided again. */
    const continued = await accepted(player, { kind: 'result-continue' });
    expect(continued.snapshot.stage).toBe('play');
    expect(continued.snapshot.phase).toBe(declared.snapshot.phase);
    await accepted(player, { kind: 'result-open' });
    const again = await accepted(player, { kind: 'result-declare', result: 'none', factionIds: [] });
    expect(again.snapshot.stage).toBe('finished');
    expect(again.snapshot.ending).toBeUndefined();
    expect(again.snapshot.result).toMatchObject({ kind: 'none', factionIds: [] });
    const texts = (await page(watcher)).slice(0, 7).map((entry) => entry.text);
    expect(texts).toEqual([
      `${second} declared the result: No winner.`,
      `${second} started determining the winner.`,
      `${second} continued the game.`,
      `${second} declared the result: Harkonnen won.`,
      `${second} started determining the winner.`,
      `Determining the winner by ${first} ended.`,
      `${first} started determining the winner.`,
    ]);
  });

  it('continues with nobody ready, so no single player can move the phase on alone', async () => {
    const { owner, other } = await inPlay();
    await toMentat(owner);
    await accepted(owner, { kind: 'ready', ready: true });
    const allReady = await accepted(other, { kind: 'ready', ready: true });
    expect(required(allReady.snapshot.controls).ready).toHaveLength(2);
    await accepted(owner, { kind: 'result-open' });
    await accepted(owner, { kind: 'result-declare', result: 'none', factionIds: [] });
    const continued = await accepted(other, { kind: 'result-continue' });
    expect(required(continued.snapshot.controls).ready).toEqual([]);
    offset += PHASE_CHANGE_COOLDOWN_MS + 1;
    await runtime.clock(offset);
    const alone = await sendCommand(owner, { kind: 'phase', direction: 1 });
    expect(alone.reply).toMatchObject({
      type: 'rejected',
      message: 'Every seated player must be ready before advancing.',
    });
    await accepted(owner, { kind: 'ready', ready: true });
    await accepted(other, { kind: 'ready', ready: true });
    expect(await rejected(owner, { kind: 'phase', direction: 1 })).toBe(false);
  });

  it('keeps the phase while the winner is being determined, so the declaration still lands', async () => {
    const { owner, other } = await inPlay();
    await toMentat(owner);
    await accepted(owner, { kind: 'result-open' });
    await accepted(owner, { kind: 'ready', ready: true });
    await accepted(other, { kind: 'ready', ready: true });
    offset += PHASE_CHANGE_COOLDOWN_MS + 1;
    await runtime.clock(offset);
    const refused = await sendCommand(other, { kind: 'phase', direction: 1 });
    expect(refused.reply).toMatchObject({
      type: 'rejected',
      message: 'The winner is being determined. Declare or cancel it before moving to the next phase.',
    });
    const declared = await accepted(owner, { kind: 'result-declare', result: 'none', factionIds: [] });
    expect(declared.snapshot.stage).toBe('finished');
  });

  it('keeps the phase when another player goes back while the winner is being determined', async () => {
    const { owner, other } = await inPlay();
    await toMentat(owner);
    await accepted(owner, { kind: 'result-open' });
    offset += PHASE_CHANGE_COOLDOWN_MS + 1;
    await runtime.clock(offset);
    const refused = await sendCommand(other, { kind: 'phase', direction: -1 });
    expect(refused.reply).toMatchObject({
      type: 'rejected',
      message: 'The winner is being determined. Declare or cancel it before going back a phase.',
    });
    const declared = await accepted(owner, { kind: 'result-declare', result: 'none', factionIds: [] });
    expect(declared.snapshot.stage).toBe('finished');
  });

  it('saves a checkpoint each time a faction is marked done in Shipment and Movement, in an order players can rearrange', async () => {
    const { owner, other, observer } = await inPlay();
    const ownFaction = factionOf(await syncView(owner));
    const otherFaction = factionOf(await syncView(other));
    expect(await rejected(owner, { kind: 'movement-done', factionId: ownFaction })).toBe(true);
    while (TABLE_PHASES[(await syncView(owner)).snapshot.phase % TABLE_PHASES.length]!.id !== 'shipment-and-movement') {
      await next(owner);
    }
    expect(await rejected(observer, { kind: 'movement-done', factionId: ownFaction })).toBe(true);
    expect(await rejected(owner, { kind: 'movement-done', factionId: 'not-at-the-table' })).toBe(true);
    expect(await rejected(owner, { kind: 'movement-order', order: [otherFaction, otherFaction] })).toBe(true);
    expect(await rejected(observer, { kind: 'movement-order', order: [otherFaction, ownFaction] })).toBe(true);

    /* Any seated player may rearrange the order, or mark another faction done, as the table plays by hand. */
    const arranged = await accepted(owner, { kind: 'movement-order', order: [otherFaction, ownFaction] });
    expect(required(arranged.snapshot.movement).order).toEqual([otherFaction, ownFaction]);
    const first = await accepted(owner, { kind: 'movement-done', factionId: otherFaction });
    expect(required(first.snapshot.movement).done).toEqual([otherFaction]);
    /* A faction done keeps its place: nothing moves in front of it. */
    expect(await rejected(owner, { kind: 'movement-order', order: [ownFaction, otherFaction] })).toBe(true);
    expect(await rejected(other, { kind: 'movement-done', factionId: otherFaction })).toBe(true);
    const undone = await accepted(other, { kind: 'movement-undo', factionId: otherFaction });
    expect(required(undone.snapshot.movement).done).toEqual([]);
    expect(await rejected(other, { kind: 'movement-undo', factionId: otherFaction })).toBe(true);
    await accepted(other, { kind: 'movement-done', factionId: otherFaction });
    const second = await accepted(owner, { kind: 'movement-done', factionId: ownFaction });
    expect(required(second.snapshot.movement).done).toEqual([otherFaction, ownFaction]);

    /* Each faction marked done is a checkpoint after the phase's start, named by the faction; undoing keeps the checkpoint. */
    const checkpoints = required((await syncView(owner)).snapshot.reviewCheckpoints).slice(-4);
    expect(checkpoints.map(({ moment, label }) => [moment, label])).toEqual([
      ['entered', 'Shipment and Movement'],
      ['turn', 'Shipment and Movement'],
      ['turn', 'Shipment and Movement'],
      ['turn', 'Shipment and Movement'],
    ]);
    expect(checkpoints[1]!.faction).toBe(checkpoints[2]!.faction);
    expect(checkpoints[3]!.faction).toBeTruthy();
    expect(checkpoints[3]!.faction).not.toBe(checkpoints[2]!.faction);

    const moved = await next(owner);
    expect(moved.snapshot.movement).toBeUndefined();
    await next(owner, -1);
    expect((await syncView(owner)).snapshot.movement).toBeUndefined();
  });

  describe('Table review', () => {
    /* The reply to a history read: the checkpoint, or the reason it is refused. */
    async function look(connection: NativeConnection, step: number) {
      const start = connection.messages.length;
      connection.send({ type: 'history', step });
      return eventually(
        () =>
          connection.messages
            .slice(start)
            .find(
              (message): message is Extract<NativeMessage, { type: 'history' | 'rejected' }> =>
                message.type === 'history' || message.type === 'rejected'
            ),
        `history step ${step}`
      );
    }
    async function checkpoint(connection: NativeConnection) {
      const checkpoints = required((await syncView(connection)).snapshot.reviewCheckpoints);
      return required(checkpoints.at(0));
    }

    it('starts on a majority, shows everyone the same public checkpoint, freezes the table and resumes play', async () => {
      const { owner, other, observer } = await inPlay();
      const target = await checkpoint(owner);
      expect(await rejected(observer, { kind: 'review-propose', step: target.step })).toBe(true);
      expect(await rejected(owner, { kind: 'review-propose', step: LATEST })).toBe(true);
      const proposed = await accepted(owner, { kind: 'review-propose', step: target.step });
      const review = required(proposed.snapshot.review);
      expect(review).toMatchObject({ step: target.step, context: target.context, startedAt: null, threshold: 2 });
      expect(required((await syncView(observer)).snapshot.review).id).toBe(review.id);
      expect(await rejected(other, { kind: 'review-propose', step: target.step })).toBe(true);

      /* Until the majority agrees, the table plays on and nobody looks back. */
      await next(owner);
      /* Each offered checkpoint names its turn and phase, so the picker can lay them out by turn. */
      const entered = required(required((await syncView(owner)).snapshot.reviewCheckpoints).at(-1));
      expect(entered).toMatchObject({ turn: expect.any(Number), moment: 'entered', symbol: expect.any(String) });
      expect(entered.context).toBe(`Turn ${entered.turn}, ${entered.label}`);
      expect(await look(observer, target.step)).toMatchObject({ type: 'rejected' });
      const started = await accepted(other, { kind: 'review-ballot', reviewId: review.id, choice: 'review' });
      expect(required(started.snapshot.review).startedAt).not.toBeNull();

      const shown = [];
      for (const connection of [owner, other, observer]) {
        const reply = await look(connection, target.step);
        expect(reply.type).toBe('history');
        const { snapshot } = reply as Extract<NativeMessage, { type: 'history' }>;
        for (const key of ['hand', 'handOrder', 'bank', 'peek']) {
          expect(snapshot).not.toHaveProperty(key);
        }
        shown.push(snapshot);
      }
      expect(shown[0]).toEqual(shown[2]);
      expect(await look(observer, target.step + 1)).toMatchObject({ type: 'rejected' });

      /* Nothing moves while the table reviews, not even a peek. */
      const deck = required(
        (await syncView(owner)).snapshot.table.pieces.find((piece) => piece.kind === 'card' && piece.items.length > 0)
      );
      offset += PHASE_CHANGE_COOLDOWN_MS + 1;
      await runtime.clock(offset);
      for (const action of [
        { kind: 'phase', direction: 1 },
        { kind: 'peek', pieceId: deck.id },
      ] as PieceAction[]) {
        expect(await rejected(owner, action)).toBe(true);
      }
      expect(await rejected(observer, { kind: 'review-end', reviewId: review.id })).toBe(true);

      const ended = await accepted(other, { kind: 'review-end', reviewId: review.id });
      expect(ended.snapshot.review).toBeNull();
      expect(await look(observer, target.step)).toMatchObject({ type: 'rejected' });
      await next(owner);

      const proposer = proposed.viewer.displayName;
      const resumer = ended.viewer.displayName;
      const audit = (await page(observer, 'audit')).map((entry) => entry.text);
      expect(audit[0]).toBe(`The review of ${target.context} was ended by ${resumer}, and play resumed.`);
      expect([
        `The table reviews ${target.context}, as ${proposer} proposed: ${proposer} and ${resumer} agreed.`,
        `The table reviews ${target.context}, as ${proposer} proposed: ${resumer} and ${proposer} agreed.`,
      ]).toContain(audit[1]);
    });

    it('is withdrawn as the game ends, which the Audit tab says', async () => {
      const { owner, observer } = await inPlay();
      await toMentat(owner);
      const target = await checkpoint(owner);
      await accepted(owner, { kind: 'review-propose', step: target.step });
      await accepted(owner, { kind: 'result-open' });
      const finished = await accepted(owner, { kind: 'result-declare', result: 'faction', factionIds: ['atreides'] });
      expect(finished.snapshot.review).toBeUndefined();
      const audit = (await page(observer, 'audit')).map((entry) => entry.text);
      const proposer = finished.viewer.displayName;
      expect(audit).toContain(`The review of ${target.context} ${proposer} proposed was withdrawn as the game ended.`);
    });

    it('is declined without a majority and withdrawn only by its proposer', async () => {
      const { owner, other, observer } = await inPlay();
      const target = await checkpoint(owner);
      const first = required((await accepted(owner, { kind: 'review-propose', step: target.step })).snapshot.review);
      const declined = await accepted(other, { kind: 'review-ballot', reviewId: first.id, choice: 'decline' });
      expect(declined.snapshot.review).toBeNull();
      expect(await look(observer, target.step)).toMatchObject({ type: 'rejected' });

      const second = required((await accepted(owner, { kind: 'review-propose', step: target.step })).snapshot.review);
      expect(await rejected(other, { kind: 'review-end', reviewId: second.id })).toBe(true);
      expect((await accepted(owner, { kind: 'review-end', reviewId: second.id })).snapshot.review).toBeNull();
      const audit = (await page(observer, 'audit')).map((entry) => entry.text);
      const proposer = (await syncView(owner)).viewer.displayName;
      expect(audit.slice(0, 2)).toEqual([
        `The review of ${target.context} ${proposer} proposed was withdrawn by ${proposer}.`,
        `The table declined ${proposer}'s review of ${target.context}: ${proposer} agreed; ${(await syncView(other)).viewer.displayName} declined.`,
      ]);
    });
  });
});
