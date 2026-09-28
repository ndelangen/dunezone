import { afterEach, describe, expect, it } from 'vitest';

import { PHASE_CHANGE_COOLDOWN_MS, TABLE_PHASES } from '../../src/shared/play/phases';
import { draftingRuntime } from './native-drafting.fixture.mjs';
import {
  accepted,
  admitPlayer,
  eventually,
  isFullView,
  seat,
  sendCommand,
  syncView,
} from './native-runtime.fixture.mjs';

/*
 * Whole journeys through one real game, each on its own isolated runtime and synthetic accounts:
 * creation, drafting, the deal, trading, setup and play, a declared result and Continue playing.
 * Every suite beside this one proves one rule; these prove the rules still hold when a single game
 * passes through all of them, including a reconnect, a cold restart, a reply that never arrived,
 * a directory that refused writes, a replacement and account deletions on the way.
 */

const LATEST = Number.MAX_SAFE_INTEGER;
const MENTAT = TABLE_PHASES.findIndex((phase) => phase.id === 'mentat-pause');
const SECRET = 'a'.repeat(64);
/* Sixteen more houses beside Atreides and Harkonnen, so eighteen players can each be dealt one. */
const HOUSES = Array.from({ length: 16 }, (_, index) => [`house-${index + 1}`, `House ${index + 1}`]);

