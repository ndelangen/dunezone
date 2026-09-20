import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { draftingRuntime } from './native-drafting.fixture.mjs';
import { admitPlayer, eventually, sendCommand, syncView } from './native-runtime.fixture.mjs';

const LATEST = Number.MAX_SAFE_INTEGER;

describe('The retained public log', { timeout: 20_000 }, () => {
  let peer, runtime, offset;
  beforeEach(async () => {
    ({ peer, runtime } = await draftingRuntime());
    offset = 0;
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  const admit = (suffix) => admitPlayer(peer, runtime, suffix);
  async function accepted(connection, action, id) {
    const sent = await sendCommand(connection, action, id);
    expect(sent.reply.type, JSON.stringify(sent.reply)).not.toBe('rejected');
    return (await syncView(connection)).snapshot;
  }
  async function seat(player, approver, target) {
    const next = await accepted(player, { kind: 'seat-request', ...(target ? { seat: target } : {}) });
    const request = next.controls.seatRequests.find((entry) => entry.own);
    await accepted(approver, { kind: 'seat-approve', requestId: request.id });
    return request.id;
  }
  async function page(connection, tab, before = LATEST) {
    const start = connection.messages.length;
    connection.send({ type: 'log-history', tab, before });
    return eventually(
      () =>
        connection.messages
          .slice(start)
          .find((message) => message.type === 'log-history' && message.tab === tab && message.before === before),
      `${tab} log page`
    );
  }
  const texts = (result) => result.entries.map((entry) => entry.text);
  async function deleteAccount(userId) {
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
  }

  it('files every seat change with its cause and approver, newest first, in the stage it happened', async () => {
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    const c = await admit('c');
    await seat(c, a);
    await accepted(c, { kind: 'seat-depart' });
    const audit = await page(a, 'audit');
    expect(texts(audit)).toEqual([
      'Synthetic C left seat 3.',
      'Synthetic C took seat 3, approved by Synthetic A.',
      'Synthetic B took seat 2, approved by Synthetic A.',
      'Synthetic A created the game and took seat 1.',
    ]);
    expect(audit.entries.map((entry) => [entry.class, entry.context])).toEqual(
      Array.from({ length: 4 }, () => ['seat', 'Drafting'])
    );
    expect(audit.more).toBe(false);
    expect((await page(a, 'game')).entries).toEqual([]);
    /* A spectator reads the same public record. */
    expect(texts(await page(c, 'audit'))).toEqual(texts(audit));
  });

  it('files one entry for a command however often its id is retried', async () => {
    const a = await admit('a');
    const b = await admit('b');
    const next = await accepted(b, { kind: 'seat-request' });
    const request = next.controls.seatRequests.find((entry) => entry.own);
    const view = await syncView(a);
    const message = {
      type: 'command',
      commandId: 'approve-once',
      action: { kind: 'seat-approve', requestId: request.id },
      expectedRevision: view.snapshot.revision,
    };
    a.send(message);
    a.send(message);
    await eventually(
      () => a.messages.filter((entry) => entry.completedCommandId === 'approve-once').length >= 2,
      'both completions'
    );
    expect(texts(await page(a, 'audit'))).toEqual([
      'Synthetic B took seat 2, approved by Synthetic A.',
      'Synthetic A created the game and took seat 1.',
    ]);
  });

  it('records a removal vote with its final breakdown beside the seat it vacated, and a failed one with who kept it', async () => {
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    const c = await admit('c');
    await seat(c, a);
    const seatOfC = (await syncView(c)).viewer.viewerSeat;
    const seatOfB = (await syncView(b)).viewer.viewerSeat;
    const failing = (await accepted(a, { kind: 'removal-start', seat: seatOfB })).removalVotes.find(
      (vote) => vote.target.seat === seatOfB
    );
    await accepted(c, { kind: 'removal-ballot', voteId: failing.id, choice: 'keep' });
    const vote = (await accepted(a, { kind: 'removal-start', seat: seatOfC })).removalVotes.find(
      (entry) => entry.target.seat === seatOfC
    );
    await accepted(b, { kind: 'removal-ballot', voteId: vote.id, choice: 'remove' });
    const audit = await page(a, 'audit');
    expect(texts(audit).slice(0, 3)).toEqual([
      'Synthetic C was removed from seat 3.',
      'Synthetic C is removed from seat 3: Synthetic A and Synthetic B voted remove.',
      'Synthetic B keeps seat 2: Synthetic A voted remove; Synthetic C voted keep.',
    ]);
    expect(audit.entries.slice(0, 3).map((entry) => entry.class)).toEqual(['seat', 'vote', 'vote']);
  });

  it('names a deleted account [deleted user] in every entry and keeps the events', async () => {
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    await deleteAccount('user-a');
    expect(texts(await page(b, 'audit'))).toEqual([
      '[deleted user] left seat 1 when the account was deleted.',
      'Synthetic B took seat 2, approved by [deleted user].',
      '[deleted user] created the game and took seat 1.',
    ]);
  });

  it('pages twenty entries at a time per tab and keeps the order stable', async () => {
    const a = await admit('a');
    for (let index = 0; index < 25; index++) {
      await runtime.exec('INSERT INTO public_log(key,class,template,people,context,created_at) VALUES(?,?,?,?,?,?)', [
        `test:${index}`,
        'phase',
        `Entry ${index} began.`,
        '[]',
        'Turn 1, Storm',
        index,
      ]);
    }
    const first = await page(a, 'game');
    expect(first.entries).toHaveLength(20);
    expect(first.more).toBe(true);
    expect(texts(first)[0]).toBe('Entry 24 began.');
    const second = await page(a, 'game', first.entries.at(-1).sequence);
    expect(texts(second)).toEqual([
      'Entry 4 began.',
      'Entry 3 began.',
      'Entry 2 began.',
      'Entry 1 began.',
      'Entry 0 began.',
    ]);
    expect(second.more).toBe(false);
    expect((await page(a, 'audit')).entries.map((entry) => entry.class)).toEqual(['seat']);
  });

  it('rebuilds the log of a game from before it, once, from the tables its producers kept', async () => {
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    await runtime.exec('DELETE FROM public_log');
    await runtime.exec("UPDATE metadata SET data=json_remove(data,'$.publicLog') WHERE id=1");
    await runtime.exec('INSERT INTO spice_transfers VALUES(?,?,?)', [
      7,
      'user-b',
      JSON.stringify({
        revision: 7,
        kind: 'supply',
        actor: 'Synthetic B',
        amount: 8,
        source: 'supply',
        destination: 'table',
      }),
    ]);
    await runtime.exec('INSERT INTO battle_results VALUES(?,?)', [
      9,
      JSON.stringify({
        id: 'battle-1',
        anchor: [0, 0, 0],
        territory: 'never shown',
        factions: ['atreides', 'harkonnen'],
        plans: [],
        outcome: 'right',
        revision: 9,
      }),
    ]);
    for (let round = 0; round < 2; round++) {
      await runtime.restart();
      const reader = await admit('c');
      expect(texts(await page(reader, 'game'))).toEqual([
        'harkonnen defeated atreides.',
        'Synthetic B supplied 8 spice to the table.',
      ]);
      expect(texts(await page(reader, 'audit'))).toEqual([
        'Synthetic B took seat 2, approved by Synthetic A.',
        'Synthetic A created the game and took seat 1.',
      ]);
    }
  });

  describe('in a game that reaches play', () => {
    beforeEach(async () => {
      for (const id of ['atreides', 'harkonnen']) {
        await runtime.capture('faction', id, { provisional: true });
      }
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
    });
    async function next(connection, direction = 1) {
      offset += 8001;
      await runtime.clock(offset);
      return accepted(connection, { kind: 'phase', direction });
    }
    async function enter() {
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
    const factionOf = (view) =>
      view.snapshot.roster.seats.find((seat) => seat.id === view.viewer.viewerSeat).faction.id;

    it('files predictions without their private choice until revealed, then every phase it enters', async () => {
      const players = await enter();
      const views = await Promise.all(players.map(syncView));
      const ownerIndex = views.findIndex((view) => factionOf(view) === 'atreides');
      const owner = players[ownerIndex];
      const other = players[1 - ownerIndex];
      const stepId = views[ownerIndex].snapshot.setup.steps[0].id;
      await accepted(owner, { kind: 'prediction-lock', stepId, choice: { factionId: 'harkonnen', turn: 4 } });
      let game = await page(other, 'game');
      expect(texts(game)).toEqual(['Atreides locked its prediction.']);
      expect(game.entries[0].context).toBe('Setup, Predict victory');
      await accepted(owner, { kind: 'prediction-reveal', stepId });
      expect(texts(await page(other, 'game'))[0]).toBe('Atreides revealed its prediction: Harkonnen, turn 4.');
      let playing = null;
      for (let guard = 0; guard < 6 && !playing; guard++) {
        const snapshot = await next(owner);
        if (snapshot.stage === 'setup' && snapshot.controls.ready.length === 0) {
          await accepted(owner, { kind: 'ready', ready: true });
          await accepted(other, { kind: 'ready', ready: true });
        }
        if (snapshot.stage === 'play') {
          playing = snapshot;
        }
      }
      if (!playing) {
        const snapshot = await next(owner);
        playing = snapshot.stage === 'play' ? snapshot : null;
      }
      expect(playing?.stage).toBe('play');
      await next(owner);
      await next(owner);
      await next(owner, -1);
      game = await page(other, 'game');
      expect(texts(game).slice(0, 4)).toEqual([
        'Returned to Spice blow.',
        'CHOAM charity began.',
        'Spice blow began.',
        'Turn 1 began.',
      ]);
      expect(game.entries[0].context).toBe('Turn 1, Spice blow');
      expect(game.entries[3].context).toBe('Turn 1, Storm');
      expect(game.entries.slice(0, 4).every((entry) => entry.class === 'phase')).toBe(true);
      expect(game.entries.slice(4).map((entry) => entry.class)).toEqual(['prediction', 'prediction']);
    });
  });
});
