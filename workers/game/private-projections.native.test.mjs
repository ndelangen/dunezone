import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { spiceSupplySlot } from '../../src/shared/play/spiceSupply';
import { createPeer, createRuntime, openGame, provision, eventually } from './native-runtime.fixture.mjs';

describe('Faction privacy through native delivery', () => {
  let peer, runtime;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
    peer.expiresAt = () => Date.now() + 600_000;
    runtime = await createRuntime(peer, 'game');
    if ((await provision(runtime)).status !== 200) {
      throw new Error('The native fixture did not provision.');
    }
    const rows = await runtime.exec('SELECT data FROM current_state WHERE id=1');
    const snapshot = { ...JSON.parse(rows[0].data), factionBanks: { harkonnen: 37, atreides: 83 } };
    await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(snapshot)]);
    await runtime.exec('UPDATE history SET data=? WHERE step=0', [JSON.stringify(snapshot)]);
    await runtime.restart();
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  async function admit(suffix) {
    peer.registrationId = `registration-${suffix}`;
    const connection = await openGame(runtime);
    connection.send({ type: 'admit', ticket: 'c'.repeat(64) });
    await connection.message('view');
    return connection;
  }

  async function sync(connection) {
    const before = connection.messages.length;
    connection.send({ type: 'sync' });
    return eventually(() => connection.messages.slice(before).find((message) => message.type === 'view'), 'fresh view');
  }

  async function command(connection, action, commandId = crypto.randomUUID(), expectedRevision) {
    const view = await sync(connection);
    const message = {
      type: 'command',
      commandId,
      action,
      expectedRevision: expectedRevision ?? view.snapshot.revision,
    };
    const before = connection.messages.length;
    connection.send(message);
    return {
      message,
      reply: await eventually(
        () =>
          connection.messages
            .slice(before)
            .find((entry) =>
              entry.type === 'rejected' ? entry.requestId === commandId : entry.completedCommandId === commandId
            ),
        'bank command result'
      ),
    };
  }

  function assertAudience(connection, factionId, balance) {
    for (const message of connection.messages) {
      expect(JSON.stringify(message)).not.toContain('factionBanks');
      if (message.snapshot) {
        if (factionId) {
          expect(message.snapshot.bank).toEqual({ factionId, balance });
        } else {
          expect(message.snapshot).not.toHaveProperty('bank');
        }
      }
    }
  }

  it('sends only the current faction bank in snapshots, history, reconnects and cold restore', async () => {
    const a = await admit('a');
    const b = await admit('b');
    const observer = await admit('c');
    for (const connection of [a, b, observer]) {
      connection.send({ type: 'history', step: 0 });
      await connection.message('history');
    }
    assertAudience(a, 'harkonnen', 37);
    assertAudience(b, 'atreides', 83);
    assertAudience(observer);
    const tab = await admit('a');
    assertAudience(tab, 'harkonnen', 37);
    await runtime.restart();
    assertAudience(await admit('b'), 'atreides', 83);
    assertAudience(await admit('c'));
    const response = await runtime.fetch('/__play/games/fixture-game/private/harkonnen');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Request refused.' });
  });

  it('revokes an old socket and every tab immediately when the current roster changes', async () => {
    const a = await admit('a');
    await admit('b');
    const tab = await admit('a');
    const replacement = await admit('c');
    await runtime.exec("UPDATE actors SET seat='neutral' WHERE user_id='user-a'");
    await runtime.exec("UPDATE actors SET seat='harkonnen' WHERE user_id='user-c'");
    for (const connection of [a, tab]) {
      const view = await sync(connection);
      expect(view.viewer.viewerSeat).toBe('neutral');
      expect(view.snapshot).not.toHaveProperty('bank');
      connection.messages.length = 0;
      connection.send({ type: 'history', step: 0 });
      await connection.message('history');
      assertAudience(connection);
      connection.send({
        type: 'command',
        commandId: 'stale-player',
        action: { kind: 'spice-spawn', count: 1 },
        expectedRevision: 0,
      });
      expect(await connection.message('rejected')).toMatchObject({ message: expect.stringContaining('Spectators') });
    }
    expect((await sync(replacement)).snapshot.bank).toEqual({ factionId: 'harkonnen', balance: 37 });
    replacement.send({ type: 'history', step: 0 });
    expect((await replacement.message('history')).snapshot.bank).toEqual({ factionId: 'harkonnen', balance: 37 });
  });

  it('keeps the bank with its faction when faction assignments move between seats', async () => {
    const a = await admit('a');
    const b = await admit('b');
    await sync(a);
    await runtime.exec("UPDATE seats SET faction_id='temporary' WHERE seat='harkonnen'");
    await runtime.exec(
      "UPDATE seats SET faction_id='harkonnen', faction_name='Harkonnen', faction_color='#ed927c' WHERE seat='atreides'"
    );
    await runtime.exec(
      "UPDATE seats SET faction_id='atreides', faction_name='Atreides', faction_color='#75d8a7' WHERE seat='harkonnen'"
    );
    a.messages.length = 0;
    b.send({ type: 'pointer', seq: 1, position: [0, 0.38, 0] });
    expect((await a.message('view')).snapshot.bank).toEqual({ factionId: 'atreides', balance: 83 });
    expect((await sync(a)).snapshot.bank).toEqual({ factionId: 'atreides', balance: 83 });
    expect((await sync(b)).snapshot.bank).toEqual({ factionId: 'harkonnen', balance: 37 });
    a.send({ type: 'history', step: 0 });
    expect((await a.message('history')).snapshot.bank).toEqual({ factionId: 'atreides', balance: 83 });
  });

  it('atomically withdraws and collects with private deltas, public effects and once-only receipts', async () => {
    const a = await admit('a');
    const b = await admit('b');
    const observer = await admit('c');
    const initial = await sync(a);
    const withdrawal = await command(a, { kind: 'bank-withdraw', amount: 37 });
    expect(withdrawal.reply.type).toBe('update');
    expect(withdrawal.reply.snapshot.bank).toEqual({ factionId: 'harkonnen', balance: 0 });
    const stack = withdrawal.reply.snapshot.pieces.find((piece) => piece.stackKey === 'spice');
    expect(stack.items).toHaveLength(37);
    const publicUpdate = await b.message('view', (entry) => entry.snapshot.revision === 1);
    expect(publicUpdate.snapshot.bank).toEqual({ factionId: 'atreides', balance: 83 });
    expect(publicUpdate.snapshot.table.pieces.find((piece) => piece.id === stack.id)).toEqual(stack);
    expect((await observer.message('view', (entry) => entry.snapshot.revision === 1)).snapshot).not.toHaveProperty(
      'bank'
    );
    const replayStart = a.messages.length;
    a.send(withdrawal.message);
    const replay = await eventually(
      () => a.messages.slice(replayStart).find((entry) => entry.completedCommandId === withdrawal.message.commandId),
      'withdrawal replay'
    );
    expect(replay.snapshot.bank.balance).toBe(0);
    expect(replay.snapshot.revision).toBe(1);
    expect((await command(a, { kind: 'bank-withdraw', amount: 1 })).reply).toMatchObject({
      type: 'rejected',
      message: expect.stringContaining('not enough'),
    });
    expect((await command(observer, { kind: 'bank-collect', pieceId: stack.id })).reply).toMatchObject({
      type: 'rejected',
      message: expect.stringContaining('Spectators'),
    });
    const collection = await command(b, { kind: 'bank-collect', pieceId: stack.id });
    expect(collection.reply.snapshot.bank).toEqual({ factionId: 'atreides', balance: 120 });
    expect(collection.reply.snapshot.removedPieces).toContain(stack.id);
    const aAfter = await sync(a);
    expect(aAfter.snapshot.bank.balance).toBe(0);
    expect(aAfter.snapshot.table.pieces).toEqual(initial.snapshot.table.pieces);
    expect((await command(a, { kind: 'bank-collect', pieceId: stack.id })).reply.type).toBe('rejected');
    await runtime.restart();
    expect((await sync(await admit('b'))).snapshot.bank.balance).toBe(120);
  });

  it('serializes competing withdrawals and leaves both bank and table unchanged if persistence fails', async () => {
    const a = await admit('a');
    const tab = await admit('a');
    const before = (await sync(a)).snapshot;
    const first = {
      type: 'command',
      commandId: 'first-withdrawal',
      action: { kind: 'bank-withdraw', amount: 30 },
      expectedRevision: before.revision,
    };
    const second = { ...first, commandId: 'second-withdrawal' };
    a.send(first);
    tab.send(second);
    const outcomes = await Promise.all(
      [
        [a, first.commandId],
        [tab, second.commandId],
      ].map(([connection, commandId]) =>
        eventually(
          () =>
            connection.messages.find((entry) =>
              entry.type === 'rejected' ? entry.requestId === commandId : entry.completedCommandId === commandId
            ),
          'competing withdrawal outcome'
        )
      )
    );
    expect(outcomes.filter((entry) => entry.type !== 'rejected')).toHaveLength(1);
    expect(outcomes.find((entry) => entry.type !== 'rejected').snapshot.bank.balance).toBe(7);
    expect(outcomes.find((entry) => entry.type === 'rejected').message).toContain('changed');
    const committed = (await sync(a)).snapshot;
    await runtime.exec(
      "CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'Fixture commit failure'); END"
    );
    expect((await command(a, { kind: 'bank-withdraw', amount: 7 })).reply).toMatchObject({
      type: 'rejected',
      message: 'Unable to process the command.',
    });
    expect((await sync(a)).snapshot).toEqual(committed);
    await runtime.restart();
    expect((await sync(await admit('a'))).snapshot).toEqual(committed);
  });
  it('publishes a paged transfer ledger without balances and leaves spice physical across turns', async () => {
    const a = await admit('a');
    const b = await admit('b');
    const observer = await admit('c');
    for (let index = 0; index < 11; index++) {
      const withdrawal = await command(a, { kind: 'bank-withdraw', amount: 1 });
      expect(withdrawal.reply.type).not.toBe('rejected');
      const stack = (await sync(a)).snapshot.table.pieces.find((piece) => piece.stackKey === 'spice');
      expect((await command(a, { kind: 'bank-collect', pieceId: stack.id })).reply.type).not.toBe('rejected');
    }
    const recent = (await sync(observer)).snapshot.spiceTransfers;
    expect(recent).toHaveLength(20);
    expect(recent[0]).toEqual({
      revision: 22,
      actor: 'Synthetic A',
      kind: 'collection',
      amount: 1,
      source: 'table',
      destination: 'harkonnen',
    });
    observer.send({ type: 'spice-history', before: recent.at(-1).revision });
    const older = await observer.message('spice-history');
    expect(older.more).toBe(false);
    expect(older.entries.map((entry) => entry.revision)).toEqual([2, 1]);
    for (const entry of [...recent, ...older.entries]) {
      expect(Object.keys(entry).sort()).toEqual(['actor', 'amount', 'destination', 'kind', 'revision', 'source']);
    }
    expect((await command(b, { kind: 'spice-spawn', count: 4 })).reply.type).not.toBe('rejected');
    const physical = (await sync(a)).snapshot.table.pieces;
    for (let phase = 0; phase < 9; phase++) {
      await runtime.clock(phase * 8001);
      if (phase === 8) {
        await command(a, { kind: 'ready', ready: true });
        await command(b, { kind: 'ready', ready: true });
      }
      expect((await command(a, { kind: 'phase' })).reply.type).not.toBe('rejected');
    }
    expect((await sync(a)).snapshot).toMatchObject({ phase: 9, bank: { balance: 37 }, table: { pieces: physical } });
    expect((await sync(b)).snapshot.bank.balance).toBe(83);
    await runtime.clock(9 * 8001);
    await command(b, { kind: 'phase', direction: -1 });
    expect((await sync(a)).snapshot.table.pieces).toEqual(physical);
    await runtime.restart();
    const restored = await admit('c');
    restored.send({ type: 'spice-history', before: 3 });
    expect((await restored.message('spice-history')).entries).toEqual(older.entries);
    expect(JSON.stringify(runtime.logs)).not.toMatch(/factionBanks|banked spice|"balance"/);
  }, 30_000);

  it('fences collection against reservations, disposal, invalid targets and stale commands', async () => {
    const a = await admit('a');
    const b = await admit('b');
    const initial = (await sync(a)).snapshot;
    const nonspice = initial.table.pieces.find((piece) => !piece.locked);
    expect((await command(a, { kind: 'bank-collect', pieceId: nonspice.id })).reply).toMatchObject({
      type: 'rejected',
    });
    await command(a, { kind: 'spice-spawn', count: 3 });
    const current = (await sync(a)).snapshot;
    const stack = current.table.pieces.find((piece) => piece.stackKey === 'spice');
    a.send({
      type: 'begin',
      carryId: 'dispose',
      sourcePieceId: stack.id,
      expectedVersion: current.versions[stack.id],
      pickup: 'whole',
    });
    await a.message('carry');
    expect((await command(b, { kind: 'bank-collect', pieceId: stack.id })).reply).toMatchObject({
      type: 'rejected',
      message: expect.stringContaining('carrying'),
    });
    a.send({
      type: 'drop',
      commandId: 'dispose-spice',
      carryId: 'dispose',
      position: spiceSupplySlot().position,
      orientation: 0,
    });
    await eventually(
      () => a.messages.find((message) => message.completedCommandId === 'dispose-spice'),
      'disposal commit'
    );
    expect((await command(b, { kind: 'bank-collect', pieceId: stack.id })).reply.type).toBe('rejected');
    const after = (await sync(a)).snapshot;
    expect(after.bank.balance).toBe(37);
    expect((await sync(b)).snapshot.bank.balance).toBe(83);
    expect(after.spiceTransfers[0]).toEqual({
      revision: 2,
      actor: 'Synthetic A',
      kind: 'disposal',
      amount: 3,
      source: 'table',
    });
    await runtime.exec(
      "UPDATE seats SET faction_id=NULL, faction_name=NULL, faction_color=NULL WHERE seat='harkonnen'"
    );
    expect((await command(a, { kind: 'bank-withdraw', amount: 1 })).reply).toMatchObject({
      type: 'rejected',
      message: expect.stringContaining('current player'),
    });
    expect((await sync(a)).snapshot).not.toHaveProperty('bank');
    await runtime.restart();
    expect((await sync(await admit('a'))).snapshot).not.toHaveProperty('bank');
  });

  it.each(['seated', 'former player', 'restored without controls'])(
    'removes deleted actors from transfer history and fences their existing sockets: %s',
    async (state) => {
      const a = await admit('a');
      const tab = await admit('a');
      let b = await admit('b');
      await command(a, { kind: 'bank-withdraw', amount: 5 });
      await command(b, { kind: 'phase' });
      if (state === 'former player') {
        await runtime.exec("UPDATE actors SET seat='neutral' WHERE user_id=?", ['user-a']);
      } else if (state === 'restored without controls') {
        const rows = await runtime.exec('SELECT data FROM current_state WHERE id=1');
        const snapshot = JSON.parse(rows[0].data);
        delete snapshot.controls;
        await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(snapshot)]);
        await runtime.restart();
      }
      const response = await runtime.fetch('/__play/games/fixture-game/account-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: 'fixture-game',
          secret: 'a'.repeat(64),
          userId: 'user-a',
          eventId: 'deletion-a',
          deletionOperationId: 'operation-a',
        }),
      });
      expect(response.status).toBe(200);
      await eventually(() => a.closed && tab.closed, 'deleted sockets closed');
      if (state === 'restored without controls') {
        b = await admit('b');
      }
      expect((await sync(b)).snapshot.spiceTransfers[0].actor).toBe('[deleted user]');
      b.send({ type: 'history', step: 1 });
      expect((await b.message('history')).snapshot.spiceTransfers[0].actor).toBe('[deleted user]');
      b.send({ type: 'spice-history', before: 10 });
      expect((await b.message('spice-history')).entries[0].actor).toBe('[deleted user]');
      await runtime.restart();
      const replacement = await admit('c');
      expect((await sync(replacement)).snapshot.bank).toEqual({ factionId: 'harkonnen', balance: 32 });
      expect((await sync(replacement)).snapshot.spiceTransfers[0].actor).toBe('[deleted user]');
    }
  );
  it('rejects locked spice, overflow and forged faction fields at the command boundary', async () => {
    const a = await admit('a');
    await command(a, { kind: 'spice-spawn', count: 2 });
    const row = (await runtime.exec('SELECT data FROM current_state WHERE id=1'))[0];
    const snapshot = JSON.parse(row.data);
    const stack = snapshot.table.pieces.find((piece) => piece.stackKey === 'spice');
    stack.locked = true;
    await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(snapshot)]);
    await runtime.restart();
    const locked = await admit('a');
    expect((await command(locked, { kind: 'bank-collect', pieceId: stack.id })).reply).toMatchObject({
      type: 'rejected',
      message: 'Choose an unlocked spice stack on the table.',
    });
    stack.locked = false;
    snapshot.factionBanks.harkonnen = Number.MAX_SAFE_INTEGER;
    await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(snapshot)]);
    await runtime.restart();
    const full = await admit('a');
    expect((await command(full, { kind: 'bank-collect', pieceId: stack.id })).reply).toMatchObject({
      type: 'rejected',
      message: 'This collection exceeds the bank capacity.',
    });
    expect((await sync(full)).snapshot.bank.balance).toBe(Number.MAX_SAFE_INTEGER);
    full.send({
      type: 'command',
      commandId: 'forged-faction',
      expectedRevision: snapshot.revision,
      action: { kind: 'bank-withdraw', amount: 1, factionId: 'atreides' },
    });
    await eventually(() => full.closed, 'forged faction refusal');
    expect((await sync(await admit('a'))).snapshot.table.pieces.find((piece) => piece.id === stack.id)).toEqual(stack);
  });

  it('credits a contested stack once and rolls collection and its ledger back on a failed commit', async () => {
    const a = await admit('a');
    const b = await admit('b');
    await command(a, { kind: 'spice-spawn', count: 6 });
    const view = (await sync(a)).snapshot;
    const stack = view.table.pieces.find((piece) => piece.stackKey === 'spice');
    const commands = [a, b].map((connection, index) => ({
      connection,
      message: {
        type: 'command',
        commandId: `collect-${index}`,
        expectedRevision: view.revision,
        action: { kind: 'bank-collect', pieceId: stack.id },
      },
    }));
    for (const { connection, message } of commands) {
      connection.send(message);
    }
    const replies = await Promise.all(
      commands.map(({ connection, message }) =>
        eventually(
          () =>
            connection.messages.find(
              (entry) => entry.completedCommandId === message.commandId || entry.requestId === message.commandId
            ),
          'contested collection'
        )
      )
    );
    expect(replies.filter((entry) => entry.type === 'rejected')).toHaveLength(1);
    expect((await sync(a)).snapshot.bank.balance + (await sync(b)).snapshot.bank.balance).toBe(126);
    const winner = commands[replies.findIndex((entry) => entry.type !== 'rejected')];
    const reconnected = await admit(winner.connection === a ? 'a' : 'b');
    reconnected.send(winner.message);
    await reconnected.message('view', (entry) => entry.completedCommandId === winner.message.commandId);
    expect((await sync(a)).snapshot.bank.balance + (await sync(b)).snapshot.bank.balance).toBe(126);
    expect((await runtime.exec('SELECT * FROM spice_transfers')).length).toBe(2);
    await command(a, { kind: 'spice-spawn', count: 2 });
    const before = (await sync(a)).snapshot;
    const second = before.table.pieces.find((piece) => piece.stackKey === 'spice');
    await runtime.exec(
      "CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'Fixture commit failure'); END"
    );
    expect((await command(a, { kind: 'bank-collect', pieceId: second.id })).reply.type).toBe('rejected');
    expect((await sync(a)).snapshot).toEqual(before);
    expect((await runtime.exec('SELECT * FROM spice_transfers')).length).toBe(3);
    await runtime.restart();
    expect((await sync(await admit('a'))).snapshot).toEqual(before);
  });

  it('refuses a withdrawal when the table is full without debiting the bank', async () => {
    const row = (await runtime.exec('SELECT data FROM current_state WHERE id=1'))[0];
    const snapshot = JSON.parse(row.data);
    const template = snapshot.table.pieces[0];
    snapshot.table.pieces = [];
    for (let x = -7; x <= 7; x += 0.7) {
      for (let z = -7; z <= 7; z += 0.7) {
        const id = `occupied-${snapshot.table.pieces.length}`;
        snapshot.table.pieces.push({
          ...template,
          id,
          kind: 'marker',
          stackKey: 'occupied',
          position: [x, 0.38, z],
          items: [{ id: `${id}-item`, faceUp: true }],
        });
      }
    }
    await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(snapshot)]);
    await runtime.restart();
    const a = await admit('a');
    expect((await command(a, { kind: 'bank-withdraw', amount: 1 })).reply).toMatchObject({
      type: 'rejected',
      message: 'Make room on the table before withdrawing spice.',
    });
    expect((await sync(a)).snapshot.bank.balance).toBe(37);
  });
  it('changes the audience on activity fanout and suspends sockets whose actor disappeared', async () => {
    const a = await admit('a');
    const b = await admit('b');
    const tab = await admit('a');
    await sync(a);
    await runtime.exec("UPDATE actors SET seat='neutral' WHERE user_id='user-a'");
    a.messages.length = 0;
    tab.messages.length = 0;
    b.send({ type: 'pointer', seq: 1, position: [0, 0.38, 0] });
    for (const connection of [a, tab]) {
      const view = await connection.message('view');
      expect(view.viewer.viewerSeat).toBe('neutral');
      expect(view.snapshot).not.toHaveProperty('bank');
    }
    await runtime.exec("DELETE FROM actors WHERE user_id='user-a'");
    a.send({ type: 'sync' });
    expect(await a.message('admission')).toMatchObject({ status: 'suspended' });
  });
});
