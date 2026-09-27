import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cardPage, deckPage, slot } from './native-catalogue.fixture.mjs';
import {
  accepted,
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  provision,
  seat,
  sendCommand,
  syncView,
} from './native-runtime.fixture.mjs';

const CREATOR = { userId: 'user-a', displayName: 'Synthetic A' };

describe('Explicit participation on a real game', () => {
  let peer, runtime;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
    peer.expiresAt = () => Date.now() + 600_000;
    peer.game = { rulesetId: 'ruleset-one', minimumPlayers: 3, creator: CREATOR };
    const card = cardPage('card-one');
    const [treachery, spice] = [deckPage('treachery-deck', [card]), deckPage('spice-deck', [card], 5)];
    for (const page of [card, treachery, spice]) {
      peer.catalogue.set(`${page.asset.type}/${page.asset.slug}`, page);
    }
    peer.rulesets.set('ruleset-one', {
      ruleset: { id: 'ruleset-one', slug: 'classic', name: 'Classic' },
      slots: [slot('treachery', treachery), slot('spice', spice)],
    });
    runtime = await createRuntime(peer, 'game');
    if ((await provision(runtime)).status !== 200) {
      throw new Error('The real game did not provision.');
    }
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  const admit = (suffix) => admitPlayer(peer, runtime, suffix);
  const events = (view) => view.snapshot.table.events.map((event) => event.message);
  const pendingRequest = (view) => view.snapshot.controls.seatRequests[0];
  const ownRequest = (view) => view.snapshot.controls.seatRequests.find((request) => request.own);
  const deleteAccount = (userId) =>
    runtime.fetch('/__play/games/fixture-game/account-deletion', {
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

  const rejected = async (connection, action) => (await sendCommand(connection, action)).reply.message;

  it('seats a watching visitor only through a request one current player approves, in server order', async () => {
    const a = await admit('a');
    const b = await admit('b');
    expect((await syncView(b)).viewer.viewerSeat).toBe('neutral');
    expect((await syncView(a)).snapshot.controls.seats).toEqual(['seat-1']);

    /* A spectator cannot seat themselves: approval is a player's, and their own request is not theirs to grant. */
    const requested = await accepted(b, { kind: 'seat-request' });
    expect(pendingRequest(requested)).toEqual({
      id: 'seat-request-1',
      requesterName: 'Synthetic B',
      seat: null,
      own: true,
    });
    expect(pendingRequest(await syncView(a))).toEqual({
      id: 'seat-request-1',
      requesterName: 'Synthetic B',
      seat: null,
    });
    expect(await rejected(b, { kind: 'seat-request' })).toBe('You already asked for a seat.');
    expect(await rejected(b, { kind: 'seat-approve', requestId: 'seat-request-1' })).toBe(
      'Only a current player can approve a seat request.'
    );

    await accepted(a, { kind: 'seat-approve', requestId: 'seat-request-1' });
    const seated = await syncView(b);
    expect(seated.viewer.viewerSeat).toBe('seat-2');
    expect(seated.snapshot.roster).toEqual({
      seatCount: 3,
      seats: [
        { id: 'seat-1', position: 0, faction: null },
        { id: 'seat-2', position: 1, faction: null },
      ],
    });
    expect(seated.snapshot.controls.seats.sort()).toEqual(['seat-1', 'seat-2']);
    expect(seated.snapshot.controls.seatRequests).toEqual([]);
    expect(events(seated).slice(0, 2)).toEqual([
      'Synthetic B takes seat 2, approved by Synthetic A.',
      'Synthetic B asks for a seat.',
    ]);
    /* A second approval of the same request fails with the current state instead of seating anyone twice. */
    expect(await rejected(a, { kind: 'seat-approve', requestId: 'seat-request-1' })).toBe(
      'That seat request has already been resolved.'
    );
    expect(
      await runtime.exec("SELECT user_id, seat, event, cause, approver_name FROM seat_history WHERE user_id='user-b'")
    ).toEqual([
      { user_id: 'user-b', seat: 'seat-2', event: 'joined', cause: 'admission', approver_name: 'Synthetic A' },
    ]);
    /* The lobby learns the new seat from the same transaction. */
    await eventually(
      () => peer.summaries.some((request) => request.summary.seats.length === 2),
      'summary with two seats'
    );

    /* A drafting roster grows past the created minimum, one station per approved player. */
    await seat(await admit('c'), a);
    const fourth = await seat(await admit('d'), a);
    expect(fourth.viewer.viewerSeat).toBe('seat-4');
    expect(fourth.snapshot.roster.seatCount).toBe(4);
    expect(fourth.snapshot.roster.seats.map((seat) => seat.position)).toEqual([0, 1, 2, 3]);
  });

  it('fills one fixed seat once, keeps its faction for the replacement and takes it from the player who left', async () => {
    /* Seed a supplied setup table so this suite isolates fixed-seat replacement and bank privacy. */
    await runtime.exec(
      "UPDATE seats SET faction_id='house-a', faction_name='House A', faction_color='#111111' WHERE seat='seat-1'"
    );
    await runtime.exec(
      "INSERT INTO seats (seat, position, faction_id, faction_name, faction_color) VALUES('seat-2', 1, 'house-b', 'House B', '#222222')"
    );
    const [{ data }] = await runtime.exec('SELECT data FROM current_state WHERE id=1');
    const snapshot = JSON.parse(data);
    delete snapshot.roster;
    await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [
      JSON.stringify({ ...snapshot, stage: 'setup', factionBanks: { 'house-a': 10, 'house-b': 11 } }),
    ]);
    await runtime.exec("UPDATE metadata SET data=json_set(data, '$.seatCount', 2) WHERE id=1");
    await runtime.restart();

    const a = await admit('a');
    const b = await admit('b');
    const c = await admit('c');
    expect(await rejected(b, { kind: 'seat-request' })).toBe('Choose an open seat.');
    expect(await rejected(b, { kind: 'seat-request', seat: 'seat-1' })).toBe('That seat is no longer open.');
    const requestB = ownRequest(await accepted(b, { kind: 'seat-request', seat: 'seat-2' }));
    const requestC = ownRequest(await accepted(c, { kind: 'seat-request', seat: 'seat-2' }));
    expect((await syncView(a)).snapshot.controls.seatRequests.map((request) => request.requesterName)).toEqual([
      'Synthetic B',
      'Synthetic C',
    ]);

    await accepted(a, { kind: 'seat-approve', requestId: requestB.id });
    const seatedB = await syncView(b);
    expect(seatedB.viewer).toMatchObject({ viewerSeat: 'seat-2', color: '#222222' });
    expect(seatedB.snapshot.bank).toEqual({ factionId: 'house-b', balance: 11 });
    /* The competing approval fails against the current seating; its request stays for another vacancy. */
    expect(await rejected(a, { kind: 'seat-approve', requestId: requestC.id })).toBe('That seat is no longer open.');
    expect((await syncView(a)).snapshot.controls.seatRequests).toHaveLength(1);

    /* Leaving keeps the seat and its faction; the former player watches without the bank they held. */
    const left = await accepted(b, { kind: 'seat-depart' });
    expect(left.viewer.viewerSeat).toBe('neutral');
    expect(left.snapshot.bank).toBeUndefined();
    expect(JSON.stringify(left)).not.toContain('"balance":11');
    expect(left.snapshot.roster.seats[1]).toEqual({
      id: 'seat-2',
      position: 1,
      faction: { id: 'house-b', name: 'House B', color: '#222222' },
    });
    expect((await sendCommand(b, { kind: 'bank-withdraw', amount: 1 })).reply.type).toBe('rejected');

    await accepted(a, { kind: 'seat-approve', requestId: requestC.id });
    const seatedC = await syncView(c);
    expect(seatedC.viewer.viewerSeat).toBe('seat-2');
    expect(seatedC.snapshot.bank).toEqual({ factionId: 'house-b', balance: 11 });
    expect(
      await runtime.exec("SELECT user_id, event, cause FROM seat_history WHERE seat='seat-2' ORDER BY id")
    ).toEqual([
      { user_id: 'user-b', event: 'joined', cause: 'admission' },
      { user_id: 'user-b', event: 'vacated', cause: 'departure' },
      { user_id: 'user-c', event: 'joined', cause: 'admission' },
    ]);
  });

  it('keeps an offline player seated, retires a drafting place on departure and discards the game when the last player leaves', async () => {
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    b.socket.close();
    await eventually(() => b.closed, 'disconnected');
    expect((await syncView(a)).snapshot.controls.seats.sort()).toEqual(['seat-1', 'seat-2']);
    const returning = await admit('b');
    expect((await syncView(returning)).viewer.viewerSeat).toBe('seat-2');

    /* The requester's own request is marked on every tab of theirs and on nobody else's. */
    expect(pendingRequest(await accepted(await admit('c'), { kind: 'seat-request' })).own).toBe(true);
    const c = await admit('c');
    expect(pendingRequest(await syncView(c)).own).toBe(true);
    expect(pendingRequest(await syncView(a)).own).toBeUndefined();
    expect((await accepted(c, { kind: 'seat-withdraw' })).snapshot.controls.seatRequests).toEqual([]);

    const left = await accepted(returning, { kind: 'seat-depart' });
    expect(left.snapshot.roster.seats).toEqual([{ id: 'seat-1', position: 0, faction: null }]);
    expect(left.snapshot.stage).toBe('drafting');
    /* A later admission never reuses the retired place's number. */
    expect((await seat(returning, a)).viewer.viewerSeat).toBe('seat-3');
    await accepted(returning, { kind: 'seat-depart' });

    const request = ownRequest(await accepted(c, { kind: 'seat-request' }));
    const discarded = await accepted(a, { kind: 'seat-depart' });
    expect(discarded.snapshot.stage).toBe('discarded');
    expect(discarded.snapshot.controls.seats).toEqual([]);
    expect(discarded.snapshot.controls.seatRequests).toEqual([]);
    expect(events(discarded).slice(0, 2)).toEqual([
      'The game was discarded: no players remain.',
      'Synthetic A left seat 1.',
    ]);
    expect(await rejected(c, { kind: 'seat-request' })).toBe('This game was discarded.');
    expect(await rejected(a, { kind: 'seat-approve', requestId: request.id })).toBe('This game was discarded.');
    await eventually(() => peer.summaries.at(-1)?.summary.stage === 'discarded', 'discarded summary');
    await runtime.restart();
    expect((await syncView(await admit('c'))).snapshot.stage).toBe('discarded');
  });

  it('follows account deletion: the request closes, the seat empties with a scrubbed record and the last deletion discards', async () => {
    const a = await admit('a');
    const b = await admit('b');
    await accepted(b, { kind: 'seat-request' });
    expect((await deleteAccount('user-b')).status).toBe(200);
    expect((await syncView(a)).snapshot.controls.seatRequests).toEqual([]);
    expect(events(await syncView(a))[0]).toBe('[deleted user] asks for a seat.');

    const c = await admit('c');
    const observer = await admit('d');
    await seat(c, a);
    expect((await deleteAccount('user-c')).status).toBe(200);
    await eventually(() => c.closed, 'deleted socket closed');
    const afterC = await syncView(observer);
    expect(afterC.snapshot.controls.seats).toEqual(['seat-1']);
    expect(afterC.snapshot.roster.seats.map((seat) => seat.id)).toEqual(['seat-1']);
    expect(events(afterC).slice(0, 2)).toEqual([
      '[deleted user] left seat 2.',
      '[deleted user] takes seat 2, approved by Synthetic A.',
    ]);
    expect(
      await runtime.exec("SELECT user_id, display_name, cause FROM seat_history WHERE seat='seat-2' ORDER BY id")
    ).toEqual([
      { user_id: null, display_name: '[deleted user]', cause: 'admission' },
      { user_id: null, display_name: '[deleted user]', cause: 'deletion' },
    ]);

    expect((await deleteAccount('user-a')).status).toBe(200);
    const afterA = await syncView(observer);
    expect(afterA.snapshot.stage).toBe('discarded');
    expect(events(afterA).slice(0, 2)).toEqual([
      'The game was discarded: no players remain.',
      '[deleted user] left seat 1.',
    ]);
    expect(JSON.stringify(afterA)).not.toContain('Synthetic A');
    expect(JSON.stringify(await runtime.exec('SELECT data FROM history'))).not.toContain('Synthetic C');
    await runtime.restart();
    const restored = await syncView(await admit('d'));
    expect(restored.snapshot.stage).toBe('discarded');
    expect(JSON.stringify(restored)).not.toContain('Synthetic C');
  });
});
