import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { ADMISSION_REFUSED_CLOSE_CODE, PASS_EXPIRED_CLOSE_CODE } from '../../src/shared/play/protocol';
import { PLAY_SEAT_LIMIT_MESSAGE } from '../../src/shared/play/seatLimit';
import { realGame, rejected } from './native-real-game.fixture.ts';
import type { NativeConnection, NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import {
  admitPlayer,
  eventually,
  fixturePass,
  openGame,
  pushSessionCutoff,
  sendCommand,
  syncView,
} from './native-runtime.fixture.ts';

describe('Seat passes admit players without the room asking Convex about them', () => {
  let peer: NativePeer, runtime: NativeRuntime;
  beforeEach(async () => {
    ({ peer, runtime } = await realGame());
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  const calls = (name: string) => peer.requests.filter((request) => request.function === name);
  const admissionStatuses = (connection: NativeConnection) =>
    connection.messages.flatMap((message) => (message.type === 'admission' ? [message.status] : []));
  async function refusedWith(raw: Promise<string>) {
    const connection = await openGame(runtime);
    connection.send({ type: 'admit', supportsBoard: true, pass: await raw });
    await eventually(() => connection.closed, 'refused socket closed');
    return connection;
  }

  it('seats the creator from a pass and asks Convex only for the seat limit', async () => {
    const a = await admitPlayer(runtime, 'a');
    const view = await syncView(a);
    expect(view.viewer).toMatchObject({ userId: 'user-a', displayName: 'Synthetic A', viewerSeat: 'seat-1' });
    await eventually(() => calls('playAdmission:seatLimitReached').length === 1, 'seat-limit read');
    expect(calls('playAdmission:seatLimitReached')[0]?.args).toMatchObject({
      gameId: 'fixture-game',
      userId: 'user-a',
    });
    const before = peer.requests.length;
    await syncView(await admitPlayer(runtime, 'b'));
    await eventually(() => calls('playAdmission:seatLimitReached').length === 2, 'second seat-limit read');
    expect(peer.requests.slice(before).map((request) => request.function)).toEqual(['playAdmission:seatLimitReached']);
  });

  it('refuses a forged pass, one for another game, and closes an expired one without a refusal', async () => {
    const forged = await refusedWith(fixturePass('b', {}, 'b'.repeat(64)));
    expect(forged.closeCode).toBe(ADMISSION_REFUSED_CLOSE_CODE);
    const elsewhere = await refusedWith(fixturePass('b', { gameId: 'another-game' }));
    expect(elsewhere.closeCode).toBe(ADMISSION_REFUSED_CLOSE_CODE);
    const expired = await refusedWith(fixturePass('b', { exp: Date.now() - 1 }));
    expect(expired.closeCode).toBe(PASS_EXPIRED_CLOSE_CODE);
  });

  it('keeps a player admitted at the seat limit from asking for a seat until the read answers', async () => {
    await admitPlayer(runtime, 'a');
    peer.seatLimitReached.add('user-b');
    const b = await admitPlayer(runtime, 'b');
    expect(await rejected(b, { kind: 'seat-request' })).toBe(PLAY_SEAT_LIMIT_MESSAGE);

    /* Until Convex answers, an unknown count reads as the limit. */
    peer.seatLimitMode = 'hold';
    const c = await admitPlayer(runtime, 'c');
    expect(await rejected(c, { kind: 'seat-request' })).toBe(PLAY_SEAT_LIMIT_MESSAGE);
    const held = await eventually(() => calls('playAdmission:seatLimitReached').at(-1), 'held read');
    held.release({ ok: true, reached: false });
    await eventually(async () => {
      const { reply } = await sendCommand(c, { kind: 'seat-request' });
      return reply.type !== 'rejected';
    }, 'seat request after the answer');
  });

  it('ends every tab of a signed-out session at the pushed cutoff, keeps it and acknowledges the cutoff held', async () => {
    const createdAt = Date.now() - 10_000;
    const a = await admitPlayer(runtime, 'a', { sessionCreatedAt: createdAt });
    const b = await admitPlayer(runtime, 'b', { sessionCreatedAt: createdAt });
    const response = await pushSessionCutoff(runtime, 'user-a', createdAt + 1);
    expect(response.status).toBe(200);
    await eventually(() => a.closed, 'signed-out tab closed');
    expect(a.closeCode).toBe(ADMISSION_REFUSED_CLOSE_CODE);
    expect(b.closed).toBe(false);
    expect(calls('playSessionCutoffs:ackSessionCutoff').at(-1)?.args).toMatchObject({
      eventId: 'cutoff-1',
      through: createdAt + 1,
    });

    /* A late, older cutoff never lowers the one held, and the ack says which one is held. */
    expect((await pushSessionCutoff(runtime, 'user-a', createdAt - 5000, 'cutoff-0')).status).toBe(200);
    expect(calls('playSessionCutoffs:ackSessionCutoff').at(-1)?.args).toMatchObject({
      eventId: 'cutoff-0',
      through: createdAt + 1,
    });

    /* A copied pass of the old session stays out, across a restart; a session signed in after the cutoff enters. */
    await runtime.restart();
    const copied = await refusedWith(fixturePass('a', { sessionCreatedAt: createdAt }));
    expect(copied.closeCode).toBe(ADMISSION_REFUSED_CLOSE_CODE);
    const fresh = await admitPlayer(runtime, 'a', { sessionId: 'session-a2', sessionCreatedAt: createdAt + 2 });
    expect((await syncView(fresh)).viewer.viewerSeat).toBe('seat-1');
  });

  it('pauses a tab whose pass runs out and resumes it on a renewal of the same account', async () => {
    const a = await admitPlayer(runtime, 'a', { exp: Date.now() + 60_000 });
    await runtime.clock(70_000);
    await eventually(() => admissionStatuses(a).includes('pass-expired'), 'pass-expired notice');
    expect(a.closed).toBe(false);
    const before = a.messages.length;
    a.send({ type: 'pass', pass: await fixturePass('a', { exp: Date.now() + 200_000 }) });
    const resumed = await eventually(
      () => a.messages.slice(before).find((message) => message.type === 'view'),
      'view after renewal'
    );
    expect(resumed.type === 'view' && resumed.viewer.viewerSeat).toBe('seat-1');
  });

  it('refuses a renewal that names another account', async () => {
    const a = await admitPlayer(runtime, 'a');
    a.send({ type: 'pass', pass: await fixturePass('b') });
    await eventually(() => a.closed, 'socket closed on a foreign renewal');
    expect(a.closeCode).toBe(ADMISSION_REFUSED_CLOSE_CODE);
  });

  it('keeps out a pass of an account deleted before it ever entered this room', async () => {
    const response = await runtime.fetch('/__play/games/fixture-game/account-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: 'fixture-game',
        secret: 'a'.repeat(64),
        userId: 'user-z',
        eventId: 'deletion-user-z',
        deletionOperationId: 'operation-user-z',
      }),
    });
    expect(response.status).toBe(200);
    const late = await refusedWith(fixturePass('z'));
    expect(late.closeCode).toBe(ADMISSION_REFUSED_CLOSE_CODE);
  });

  it('reconnects rather than refuses a renewal that seats the same account as another actor', async () => {
    const a = await admitPlayer(runtime, 'a');
    a.send({ type: 'pass', pass: await fixturePass('a', { actorId: 'user-merged' }) });
    await eventually(() => a.closed, 'socket closed on an actor change');
    expect(a.closeCode).toBe(1012);
    expect(admissionStatuses(a)).not.toContain('denied');
  });

  it('keeps a player at the seat limit while the seat-limit read fails, and retries it', async () => {
    peer.seatLimitMode = 'error';
    const c = await admitPlayer(runtime, 'c');
    expect(await rejected(c, { kind: 'seat-request' })).toBe(PLAY_SEAT_LIMIT_MESSAGE);
    await eventually(() => calls('playAdmission:seatLimitReached').length >= 2, 'retried read');
    expect(await rejected(c, { kind: 'seat-request' })).toBe(PLAY_SEAT_LIMIT_MESSAGE);
  });
});
