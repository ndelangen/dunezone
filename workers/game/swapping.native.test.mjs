import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { dealt, draftingRuntime } from './native-drafting.fixture.mjs';
import { accepted, admitPlayer, eventually, sendCommand, syncView } from './native-runtime.fixture.mjs';

describe('Swapping on a real game', () => {
  let peer, runtime;
  beforeEach(async () => {
    ({ peer, runtime } = await draftingRuntime([['emperor', 'Emperor']]));
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  const admit = (suffix) => admitPlayer(peer, runtime, suffix);
  const ownRequest = (view) => view.snapshot.controls.seatRequests.find((request) => request.own);
  const deal = (count = 3) => dealt(peer, runtime, count, 'fremen');
  async function trade(connection, action) {
    const view = await syncView(connection);
    return accepted(connection, { ...action, round: view.snapshot.swapping.round, seat: view.viewer.viewerSeat });
  }

  it('exchanges players through reciprocal offers, keeps factions fixed and replays without another move', async () => {
    const [a, b] = await deal(2);
    const before = await syncView(a);
    await trade(a, { kind: 'swap-offer', target: 'seat-2' });
    const offered = await syncView(b);
    const command = {
      type: 'command',
      commandId: 'reciprocal',
      expectedRevision: offered.snapshot.revision,
      action: { kind: 'swap-offer', target: 'seat-1', seat: 'seat-2', round: offered.snapshot.swapping.round },
    };
    b.socket.send(JSON.stringify(command));
    await eventually(async () => (await syncView(a)).viewer.viewerSeat === 'seat-2', 'swap');
    const after = await syncView(a);
    expect(after.snapshot.roster).toEqual(before.snapshot.roster);
    expect(after.snapshot.swapping.deadline).toBe(before.snapshot.swapping.deadline);
    expect(after.snapshot.swapping.offers).toEqual([]);
    b.socket.send(JSON.stringify(command));
    expect((await syncView(b)).viewer.viewerSeat).toBe('seat-1');
    expect(await runtime.exec("SELECT COUNT(*) AS count FROM swap_audit WHERE kind='swap-move'")).toEqual([
      { count: 2 },
    ]);
  });

  it('expires incoming and outgoing offers on readiness without restoring them when readiness is withdrawn', async () => {
    const [a, b, c] = await deal();
    await trade(a, { kind: 'swap-offer', target: 'seat-2' });
    await trade(b, { kind: 'swap-offer', target: 'seat-3' });
    await trade(b, { kind: 'swap-ready', ready: true });
    expect((await syncView(a)).snapshot.swapping.offers).toEqual([]);
    await trade(b, { kind: 'swap-ready', ready: false });
    expect((await syncView(c)).snapshot.swapping.offers).toEqual([]);
    await trade(a, { kind: 'swap-ready', ready: true });
    await trade(b, { kind: 'swap-ready', ready: true });
    await trade(c, { kind: 'swap-ready', ready: true });
    expect((await syncView(a)).snapshot.swapping.closed).toBe(true);
  });

  it('resolves an entire vacancy chain, including an offline holder, before admitting a replacement', async () => {
    const [a, b, c] = await deal();
    await trade(a, { kind: 'swap-offer', target: 'seat-2' });
    await trade(c, { kind: 'swap-offer', target: 'seat-1' });
    c.socket.close();
    await accepted(b, { kind: 'seat-depart' });
    expect((await syncView(a)).viewer.viewerSeat).toBe('seat-2');
    const holders = await runtime.exec("SELECT user_id,seat FROM actors WHERE seat!='neutral' ORDER BY user_id");
    expect(holders).toEqual([
      { user_id: 'user-a', seat: 'seat-2' },
      { user_id: 'user-c', seat: 'seat-1' },
    ]);
    const request = await accepted(b, { kind: 'seat-request', seat: 'seat-3' });
    await accepted(a, { kind: 'seat-approve', requestId: ownRequest(request).id });
    expect((await syncView(b)).viewer.viewerSeat).toBe('seat-3');
    const audit = await runtime.exec(
      "SELECT round,command_id,actor_id,affected_id,kind FROM swap_audit WHERE kind IN ('swap-departure','swap-replacement') ORDER BY sequence"
    );
    expect(audit.map((row) => ({ actor: row.actor_id, affected: row.affected_id, kind: row.kind }))).toEqual([
      { actor: 'user-b', affected: 'user-b', kind: 'swap-departure' },
      { actor: 'user-a', affected: 'user-b', kind: 'swap-replacement' },
    ]);
    expect(audit.every((row) => row.round && row.command_id)).toBe(true);
  });

  it('restores an overdue deadline once and keeps trading closed after replacement', async () => {
    const [a, b] = await deal(2);
    await trade(a, { kind: 'swap-offer', target: 'seat-2' });
    await accepted(b, { kind: 'seat-depart' });
    await runtime.offline("UPDATE current_state SET data=json_set(data,'$.swapping.deadline',1)");
    const restored = await admit('a');
    const view = await syncView(restored);
    expect(view.snapshot.swapping.closed).toBe(true);
    expect(view.snapshot.swapping.offers).toEqual([]);
    expect(view.snapshot.swapping.deadline).toBe(1);
    const replacement = await admit('b');
    const request = await accepted(replacement, { kind: 'seat-request', seat: 'seat-1' });
    await accepted(restored, { kind: 'seat-approve', requestId: ownRequest(request).id });
    expect((await syncView(replacement)).snapshot.swapping.closed).toBe(true);
    await runtime.restart();
    await syncView(await admit('a'));
    expect(await runtime.exec("SELECT COUNT(*) AS count FROM swap_audit WHERE kind='swap-closed'")).toEqual([
      { count: 1 },
    ]);
  });
  it('rolls back every vacancy move and audit row when the receipt cannot commit', async () => {
    const [a, b, c] = await deal();
    await trade(a, { kind: 'swap-offer', target: 'seat-2' });
    await trade(c, { kind: 'swap-offer', target: 'seat-1' });
    const before = await runtime.exec('SELECT user_id,seat FROM actors ORDER BY user_id');
    await runtime.exec(
      "CREATE TRIGGER refuse_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'injected failure'); END"
    );
    expect((await sendCommand(b, { kind: 'seat-depart' })).reply.type).toBe('rejected');
    expect(await runtime.exec('SELECT user_id,seat FROM actors ORDER BY user_id')).toEqual(before);
    expect(await runtime.exec("SELECT COUNT(*) AS count FROM swap_audit WHERE kind='swap-move'")).toEqual([
      { count: 0 },
    ]);
    await runtime.exec('DROP TRIGGER refuse_receipt');
    await accepted(b, { kind: 'seat-depart' });
    expect((await syncView(a)).viewer.viewerSeat).toBe('seat-2');
  });

  it('keeps incoming offers attached to the seat when its occupant changes', async () => {
    const [a, b, c] = await deal();
    await trade(c, { kind: 'swap-offer', target: 'seat-1' });
    await trade(a, { kind: 'swap-offer', target: 'seat-2' });
    await trade(b, { kind: 'swap-offer', target: 'seat-1' });
    const view = await syncView(b);
    expect(view.viewer.viewerSeat).toBe('seat-1');
    const incoming = view.snapshot.swapping.offers.find((offer) => offer.origin === 'seat-3');
    expect(incoming.target).toBe('seat-1');
    await trade(b, { kind: 'swap-accept', offerId: incoming.id });
    expect((await syncView(c)).viewer.viewerSeat).toBe('seat-1');
    expect((await syncView(b)).viewer.viewerSeat).toBe('seat-3');
  });

  it('expires trading before a late command can create an offer', async () => {
    const [a] = await deal(2);
    const before = await syncView(a);
    await runtime.clock(240_001);
    const result = await sendCommand(a, {
      kind: 'swap-offer',
      round: before.snapshot.swapping.round,
      seat: 'seat-1',
      target: 'seat-2',
    });
    expect(result.reply.type).toBe('rejected');
    const after = await syncView(a);
    expect(after.snapshot.swapping.closed).toBe(true);
    expect(after.snapshot.swapping.offers).toEqual([]);
    expect(after.snapshot.swapping.deadline).toBe(before.snapshot.swapping.deadline);
  });
  it('orders competing moves across simultaneous vacancies and refuses a replacement whose target the chain filled', async () => {
    const [a, b] = await deal(4);
    await trade(b, { kind: 'swap-offer', target: 'seat-4' });
    await trade(a, { kind: 'swap-offer', target: 'seat-3' });
    const deadline = (await syncView(a)).snapshot.swapping.deadline;
    /* A restored assignment can contain several vacancies; the next command must settle all of them together. */
    await runtime.offline("UPDATE actors SET seat='neutral' WHERE user_id IN ('user-c','user-d')");
    const spectator = await admit('e');
    const requested = await accepted(spectator, { kind: 'seat-request', seat: 'seat-3' });
    const approver = await admit('a');
    expect((await syncView(approver)).viewer.viewerSeat).toBe('seat-3');
    expect(
      (await sendCommand(approver, { kind: 'seat-approve', requestId: ownRequest(requested).id })).reply
    ).toMatchObject({ type: 'rejected', message: 'That seat is no longer open.' });
    expect((await syncView(spectator)).viewer.viewerSeat).toBe('neutral');
    expect((await syncView(approver)).snapshot.swapping.deadline).toBe(deadline);
    expect(await runtime.exec("SELECT origin,target FROM swap_audit WHERE kind='swap-move' ORDER BY sequence")).toEqual(
      [
        { origin: 'seat-2', target: 'seat-4' },
        { origin: 'seat-1', target: 'seat-3' },
      ]
    );
  });
  it('settles a deletion vacancy and removes deleted identities from retained swap audit', async () => {
    const [a, b, c] = await deal();
    await trade(a, { kind: 'swap-offer', target: 'seat-2' });
    await trade(b, { kind: 'swap-offer', target: 'seat-3' });
    const response = await runtime.fetch('/__play/games/fixture-game/account-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: 'fixture-game',
        secret: 'a'.repeat(64),
        userId: 'user-b',
        eventId: 'deleted-b',
        deletionOperationId: 'delete-b',
      }),
    });
    expect(response.status).toBe(200);
    expect((await syncView(a)).viewer.viewerSeat).toBe('seat-2');
    expect((await syncView(c)).snapshot.swapping.offers).toEqual([]);
    expect(
      await runtime.exec(
        "SELECT COUNT(*) AS count FROM swap_audit WHERE actor_id='user-b' OR affected_id='user-b' OR reason LIKE '%Synthetic B%'"
      )
    ).toEqual([{ count: 0 }]);
    await runtime.restart();
    expect((await syncView(await admit('a'))).viewer.viewerSeat).toBe('seat-2');
  });
});
