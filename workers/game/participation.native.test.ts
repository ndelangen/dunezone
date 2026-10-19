import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { PLAY_SEAT_LIMIT_APPROVAL_MESSAGE, PLAY_SEAT_LIMIT_MESSAGE } from '../../src/shared/play/seatLimit';
import { realGame, rejected } from './native-real-game.fixture.ts';
import { readHistoricalSnapshot } from './native-runtime.fixture.ts';
import type { NativeView } from './native-runtime.fixture.ts';
import { required } from './native-runtime.fixture.ts';
import type { NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import {
  accepted,
  admitPlayer,
  eventually,
  seat,
  sendCommand,
  storedEventMessages,
  syncView,
} from './native-runtime.fixture.ts';

describe('Explicit participation on a real game', () => {
  let peer: NativePeer, runtime: NativeRuntime;
  beforeEach(async () => {
    ({ peer, runtime } = await realGame());
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  const admit = (suffix: string) => admitPlayer(peer, runtime, suffix);
  const events = (view: NativeView) => view.snapshot.table.events.map((event) => event.message);
  const pendingRequest = (view: NativeView) => required(view.snapshot.controls).seatRequests[0];
  const ownRequest = (view: NativeView) => required(view.snapshot.controls).seatRequests.find((request) => request.own);
  const deleteAccount = (userId: string) =>
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

  it('seats a watching visitor only through a request one current player approves, in server order', async () => {
    const a = await admit('a');
    const b = await admit('b');
    expect((await syncView(b)).viewer.viewerSeat).toBe('neutral');
    expect(required(required(await syncView(a)).snapshot.controls).seats).toEqual(['seat-1']);

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
    expect(required(seated.snapshot.controls).seats.sort()).toEqual(['seat-1', 'seat-2']);
    expect(required(seated.snapshot.controls).seatRequests).toEqual([]);
    expect(events(seated).slice(0, 2)).toEqual([
      'Seat 2 is taken, approved by seat 1.',
      'A spectator asks for a seat.',
    ]);
    /* Table events name seats, so no stored event, current or retained, carries a player's name. */
    expect(
      (await storedEventMessages(runtime)).filter((message: string | string[]) => message.includes('Synthetic'))
    ).toEqual([]);
    /* A second approval of the same request fails with the current state instead of seating anyone twice. */
    expect(await rejected(a, { kind: 'seat-approve', requestId: 'seat-request-1' })).toBe(
      'That seat request has already been resolved.'
    );
    expect(
      await runtime.exec<{ user_id: string; seat: string; event: string; cause: string; approver_name: number }>(
        "SELECT user_id, seat, event, cause, approver_name FROM seat_history WHERE user_id='user-b'"
      )
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
    expect(required(fourth.snapshot.roster).seatCount).toBe(4);
    expect(required(fourth.snapshot.roster).seats.map((seat) => seat.position)).toEqual([0, 1, 2, 3]);
  });

  it('refuses a seat request, and its approval, from a player admitted at the seat limit', async () => {
    const a = await admit('a');
    peer.seatLimitReached.add('user-b');
    const b = await admit('b');
    expect(await rejected(b, { kind: 'seat-request' })).toBe(PLAY_SEAT_LIMIT_MESSAGE);
    expect(required(required(await syncView(a)).snapshot.controls).seatRequests).toEqual([]);

    /* A player under the limit asks as before. */
    const c = await admit('c');
    const request = pendingRequest(await accepted(c, { kind: 'seat-request' }));
    expect(request).toMatchObject({ requesterName: 'Synthetic C', seat: null });

    /* A request filed before the limit was reached is refused at approval while a tab of the requester's was admitted at it. */
    peer.seatLimitReached.add('user-c');
    const limited = await admit('c');
    expect(await rejected(a, { kind: 'seat-approve', requestId: request.id })).toBe(PLAY_SEAT_LIMIT_APPROVAL_MESSAGE);
    expect((await syncView(c)).viewer.viewerSeat).toBe('neutral');

    /* Once no connection of theirs reports the limit, the approval goes through. */
    limited.socket.close();
    await eventually(() => limited.closed, 'limited tab closed');
    await accepted(a, { kind: 'seat-approve', requestId: request.id });
    expect((await syncView(c)).viewer.viewerSeat).toBe('seat-2');
  });

  it('fills one fixed seat once, keeps its faction for the replacement and takes it from the player who left', async () => {
    /* Seed a supplied setup table so this suite isolates fixed-seat replacement and spice reserve privacy. */
    await runtime.exec(
      "UPDATE seats SET faction_id='house-a', faction_name='House A', faction_color='#111111' WHERE seat='seat-1'"
    );
    await runtime.exec(
      "INSERT INTO seats (seat, position, faction_id, faction_name, faction_color) VALUES('seat-2', 1, 'house-b', 'House B', '#222222')"
    );
    const [{ data }] = await runtime.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1');
    const snapshot = readHistoricalSnapshot(data);
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
    expect(
      required(required(await syncView(a)).snapshot.controls).seatRequests.map((request) => request.requesterName)
    ).toEqual(['Synthetic B', 'Synthetic C']);

    await accepted(a, { kind: 'seat-approve', requestId: required(requestB).id });
    const seatedB = await syncView(b);
    expect(seatedB.viewer).toMatchObject({ viewerSeat: 'seat-2', color: '#222222' });
    expect(seatedB.snapshot.bank).toEqual({ factionId: 'house-b', balance: 11 });
    /* The competing approval fails against the current seating; its request stays for another vacancy. */
    expect(await rejected(a, { kind: 'seat-approve', requestId: required(requestC).id })).toBe(
      'That seat is no longer open.'
    );
    expect(required(required(await syncView(a)).snapshot.controls).seatRequests).toHaveLength(1);

    /* Leaving keeps the seat and its faction; the former player watches without the spice reserve they held. */
    const left = await accepted(b, { kind: 'seat-depart' });
    expect(left.viewer.viewerSeat).toBe('neutral');
    expect(left.snapshot.bank).toBeUndefined();
    expect(JSON.stringify(left)).not.toContain('"balance":11');
    expect(required(left.snapshot.roster).seats[1]).toEqual({
      id: 'seat-2',
      position: 1,
      faction: { id: 'house-b', name: 'House B', color: '#222222' },
    });
    expect((await sendCommand(b, { kind: 'bank-withdraw', amount: 1 })).reply.type).toBe('rejected');

    await accepted(a, { kind: 'seat-approve', requestId: required(requestC).id });
    const seatedC = await syncView(c);
    expect(seatedC.viewer.viewerSeat).toBe('seat-2');
    expect(seatedC.snapshot.bank).toEqual({ factionId: 'house-b', balance: 11 });
    expect(
      await runtime.exec<{ user_id: string; event: string; cause: string }>(
        "SELECT user_id, event, cause FROM seat_history WHERE seat='seat-2' ORDER BY id"
      )
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
    expect(required(required(await syncView(a)).snapshot.controls).seats.sort()).toEqual(['seat-1', 'seat-2']);
    const returning = await admit('b');
    expect((await syncView(returning)).viewer.viewerSeat).toBe('seat-2');

    /* The requester's own request is marked on every tab of theirs and on nobody else's. */
    expect(pendingRequest(await accepted(await admit('c'), { kind: 'seat-request' })).own).toBe(true);
    const c = await admit('c');
    expect(pendingRequest(await syncView(c)).own).toBe(true);
    expect(pendingRequest(await syncView(a)).own).toBeUndefined();
    expect(required(required(await accepted(c, { kind: 'seat-withdraw' })).snapshot.controls).seatRequests).toEqual([]);
    expect(
      (await storedEventMessages(runtime)).filter((message: string | string[]) => message.includes('Synthetic'))
    ).toEqual([]);

    const left = await accepted(returning, { kind: 'seat-depart' });
    expect(required(left.snapshot.roster).seats).toEqual([{ id: 'seat-1', position: 0, faction: null }]);
    expect(left.snapshot.stage).toBe('drafting');
    /* A later admission never reuses the retired place's number. */
    expect((await seat(returning, a)).viewer.viewerSeat).toBe('seat-3');
    await accepted(returning, { kind: 'seat-depart' });

    const request = ownRequest(await accepted(c, { kind: 'seat-request' }));
    const discarded = await accepted(a, { kind: 'seat-depart' });
    expect(discarded.snapshot.stage).toBe('discarded');
    expect(required(discarded.snapshot.controls).seats).toEqual([]);
    expect(required(discarded.snapshot.controls).seatRequests).toEqual([]);
    expect(events(discarded).slice(0, 2)).toEqual(['The game was discarded: no players remain.', 'Seat 1 is vacated.']);
    expect(await rejected(c, { kind: 'seat-request' })).toBe('This game was discarded.');
    expect(await rejected(a, { kind: 'seat-approve', requestId: required(request).id })).toBe(
      'This game was discarded.'
    );
    await eventually(() => peer.summaries.at(-1)?.summary.stage === 'discarded', 'discarded summary');
    await runtime.restart();
    expect((await syncView(await admit('c'))).snapshot.stage).toBe('discarded');
  });

  it('follows account deletion: the request closes, the seat empties with a scrubbed record and the last deletion discards', async () => {
    const a = await admit('a');
    const b = await admit('b');
    await accepted(b, { kind: 'seat-request' });
    expect((await deleteAccount('user-b')).status).toBe(200);
    expect(required(required(await syncView(a)).snapshot.controls).seatRequests).toEqual([]);
    expect(events(await syncView(a))[0]).toBe('A spectator asks for a seat.');

    const c = await admit('c');
    const observer = await admit('d');
    await seat(c, a);
    expect((await deleteAccount('user-c')).status).toBe(200);
    await eventually(() => c.closed, 'deleted socket closed');
    const afterC = await syncView(observer);
    expect(required(afterC.snapshot.controls).seats).toEqual(['seat-1']);
    expect(required(afterC.snapshot.roster).seats.map((seat) => seat.id)).toEqual(['seat-1']);
    expect(events(afterC).slice(0, 2)).toEqual(['Seat 2 is vacated.', 'Seat 2 is taken, approved by seat 1.']);
    expect(
      await runtime.exec<{ user_id: string; display_name: string; cause: string }>(
        "SELECT user_id, display_name, cause FROM seat_history WHERE seat='seat-2' ORDER BY id"
      )
    ).toEqual([
      { user_id: null, display_name: '[deleted user]', cause: 'admission' },
      { user_id: null, display_name: '[deleted user]', cause: 'deletion' },
    ]);

    expect((await deleteAccount('user-a')).status).toBe(200);
    const afterA = await syncView(observer);
    expect(afterA.snapshot.stage).toBe('discarded');
    expect(events(afterA).slice(0, 2)).toEqual(['The game was discarded: no players remain.', 'Seat 1 is vacated.']);
    expect(JSON.stringify(afterA)).not.toContain('Synthetic A');
    expect(JSON.stringify(await runtime.exec<{ data: string }>('SELECT data FROM history'))).not.toContain(
      'Synthetic C'
    );
    await runtime.restart();
    const restored = await syncView(await admit('d'));
    expect(restored.snapshot.stage).toBe('discarded');
    expect(JSON.stringify(restored)).not.toContain('Synthetic C');
  });
});