describe('A real game from creation to continuation', { timeout: 240_000 }, () => {
  let peer, runtime, offset;
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
    runtime = peer = undefined;
  });

  async function open(extras = []) {
    ({ peer, runtime } = await draftingRuntime(extras));
    offset = 0;
  }
  const admit = (suffix) => admitPlayer(peer, runtime, suffix);
  /** The rejection message a command earns, or null when it is accepted. */
  const rejection = async (connection, action) => {
    const { reply } = await sendCommand(connection, action);
    return reply.type === 'rejected' ? reply.message : null;
  };
  const summaries = () => peer.summaries;
  /* Answered directory deliveries with the given status; a request still open has no status yet. */
  const deliveries = (status) =>
    peer.requests.filter(
      (request) =>
        request.function === 'playDirectory:publishSummary' &&
        request.response.writableEnded &&
        request.response.statusCode === status
    );
  const refusals = () => deliveries(503).length;
  const deleteAccount = (userId) =>
    runtime.fetch('/__play/games/fixture-game/account-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: 'fixture-game',
        secret: SECRET,
        userId,
        eventId: `deletion-${userId}`,
        deletionOperationId: `operation-${userId}`,
      }),
    });
  async function page(connection, tab = 'game') {
    const start = connection.messages.length;
    connection.send({ type: 'log-history', tab, before: LATEST });
    const result = await eventually(
      () => connection.messages.slice(start).find((message) => message.type === 'log-history' && message.tab === tab),
      `${tab} log page`
    );
    return result.entries.map((entry) => entry.text);
  }
  async function next(connection) {
    offset += PHASE_CHANGE_COOLDOWN_MS + 1;
    await runtime.clock(offset);
    return accepted(connection, { kind: 'phase', direction: 1 });
  }
  /** Restarts the runtime and puts the fresh isolate's clock back where the test had moved it. */
  async function restart() {
    await runtime.restart();
    await runtime.clock(offset);
  }
  /** Readies every seat in the order given, whatever the stage asks readiness for. */
  async function readyAll(connections) {
    for (const connection of connections) {
      await accepted(connection, { kind: 'ready', ready: true });
    }
  }

  /** The creator admits first; everyone after is seated through the creator's approval, then all ready the draft. */
  async function draft(suffixes) {
    const players = [];
    for (const suffix of suffixes) {
      const connection = await admit(suffix);
      if (players.length) {
        await seat(connection, players[0]);
      }
      players.push(connection);
    }
    for (const connection of players) {
      await accepted(connection, { kind: 'draft-ready', ready: true });
    }
    await eventually(async () => (await syncView(players[0])).snapshot.stage === 'swapping', 'the deal', 20_000);
    return players;
  }
  /** Readies one seat to keep what it was dealt; false once trading has already closed. */
  async function keepSeat(connection) {
    const view = await syncView(connection);
    if (view.snapshot.stage !== 'swapping') {
      return false;
    }
    await accepted(connection, {
      kind: 'swap-ready',
      ready: true,
      round: view.snapshot.swapping.round,
      seat: view.viewer.viewerSeat,
    });
    return true;
  }
  const unready = (snapshot) =>
    snapshot.stage === 'setup' && snapshot.controls.ready.length < snapshot.roster.seats.length;
  /** Every seat keeps what it was dealt, until trading closes. */
  async function keepSeats(players) {
    for (const connection of players) {
      if (!(await keepSeat(connection))) {
        return;
      }
    }
  }
  /** Setup runs through to the first phase of play, readying every seat whenever it waits for them. */
  async function throughSetup(players) {
    let { snapshot } = await syncView(players[0]);
    for (let guard = 0; guard < 8 && snapshot.stage !== 'play'; guard++) {
      if (unready(snapshot)) {
        await readyAll(players);
      }
      ({ snapshot } = await next(players[0]));
    }
    expect(snapshot.stage).toBe('play');
  }
  async function toPlay(players) {
    await keepSeats(players);
    await throughSetup(players);
  }
  /*
   * Sends a withdrawal and drops the socket before its reply can arrive, then reconnects and sends
   * the identical message again, twice. Returns the new connection and the view before the loss.
   */
  async function loseReplyThenRetry(suffix, connection) {
    const before = await syncView(connection);
    const lost = {
      type: 'command',
      commandId: 'lost-withdrawal',
      action: { kind: 'bank-withdraw', amount: 3 },
      expectedRevision: before.snapshot.revision,
    };
    connection.send(lost);
    connection.socket.close();
    await eventually(() => connection.closed, 'dropped socket');
    const again = await admit(suffix);
    /* One reply is one frame from the Worker; the view the fixture assembles from an update repeats its id. */
    const outcomes = () =>
      again.messages.filter((entry) => {
        if (entry.type === 'rejected') {
          return entry.requestId === lost.commandId;
        }
        return (entry.type === 'update' || isFullView(entry)) && entry.completedCommandId === lost.commandId;
      });
    for (const count of [1, 2]) {
      again.send(lost);
      const [refused] = (await eventually(() => outcomes().length >= count && outcomes(), 'retried withdrawal')).filter(
        (entry) => entry.type === 'rejected'
      );
      expect(refused?.message).toBeUndefined();
    }
    return { again, before };
  }
  /** What a seat sees survives a reconnect or a restart unchanged. */
  function expectSameSeat(restored, before) {
    expect(restored.viewer.viewerSeat).toBe(before.viewer.viewerSeat);
    expect(restored.snapshot.bank).toEqual(before.snapshot.bank);
    expect(restored.snapshot.stage).toBe(before.snapshot.stage);
    expect(restored.snapshot.phase).toBe(before.snapshot.phase);
    expect(restored.snapshot.roster).toEqual(before.snapshot.roster);
    expect(restored.snapshot.table.pieces).toEqual(before.snapshot.table.pieces);
  }
  /** Advances play to the Mentat pause, which is never more than one round of phases away. */
  async function toMentat(connection) {
    const atMentat = (snapshot) => snapshot.phase % TABLE_PHASES.length === MENTAT;
    let { snapshot } = await syncView(connection);
    for (let guard = 0; guard < TABLE_PHASES.length && !atMentat(snapshot); guard++) {
      ({ snapshot } = await next(connection));
    }
    expect(atMentat(snapshot)).toBe(true);
  }

  it('takes two accounts from creation through a finished and continued game across failures and restarts', async () => {
    await open();
    /* Creation: the lobby hears of the game once, drafting, with only its creator seated. */
    await eventually(() => summaries().length === 1, 'opening summary');
    expect(summaries()[0].summary).toMatchObject({ stage: 'drafting', seatCount: 2, result: null });

    /* The directory refuses writes while the second player sits down; play carries on regardless. */
    peer.directoryMode = 'error';
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    await eventually(() => refusals() >= 1, 'refused directory write');
    expect((await syncView(a)).snapshot.roster.seats).toHaveLength(2);
    await eventually(async () => (await runtime.alarm()).scheduledAt !== null, 'directory retry alarm');
    peer.directoryMode = 'ack';
    /* The retry is due on the room clock, which workerd's alarm does not read; move it past the backoff first. */
    offset += 30_000;
    await runtime.clock(offset);
    await runtime.alarm(true);
    await eventually(
      () => deliveries(200).some((request) => request.args.summary.seats.length === 2),
      'acknowledged summary with two seats'
    );
    await eventually(async () => (await runtime.alarm()).scheduledAt === null, 'settled directory alarm');

    await accepted(b, { kind: 'draft-ready', ready: true });
    await accepted(a, { kind: 'draft-ready', ready: true });
    await eventually(async () => (await syncView(a)).snapshot.stage === 'swapping', 'the deal', 20_000);

    /* Two distinct accounts hold two distinct factions and see only their own bank. */
    const [viewA, viewB] = await Promise.all([a, b].map(syncView));
    expect(viewA.viewer.userId).not.toBe(viewB.viewer.userId);
    expect(viewA.viewer.viewerSeat).not.toBe(viewB.viewer.viewerSeat);
    const factions = viewA.snapshot.roster.seats.map((entry) => entry.faction.id).sort();
    expect(factions).toEqual(['atreides', 'harkonnen']);
    expect(viewA.snapshot.bank.factionId).not.toBe(viewB.snapshot.bank.factionId);

    await toPlay([a, b]);

    /* A reply that never arrives: the socket drops right after a withdrawal is sent, and the retries debit once. */
    const { again: b2, before: beforeLoss } = await loseReplyThenRetry('b', b);
    const afterRetry = await syncView(b2);
    expect(afterRetry.snapshot.bank.balance).toBe(beforeLoss.snapshot.bank.balance - 3);
    expect(afterRetry.snapshot.table.pieces.length).toBe(beforeLoss.snapshot.table.pieces.length + 1);

    /* Reconnect: a player who drops and comes back finds the same seat, bank and table. */
    const beforeReconnect = await syncView(a);
    a.socket.close();
    await eventually(() => a.closed, 'closed socket');
    const a2 = await admit('a');
    expectSameSeat(await syncView(a2), beforeReconnect);

    /* Cold restore in play: the room comes back from storage with every projection intact. */
    const beforeRestart = await Promise.all([a2, b2].map(syncView));
    await restart();
    const [a3, b3] = [await admit('a'), await admit('b')];
    const afterRestart = await Promise.all([a3, b3].map(syncView));
    afterRestart.forEach((restored, index) => expectSameSeat(restored, beforeRestart[index]));

    /* The end: the directory refuses the finished summary, the game finishes anyway and the alarm delivers it. */
    await toMentat(a3);
    await accepted(a3, { kind: 'result-open' });
    peer.directoryMode = 'error';
    const failedBefore = refusals();
    const finished = await accepted(a3, { kind: 'result-declare', result: 'faction', factionIds: ['harkonnen'] });
    expect(finished.snapshot.stage).toBe('finished');
    await eventually(() => refusals() > failedBefore, 'refused finished summary');
    await eventually(async () => (await runtime.alarm()).scheduledAt !== null, 'directory retry alarm');
    peer.directoryMode = 'ack';
    const refusedCount = summaries().length;
    /*
     * Every phase above shifted the room clock, so the retry is due in shifted time while workerd
     * fires alarms on the real clock. Move the room clock past it before firing the alarm.
     */
    offset += 30_000;
    await runtime.clock(offset);
    await runtime.alarm(true);
    const delivered = await eventually(
      () =>
        summaries()
          .slice(refusedCount)
          .find((args) => args.summary.stage === 'finished'),
      'finished summary from the alarm'
    );
    expect(delivered.summary.result).toMatchObject({
      kind: 'faction',
      factions: [{ id: 'harkonnen', name: 'Harkonnen' }],
      declaredBy: 'user-a',
    });

    /* A finished game survives a restart, and either player may continue it. */
    await restart();
    const b4 = await admit('b');
    const restoredFinished = await syncView(b4);
    expect(restoredFinished.snapshot.stage).toBe('finished');
    expect(restoredFinished.snapshot.result).toMatchObject({ kind: 'faction', factionIds: ['harkonnen'] });
    const continued = await accepted(b4, { kind: 'result-continue' });
    expect(continued.snapshot.stage).toBe('play');
    expect(continued.snapshot.phase).toBe(finished.snapshot.phase);
    expect(continued.snapshot.table.pieces).toEqual(finished.snapshot.table.pieces);
    await eventually(
      () => summaries().at(-1).summary.stage === 'play' && summaries().at(-1).summary.result === null,
      'continued summary'
    );

    /* The public log kept the whole journey in order, naming who ended and who continued. */
    const log = await page(b4);
    expect(log.slice(0, 3)).toEqual([
      'Synthetic B continued the game.',
      'Synthetic A declared the result: Harkonnen won.',
      'Synthetic A started determining the winner.',
    ]);
    const audit = await page(b4, 'audit');
    expect(audit.at(-1)).toBe('Synthetic A created the game and took seat 1.');
    expect(audit).toContain('Synthetic B took seat 2, approved by Synthetic A.');
    /* Every delivery the directory acknowledged carried a newer sequence than the one before. */
    const sequences = deliveries(200).map((request) => request.args.sequence);
    expect(sequences.every((sequence, index) => index === 0 || sequence > sequences[index - 1])).toBe(true);
  });

  it('deals, plays, finishes and continues an eighteen-player game with a distinct station and bank for each account', async () => {
    await open(HOUSES);
    const suffixes = ['a', ...Array.from({ length: 17 }, (_, index) => `p${String(index + 2).padStart(2, '0')}`)];
    const players = await draft(suffixes);
    const spectator = await admit('watcher');

    const views = await Promise.all(players.map(syncView));
    const { roster } = views[0].snapshot;
    expect(roster.seatCount).toBe(18);
    expect(roster.seats).toHaveLength(18);
    expect(new Set(views.map((view) => view.viewer.userId)).size).toBe(18);
    expect(new Set(views.map((view) => view.viewer.viewerSeat)).size).toBe(18);
    expect(new Set(roster.seats.map((entry) => entry.faction.id)).size).toBe(18);
    expect(new Set(roster.seats.map((entry) => entry.position))).toEqual(
      new Set(Array.from({ length: 18 }, (_, i) => i))
    );
    for (const view of views) {
      const own = roster.seats.find((entry) => entry.id === view.viewer.viewerSeat);
      expect(view.snapshot.bank.factionId).toBe(own.faction.id);
    }
    expect((await syncView(spectator)).snapshot.bank).toBeUndefined();

    await toPlay(players);
    await toMentat(players[0]);
    const last = players.at(-1);
    const allies = roster.seats.slice(0, 3).map((entry) => entry.faction.id);
    await accepted(last, { kind: 'result-open' });
    const finished = await accepted(last, { kind: 'result-declare', result: 'alliance', factionIds: allies });
    expect(finished.snapshot.result).toMatchObject({ kind: 'alliance', factionIds: allies });
    const summary = await eventually(
      () => summaries().findLast((args) => args.summary.stage === 'finished'),
      'finished summary'
    );
    expect(summary.summary.seats).toHaveLength(18);
    expect(summary.summary.result.factions.map((entry) => entry.id)).toEqual(allies);

    await restart();
    const middle = await admit(suffixes[9]);
    const restored = await syncView(middle);
    expect(restored.snapshot.stage).toBe('finished');
    expect(restored.snapshot.roster).toEqual(roster);
    expect(restored.snapshot.bank.factionId).toBe(
      roster.seats.find((e) => e.id === restored.viewer.viewerSeat).faction.id
    );
    const continued = await accepted(middle, { kind: 'result-continue' });
    expect(continued.snapshot.stage).toBe('play');
    expect(continued.snapshot.phase % TABLE_PHASES.length).toBe(MENTAT);
    expect(await rejection(await admit('watcher'), { kind: 'result-open' })).toBe(
      'Only current players in a real game can determine the winner.'
    );
  });

  it('keeps a running game whole through a replacement, deletions of a player and of the declarer, and the last departure', async () => {
    await open();
    const [a, b] = await draft(['a', 'b']);
    await toPlay([a, b]);

    /* A player leaves mid-game; the seat keeps its faction and bank for whoever replaces them. */
    const leaving = await syncView(b);
    const heldSeat = leaving.viewer.viewerSeat;
    const heldBank = leaving.snapshot.bank;
    const left = await accepted(b, { kind: 'seat-depart' });
    expect(left.viewer.viewerSeat).toBe('neutral');
    expect(left.snapshot.bank).toBeUndefined();
    const c = await admit('c');
    const replaced = await seat(c, a, heldSeat);
    expect(replaced.viewer.viewerSeat).toBe(heldSeat);
    expect(replaced.snapshot.bank).toEqual(heldBank);
    expect(await rejection(b, { kind: 'ready', ready: true })).toMatch(/^Spectators/);

    /* The replacement can end the game; the declarer then deletes their account. */
    await toMentat(c);
    await accepted(c, { kind: 'result-open' });
    const finished = await accepted(c, { kind: 'result-declare', result: 'none', factionIds: [] });
    expect(finished.snapshot.result.by.name).toBe('Synthetic C');
    expect((await deleteAccount('user-c')).status).toBe(200);
    await eventually(() => c.closed, 'deleted socket closed');
    const afterDeletion = await syncView(a);
    expect(afterDeletion.snapshot.stage).toBe('finished');
    expect(afterDeletion.snapshot.result.by.name).toBe('[deleted user]');
    expect(afterDeletion.snapshot.roster.seats.find((entry) => entry.id === heldSeat).faction).not.toBeNull();
    expect(await page(a)).toContain('[deleted user] declared the result: No winner.');

    /* The remaining player continues; a restart keeps the scrub; the last departure discards the game. */
    await accepted(a, { kind: 'result-continue' });
    await restart();
    const a2 = await admit('a');
    const restored = await syncView(a2);
    expect(restored.snapshot.stage).toBe('play');
    const stored = JSON.stringify(
      await runtime.exec('SELECT data FROM current_state UNION ALL SELECT data FROM history')
    );
    expect(stored).not.toContain('Synthetic C');
    expect(JSON.stringify(await page(a2, 'audit'))).not.toContain('Synthetic C');
    const discarded = await accepted(a2, { kind: 'seat-depart' });
    expect(discarded.snapshot.stage).toBe('discarded');
    await eventually(() => summaries().at(-1).summary.stage === 'discarded', 'discarded summary');
  });
});
