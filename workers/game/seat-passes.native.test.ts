import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { arrakisBoardCapture } from '../../src/shared/play/fixtures/board';
import type { PieceAction } from '../../src/shared/play/protocol';
import { ADMISSION_REFUSED_CLOSE_CODE, TICKET_EXPIRED_CLOSE_CODE } from '../../src/shared/play/protocol';
import { PLAY_SEAT_LIMIT_MESSAGE } from '../../src/shared/play/seatLimit';
import { cardPage, deckPage, slot } from './native-catalogue.fixture.ts';
import type { NativeConnection, NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import {
  admitPlayer,
  admitWithPass,
  createPeer,
  createRuntime,
  eventually,
  fixturePass,
  openGame,
  provision,
  pushSessionCutoff,
  required,
  sendCommand,
  syncView,
} from './native-runtime.fixture.ts';

describe('Seat passes admit players without the room asking Convex about them', () => {
  let peer: NativePeer, runtime: NativeRuntime;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
    peer.expiresAt = () => Date.now() + 600_000;
    peer.game = {
      rulesetId: 'ruleset-one',
      minimumPlayers: 3,
      creator: { userId: 'user-a', displayName: 'Synthetic A' },
    };
    const card = cardPage('card-one');
    const [treachery, spice] = [deckPage('treachery-deck', [card]), deckPage('spice-deck', [card], 5)];
    for (const page of [card, treachery, spice]) {
      peer.catalogue.set(`${page.asset.type}/${page.asset.slug}`, page);
    }
    peer.rulesets.set('ruleset-one', {
      board: arrakisBoardCapture,
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

  const calls = (name: string) => peer.requests.filter((request) => request.function === name);
  const admissionStatuses = (connection: NativeConnection) =>
    connection.messages.flatMap((message) => (message.type === 'admission' ? [message.status] : []));
  const rejected = async (connection: NativeConnection, action: PieceAction) => {
    const { reply } = await sendCommand(connection, action);
    expect(reply.type).toBe('rejected');
    return required(reply.type === 'rejected' ? reply.message : undefined);
  };
  async function refusedWith(raw: Promise<string>) {
    const connection = await openGame(runtime);
    connection.send({ type: 'admit', supportsBoard: true, pass: await raw });
    await eventually(() => connection.closed, 'refused socket closed');
    return connection;
  }

  it('seats the creator from a pass and plays with no ticket, watch or account check', async () => {
    const a = await admitWithPass(runtime, 'a');
    const view = await syncView(a);
    expect(view.viewer).toMatchObject({ userId: 'user-a', displayName: 'Synthetic A', viewerSeat: 'seat-1' });
    await eventually(() => calls('playAdmission:seatLimitReached').length === 1, 'seat-limit read');
    expect(calls('playAdmission:seatLimitReached')[0]?.args).toMatchObject({
      gameId: 'fixture-game',
      userId: 'user-a',
    });
    for (const name of [
      'playAdmission:redeemTicket',
      'playAdmission:watchAuthorizations',
      'playAdmission:reconcileAccounts',
    ]) {
      expect(calls(name)).toEqual([]);
    }
    expect(peer.connections).toEqual([]);
  });

  it('refuses a forged pass, one for another game, and closes an expired one as a ticket that ran out', async () => {
    const forged = await refusedWith(fixturePass('b', {}, 'b'.repeat(64)));
    expect(forged.closeCode).toBe(ADMISSION_REFUSED_CLOSE_CODE);
    const elsewhere = await refusedWith(fixturePass('b', { gameId: 'another-game' }));
    expect(elsewhere.closeCode).toBe(ADMISSION_REFUSED_CLOSE_CODE);
    const expired = await refusedWith(fixturePass('b', { exp: Date.now() - 1 }));
    expect(expired.closeCode).toBe(TICKET_EXPIRED_CLOSE_CODE);
  });

  it('keeps a player admitted at the seat limit from asking for a seat until the read answers', async () => {
    await admitWithPass(runtime, 'a');
    peer.seatLimitReached.add('user-b');
    const b = await admitWithPass(runtime, 'b');
    expect(await rejected(b, { kind: 'seat-request' })).toBe(PLAY_SEAT_LIMIT_MESSAGE);

    /* Until Convex answers, an unknown count reads as the limit. */
    peer.seatLimitMode = 'hold';
    const c = await admitWithPass(runtime, 'c');
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
    const a = await admitWithPass(runtime, 'a', { sessionCreatedAt: createdAt });
    const b = await admitWithPass(runtime, 'b', { sessionCreatedAt: createdAt });
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
    const fresh = await admitWithPass(runtime, 'a', { sessionId: 'session-a2', sessionCreatedAt: createdAt + 2 });
    expect((await syncView(fresh)).viewer.viewerSeat).toBe('seat-1');
  });

  it('pauses a tab whose pass runs out and resumes it on a renewal of the same account', async () => {
    const a = await admitWithPass(runtime, 'a');
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
    const a = await admitWithPass(runtime, 'a');
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

  it('plays a pass tab beside a ticket tab of an older browser', async () => {
    await admitWithPass(runtime, 'a');
    const b = await admitPlayer(peer, runtime, 'b');
    expect((await syncView(b)).viewer.userId).toBe('user-b');
    expect(calls('playAdmission:redeemTicket')).toHaveLength(1);
  });
});
